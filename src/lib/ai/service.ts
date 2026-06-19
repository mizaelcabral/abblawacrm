import { createClient } from '@supabase/supabase-js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const { data: matches, error } = await supabaseAdmin.rpc('match_knowledge_base', {
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
  const { data: messages } = await supabaseAdmin
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
- Se a resposta não puder ser derivada das informações fornecidas e for uma dúvida que necessite de suporte especializado, peça desculpas de forma amigável e diga que vai transferir para um atendente humano.
- Se o usuário pedir explicitamente para falar com um humano, com um atendente, ou expressar irritação extrema, inclua obrigatoriamente a palavra-chave "[HANDOFF]" no final da resposta.
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
  
  const isHandoff = responseText.includes('[HANDOFF]')
  const cleanedText = responseText.replace('[HANDOFF]', '').trim()

  return {
    text: cleanedText,
    action: isHandoff ? 'handoff' : 'reply'
  }
}
