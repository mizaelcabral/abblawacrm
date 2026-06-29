import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: {
    messages: [] as any[],
    conversation: { contact_id: 'contact-123' },
    insertedTasks: [] as any[],
    account: null as any
  }
}))

vi.mock('@/lib/automations/admin-client', () => {
  return {
    supabaseAdmin: () => ({
      from: (table: string) => {
        return {
          select: (fields: string) => ({
            eq: (col: string, val: any) => ({
              order: (col2: string, opt: any) => ({
                limit: (lim: number) => Promise.resolve({ data: h.state.messages, error: null })
              }),
              maybeSingle: () => {
                if (table === 'accounts') {
                  return Promise.resolve({ data: h.state.account, error: null })
                }
                return Promise.resolve({ data: h.state.conversation, error: null })
              }
            })
          }),
          insert: (payload: any) => {
            h.state.insertedTasks.push(payload)
            return Promise.resolve({ error: null })
          }
        }
      }
    })
  }
})

vi.mock('@/lib/whatsapp/encryption', () => {
  return {
    decrypt: (val: string) => `decrypted-${val}`
  }
})

import { generateAIResponse, getAccountAIConfig, dispatchLLMCompletion } from './service'

describe('AI Config Loader', () => {
  beforeEach(() => {
    h.state.account = null
  })

  it('should fallback to gemini default config if no account is found', async () => {
    const config = await getAccountAIConfig('missing-id')
    expect(config.provider).toBe('gemini')
    expect(config.model).toBe('gemini-1.5-flash')
  })

  it('should decrypt API key if present', async () => {
    h.state.account = {
      ai_provider: 'openai',
      ai_model: 'gpt-4o',
      ai_api_key: 'encrypted-secret-key',
      ai_api_url: 'https://custom-url.com'
    }
    const config = await getAccountAIConfig('acct-123')
    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-4o')
    expect(config.apiKey).toBe('decrypted-encrypted-secret-key')
    expect(config.apiUrl).toBe('https://custom-url.com')
  })
})

describe('LLM Completion Dispatcher', () => {
  beforeEach(() => {
    h.state.account = null
    process.env.GEMINI_API_KEY = 'gemini-env-key'
    vi.restoreAllMocks()
  })

  it('should dispatch to gemini API structure', async () => {
    h.state.account = {
      ai_provider: 'gemini',
      ai_model: 'gemini-1.5-flash',
      ai_api_key: null,
      ai_api_url: null
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Gemini says hi' }]
            }
          }
        ]
      })
    } as any)

    const response = await dispatchLLMCompletion(
      [{ role: 'user', content: 'hello' }],
      'You are a bot',
      'acct-123'
    )

    expect(response).toBe('Gemini says hi')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=gemini-env-key'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"contents":[{"role":"user","parts":[{"text":"hello"}]}]')
      })
    )
  })

  it('should dispatch to openai chat completion', async () => {
    h.state.account = {
      ai_provider: 'openai',
      ai_model: 'gpt-4o',
      ai_api_key: 'open-ai-key',
      ai_api_url: null
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: 'OpenAI says hi' }
          }
        ]
      })
    } as any)

    const response = await dispatchLLMCompletion(
      [{ role: 'user', content: 'hello' }],
      'You are a bot',
      'acct-123',
      'json'
    )

    expect(response).toBe('OpenAI says hi')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer decrypted-open-ai-key',
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining('"response_format":{"type":"json_object"}')
      })
    )
  })

  it('should dispatch to anthropic messages', async () => {
    h.state.account = {
      ai_provider: 'anthropic',
      ai_model: 'claude-3-5-sonnet',
      ai_api_key: 'anthropic-key',
      ai_api_url: null
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Anthropic says hi' }]
      })
    } as any)

    const response = await dispatchLLMCompletion(
      [{ role: 'user', content: 'hello' }],
      'You are a bot',
      'acct-123'
    )

    expect(response).toBe('Anthropic says hi')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'decrypted-anthropic-key',
          'anthropic-version': '2023-06-01'
        }),
        body: expect.stringContaining('"system":"You are a bot"')
      })
    )
  })
})

describe('generateAIResponse with task detection', () => {
  beforeEach(() => {
    h.state.messages = []
    h.state.insertedTasks = []
    h.state.account = null
    process.env.GEMINI_API_KEY = 'mock-api-key'
    vi.restoreAllMocks()
  })

  it('should return reply and not insert task if none is detected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    reply: 'Olá! Como posso ajudar você hoje?',
                    handoff: false,
                    detected_task: null
                  })
                }
              ]
            }
          }
        ]
      })
    } as any)

    const result = await generateAIResponse('oi', 'conv-123', 'acct-123', undefined, false)
    expect(result.text).toBe('Olá! Como posso ajudar você hoje?')
    expect(result.action).toBe('reply')
    expect(h.state.insertedTasks).toHaveLength(0)
  })

  it('should auto-insert a task if detected in Gemini response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    reply: 'Com certeza! Vou agendar a reunião e enviar o contrato.',
                    handoff: false,
                    detected_task: {
                      title: 'Enviar Contrato de Aluguel',
                      description: 'Enviar o contrato solicitado para o e-mail do cliente.',
                      due_days: 3
                    }
                  })
                }
              ]
            }
          }
        ]
      })
    } as any)

    const result = await generateAIResponse('preciso do contrato de aluguel', 'conv-123', 'acct-123', undefined, false)
    expect(result.text).toBe('Com certeza! Vou agendar a reunião e enviar o contrato.')
    expect(result.action).toBe('reply')
    
    expect(h.state.insertedTasks).toHaveLength(1)
    expect(h.state.insertedTasks[0].title).toBe('Enviar Contrato de Aluguel')
    expect(h.state.insertedTasks[0].description).toBe('Enviar o contrato solicitado para o e-mail do cliente.')
    expect(h.state.insertedTasks[0].is_ai_task).toBe(true)
    expect(h.state.insertedTasks[0].conversation_id).toBe('conv-123')
    expect(h.state.insertedTasks[0].contact_id).toBe('contact-123')
  })
})
