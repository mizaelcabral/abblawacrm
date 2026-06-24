import { supabaseAdmin } from '@/lib/automations/admin-client'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

/**
 * Generate embedding vector for a given text using Gemini Embeddings API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text }],
        },
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
 * Generate response incorporating context and conversation history using Gemini API
 */
export async function generateAIResponse(
  messageText: string,
  conversationId: string,
  accountId: string,
  systemPromptOverride?: string,
  useRag: boolean = true
): Promise<{ text: string; action: 'reply' | 'handoff' }> {
  if (!GEMINI_API_KEY) {
    return {
      text: 'Desculpe, o serviço de atendimento inteligente não está configurado no momento.',
      action: 'handoff'
    }
  }

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

  // 3. Assemble system prompt
  const defaultPrompt = 'Você é um assistente virtual atencioso que responde dúvidas de clientes no WhatsApp.'
  const systemInstruction = `
${systemPromptOverride || defaultPrompt}

${context ? `Use as seguintes informações da Base de Conhecimento para responder às perguntas:\n===\n${context}\n===` : ''}

Instruções críticas:
- Responda de forma clara, natural e concisa.
- Se a resposta não puder ser derivada das informações fornecidas e for uma dúvida que necessite de suporte especializado, defina o campo "handoff" como true.
- Se o usuário pedir explicitamente para falar com um humano, com um atendente, ou expressar irritação extrema, defina o campo "handoff" como true.
- Identifique se o cliente solicitou alguma ação/demanda que precise de acompanhamento interno ou execução futura (ex: envio de documentos, agendamento de reunião, ligar de volta, analisar um caso). Se sim, preencha o campo "detected_task" com um título curto e claro, uma descrição detalhada e o prazo estimado em dias. Caso contrário, defina "detected_task" como null.
`

  // 4. Generate content via Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Histórico da conversa recente:\n${history}\n\nNova mensagem do usuário:\n${messageText}`
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            {
              text: systemInstruction
            }
          ]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
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
        }
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini generateContent failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  
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
    console.error('[AI Service] Failed to parse Gemini response as JSON:', responseText, err)
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
