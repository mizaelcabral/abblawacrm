import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: {
    messages: [] as any[],
    conversation: { contact_id: 'contact-123' },
    insertedTasks: [] as any[]
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
              maybeSingle: () => Promise.resolve({ data: h.state.conversation, error: null })
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

import { generateAIResponse } from './service'

describe('generateAIResponse with task detection', () => {
  beforeEach(() => {
    h.state.messages = []
    h.state.insertedTasks = []
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
