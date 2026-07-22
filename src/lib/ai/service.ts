import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

/**
 * Generate embedding vector for a given text using Gemini Embeddings API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/gemini-embedding-2',
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768,
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini embedding failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  return data.embedding.values
}

/**
 * Query Supabase for relevant context chunks from the knowledge base
 */
export async function getRelevantContext(text: string, accountId: string): Promise<string> {
  try {
    const embedding = await generateEmbedding(text)
    const { data: matches, error } = await supabaseAdmin().rpc('match_knowledge_base', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
      p_account_id: accountId
    })

    if (error || !matches) {
      console.error('[AI RAG] Search failed:', error)
      return ''
    }

    return matches.map((m: { title: string; content: string }) => `[${m.title}]: ${m.content}`).join('\n\n')
  } catch (error) {
    console.error('[AI RAG] Failed to extract context:', error)
    return ''
  }
}

/**
 * Helper function to load AI configuration for a given account
 */
export async function getAccountAIConfig(accountId: string) {
  const { data, error } = await supabaseAdmin()
    .from('accounts')
    .select('ai_provider, ai_model, ai_api_key, ai_api_url')
    .eq('id', accountId)
    .maybeSingle()

  if (error || !data) {
    const provider = 'gemini'
    let defaultKey = undefined
    if (provider === 'gemini') {
      defaultKey = process.env.GEMINI_API_KEY
    } else if (provider === 'openai') {
      defaultKey = process.env.OPENAI_API_KEY
    } else if (provider === 'anthropic') {
      defaultKey = process.env.ANTHROPIC_API_KEY
    } else if (provider === 'openrouter') {
      defaultKey = process.env.OPENROUTER_API_KEY
    }

    return {
      provider,
      model: provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'openai' ? 'gpt-4o' : provider === 'anthropic' ? 'claude-3-5-sonnet' : 'meta-llama/llama-3-8b-instruct',
      apiKey: defaultKey,
      apiUrl: null
    }
  }
    
  const provider = data.ai_provider || 'gemini'
  let defaultKey = undefined
  if (provider === 'gemini') {
    defaultKey = process.env.GEMINI_API_KEY
  } else if (provider === 'openai') {
    defaultKey = process.env.OPENAI_API_KEY
  } else if (provider === 'anthropic') {
    defaultKey = process.env.ANTHROPIC_API_KEY
  } else if (provider === 'openrouter') {
    defaultKey = process.env.OPENROUTER_API_KEY
  }

  return {
    provider,
    model: data.ai_model || (provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'openai' ? 'gpt-4o' : provider === 'anthropic' ? 'claude-3-5-sonnet' : 'meta-llama/llama-3-8b-instruct'),
    apiKey: data.ai_api_key ? decrypt(data.ai_api_key) : defaultKey,
    apiUrl: data.ai_api_url || null
  }
}

/**
 * ponytail: execute single completion API call, isolated from failover retry loops
 */
async function executeSingleLLMCompletion(
  provider: string,
  model: string,
  apiKey: string,
  apiUrl: string | null,
  messages: Array<{ role: string; content: string }>,
  systemInstruction: string,
  responseFormat?: 'json' | 'text',
  responseSchema?: any
): Promise<string> {
  const modelName = model.startsWith('models/') ? model.replace('models/', '') : model

  if (provider === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          systemInstruction: {
            parts: [
              {
                text: systemInstruction
              }
            ]
          },
          generationConfig: {
            responseMimeType: responseFormat === 'json' ? 'application/json' : 'text/plain',
            ...(responseFormat === 'json' && responseSchema ? { responseSchema } : {})
          }
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini generateContent failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  if (provider === 'openai' || provider === 'openrouter') {
    const url = apiUrl || (provider === 'openai' 
      ? 'https://api.openai.com/v1/chat/completions' 
      : 'https://openrouter.ai/api/v1/chat/completions')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          ...messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
          }))
        ],
        response_format: responseFormat === 'json' ? { type: 'json_object' } : undefined
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${provider} chat completions failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  if (provider === 'anthropic') {
    let system = systemInstruction
    if (responseFormat === 'json') {
      system += "\n\nCRITICAL: You must return ONLY a raw JSON object. Do not wrap the JSON in markdown blocks (like ```json) or include any conversational prefix/suffix. The response must start with '{' and end with '}'."
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        system,
        messages: messages.map(m => ({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content
        })),
        max_tokens: 4096
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic messages failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.content?.[0]?.text || ''
  }

  throw new Error(`Unsupported AI provider: ${provider}`)
}

/**
 * Dynamically dispatch LLM completions to Gemini, OpenAI, OpenRouter, or Anthropic with failover support
 */
export async function dispatchLLMCompletion(
  messages: Array<{ role: string; content: string }>,
  systemInstruction: string,
  accountId: string,
  responseFormat?: 'json' | 'text',
  responseSchema?: any
): Promise<string> {
  const config = await getAccountAIConfig(accountId)

  // ponytail: define the execution attempt priority queue
  const attempts: Array<{ provider: string; model: string; apiKey: string | undefined; apiUrl: string | null }> = [
    { provider: config.provider, model: config.model, apiKey: config.apiKey, apiUrl: config.apiUrl }
  ]

  // Add same-provider alternatives
  if (config.provider === 'gemini') {
    if (config.model !== 'gemini-2.5-flash') {
      attempts.push({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: config.apiKey, apiUrl: config.apiUrl })
    }
    attempts.push({ provider: 'gemini', model: 'gemini-2.5-pro', apiKey: config.apiKey, apiUrl: config.apiUrl })
    
    // Cross-provider backup using platform standard OpenAI key
    if (process.env.OPENAI_API_KEY) {
      attempts.push({ provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY, apiUrl: null })
    }
  } else if (config.provider === 'openai') {
    if (config.model !== 'gpt-4o-mini') {
      attempts.push({ provider: 'openai', model: 'gpt-4o-mini', apiKey: config.apiKey, apiUrl: config.apiUrl })
    }
    attempts.push({ provider: 'openai', model: 'gpt-4o', apiKey: config.apiKey, apiUrl: config.apiUrl })

    // Cross-provider backup using platform standard Gemini key
    if (process.env.GEMINI_API_KEY) {
      attempts.push({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY, apiUrl: null })
    }
  }

  let lastError: any = null

  for (const attempt of attempts) {
    if (!attempt.apiKey) continue

    try {
      return await executeSingleLLMCompletion(
        attempt.provider,
        attempt.model,
        attempt.apiKey,
        attempt.apiUrl,
        messages,
        systemInstruction,
        responseFormat,
        responseSchema
      )
    } catch (err: any) {
      console.warn(`[AI Failover] Failed with ${attempt.provider}/${attempt.model}. Trying next fallback. Error: ${err.message || err}`)
      lastError = err
    }
  }

  throw new Error(`All LLM failover attempts failed. Last error: ${lastError?.message || lastError}`)
}

/**
 * Query active services, booking links, store config and e-commerce products for context injection
 */
export async function getAccountCatalogs(accountId: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.abblahub.com';
  const parts: string[] = [];

  try {
    // 1. Fetch Staff Profile for Booking Link
    const { data: profile } = await supabaseAdmin()
      .from('profiles')
      .select('id, slug, full_name')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();

    const bookingSlug = profile?.slug || profile?.id;

    // 2. Fetch Active Services
    const { data: services } = await supabaseAdmin()
      .from('services')
      .select('id, name, description, duration_minutes, price')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (services && services.length > 0) {
      let serviceText = '=== SERVIÇOS E LINKS DE AGENDAMENTO DISPONÍVEIS ===\n';
      services.forEach((s) => {
        const priceStr = s.price ? ` - R$ ${Number(s.price).toFixed(2)}` : '';
        const durationStr = s.duration_minutes ? ` (${s.duration_minutes} min)` : '';
        const linkStr = bookingSlug ? `\n   Link direto para agendar: ${baseUrl}/book/${bookingSlug}` : '';
        serviceText += `• ${s.name}${durationStr}${priceStr}${s.description ? `: ${s.description}` : ''}${linkStr}\n`;
      });
      parts.push(serviceText);
    } else if (bookingSlug) {
      parts.push(`=== LINK DE AGENDAMENTO DA CONTA ===\n• Página de Agendamento Online: ${baseUrl}/book/${bookingSlug}\n`);
    }

    // 3. Fetch E-Commerce Store & Products
    const { data: wooviConfig } = await supabaseAdmin()
      .from('woovi_config')
      .select('store_name, store_slug')
      .eq('account_id', accountId)
      .maybeSingle();

    const storeSlug = wooviConfig?.store_slug || accountId;

    const { data: products } = await supabaseAdmin()
      .from('products')
      .select('id, name, slug, description, active')
      .eq('account_id', accountId)
      .eq('active', true);

    if (products && products.length > 0) {
      let productText = '=== CATÁLOGO DE PRODUTOS DO E-COMMERCE ===\n';
      products.forEach((p) => {
        const productSlugOrId = p.slug || p.id;
        const productLink = `${baseUrl}/shop/${storeSlug}/product/${productSlugOrId}`;
        productText += `• ${p.name}${p.description ? `: ${p.description}` : ''}\n   Link do Produto: ${productLink}\n`;
      });
      parts.push(productText);
    } else {
      parts.push(`=== CATÁLOGO DA LOJA VIRTUAL ===\n• Página da Loja: ${baseUrl}/shop/${storeSlug}\n`);
    }

  } catch (err) {
    console.error('[AI Service] Error fetching account catalogs:', err);
  }

  return parts.join('\n');
}

/**
 * Generate response incorporating context and conversation history using the configured AI provider
 */
export async function generateAIResponse(
  messageText: string,
  conversationId: string,
  accountId: string,
  systemPromptOverride?: string,
  useRag: boolean = true
): Promise<{ text: string; action: 'reply' | 'handoff' }> {
  // 1. Fetch conversation history
  const { data: messages } = await supabaseAdmin()
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  const history = messages
    ? messages.reverse().map(m => `${m.sender_type === 'customer' ? 'User' : 'Assistant'}: ${m.content_text}`).join('\n')
    : ''

  // 2. Fetch context from Knowledge Base (if useRag is active)
  const context = useRag ? await getRelevantContext(messageText, accountId) : ''

  // 2b. Fetch active Services & E-commerce Products Catalogs
  const catalogContext = await getAccountCatalogs(accountId)

  // 3. Assemble system prompt
  const defaultPrompt = 'Você é um assistente virtual atencioso que responde dúvidas de clientes no WhatsApp.'
  const systemInstruction = `
${systemPromptOverride || defaultPrompt}

${context ? `Use as seguintes informações da Base de Conhecimento para responder às perguntas:\n===\n${context}\n===` : ''}

${catalogContext ? `Catálogos de Produtos e Serviços da empresa disponíveis para indicação:\n===\n${catalogContext}\n===` : ''}

Instruções críticas:
- Responda de forma clara, natural e concisa.
- Se o cliente perguntar sobre agendamento, reunião, consulta, horários ou contratar um serviço, forneça as informações do serviço e envie o LINK DE AGENDAMENTO correspondente.
- Se o cliente demonstrar interesse em produtos, preços, comprar ou ver o catálogo do e-commerce, apresente o produto e forneça o LINK DIRETO do produto ou da loja virtual.
- Se a resposta não puder ser derivada das informações fornecidas e for uma dúvida que necessite de suporte especializado, defina o campo "handoff" como true.
- Se o usuário pedir explicitamente para falar com um humano, com um atendente, ou expressar irritação extrema, defina o campo "handoff" como true.
- Identifique se o cliente solicitou alguma ação/demanda que precise de acompanhamento interno ou execução futura (ex: envio de documentos, agendamento de reunião, ligar de volta, analisar um caso). Se sim, preencha o campo "detected_task" com um título curto e claro, uma descrição detalhada e o prazo estimado em dias. Caso contrário, defina "detected_task" como null.
`

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      reply: {
        type: 'STRING',
        description: 'A resposta amigável e concisa para o cliente no WhatsApp.'
      },
      handoff: {
        type: 'BOOLEAN',
        description: 'Defina como true se o cliente pedir para falar com humano, atendente, ou expressar irritação.'
      },
      detected_task: {
        type: 'OBJECT',
        description: 'Ações que o cliente pediu que necessitam de execução interna futura. Caso contrário, retorne null.',
        properties: {
          title: {
            type: 'STRING',
            description: 'Título curto e direto da tarefa, ex: "Enviar modelo de contrato".'
          },
          description: {
            type: 'STRING',
            description: 'Informações detalhadas sobre a tarefa e o que o cliente solicitou.'
          },
          due_days: {
            type: 'INTEGER',
            description: 'Quantidade de dias úteis sugerida para a entrega.'
          }
        },
        required: ['title']
      }
    },
    required: ['reply', 'handoff']
  }

  // 4. Generate content via dynamic dispatching
  const promptText = `Histórico da conversa recente:\n${history}\n\nNova mensagem do usuário:\n${messageText}`
  const responseText = await dispatchLLMCompletion(
    [{ role: 'user', content: promptText }],
    systemInstruction,
    accountId,
    'json',
    responseSchema
  )

  let parsed: {
    reply: string
    handoff: boolean
    detected_task?: {
      title: string
      description?: string
      due_days?: number
    } | null
  }

  try {
    parsed = JSON.parse(responseText)
  } catch (err) {
    console.error('[AI Service] Failed to parse response as JSON:', responseText, err)
    parsed = {
      reply: responseText,
      handoff: responseText.includes('[HANDOFF]'),
    }
  }

  const isHandoff = parsed.handoff
  const replyText = parsed.reply

  // If a task is detected, create it in Supabase
  if (parsed.detected_task && parsed.detected_task.title) {
    try {
      const { data: conv } = await supabaseAdmin()
        .from('conversations')
        .select('contact_id')
        .eq('id', conversationId)
        .maybeSingle()

      const contactId = conv?.contact_id || null
      const dueDays = parsed.detected_task.due_days ?? 2
      const dueAt = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString()

      const { error: taskError } = await supabaseAdmin().from('tasks').insert({
        account_id: accountId,
        conversation_id: conversationId,
        contact_id: contactId,
        title: parsed.detected_task.title,
        description: parsed.detected_task.description || null,
        status: 'pending',
        due_at: dueAt,
        is_ai_task: true,
        assigned_agent_id: null,
      })

      if (taskError) {
        console.error('[AI Service] Failed to insert auto-created task:', taskError)
      } else {
        console.log(`[AI Service] Auto-created task: "${parsed.detected_task.title}" for conversation: ${conversationId}`)
      }
    } catch (dbErr) {
      console.error('[AI Service] Database exception during task creation:', dbErr)
    }
  }

  return {
    text: replyText,
    action: isHandoff ? 'handoff' : 'reply'
  }
}

/**
 * Transcribe audio using Gemini multimodal capabilities
 */
export async function transcribeAudioUsingGemini(
  audioBase64: string,
  accountId: string
): Promise<string | null> {
  try {
    const config = await getAccountAIConfig(accountId)

    if (config.provider !== 'gemini' || !config.apiKey) {
      console.warn(`[transcribeAudioUsingGemini] Account ${accountId} does not use Gemini or lacks API key.`)
      return null
    }

    // Treat base64 to remove URI prefix if present
    let mimeType = 'audio/ogg' // Default mimeType if none provided in URI
    let cleanBase64 = audioBase64.trim()

    const mimeMatch = cleanBase64.match(/^data:([^;]+);base64,([\s\S]+)$/)
    if (mimeMatch) {
      mimeType = mimeMatch[1]
      cleanBase64 = mimeMatch[2]
    }

    const modelName = config.model.startsWith('models/') ? config.model.replace('models/', '') : config.model

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: cleanBase64
                }
              },
              {
                text: 'Transcreva este áudio de forma literal e limpa em português.'
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[transcribeAudioUsingGemini] Gemini request failed: ${response.status} - ${errorText}`)
      return null
    }

    const data = await response.json()
    const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return transcription.trim() || null
  } catch (error) {
    console.error('[transcribeAudioUsingGemini] Error during audio transcription:', error)
    return null
  }
}

