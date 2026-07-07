import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: {
    tasks: [] as any[],
    updates: [] as any[],
  }
}))

vi.mock('@/lib/automations/admin-client', () => {
  return {
    supabaseAdmin: () => ({
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  lte: () => Promise.resolve({ data: [], error: null })
                })
              })
            }),
            update: () => ({
              eq: () => Promise.resolve({ error: null })
            })
          }
        }
        return {
          select: () => ({
            eq: (col: string, val: any) => ({
              eq: (col2: string, val2: any) => ({
                limit: (lim: number) => Promise.resolve({ data: h.state.tasks, error: null })
              })
            })
          }),
          update: (payload: any) => {
            h.state.updates.push(payload)
            return {
              eq: (col: string, val: any) => Promise.resolve({ error: null })
            }
          }
        }
      }
    })
  }
})

vi.mock('@/app/api/mcp/route', () => ({
  handleToolCall: vi.fn(async (name, args, accountId) => {
    return { content: [{ type: 'text', text: `Mock result for ${name}` }] }
  })
}))

import { executePendingAITasks } from './task-worker'

describe('executePendingAITasks', () => {
  beforeEach(() => {
    h.state.tasks = []
    h.state.updates = []
    process.env.GEMINI_API_KEY = 'mock-api-key'
    vi.restoreAllMocks()
  })

  it('should do nothing if no pending tasks', async () => {
    h.state.tasks = []
    const result = await executePendingAITasks()
    expect(result.processed).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('should process pending tasks and transition status to review_required', async () => {
    h.state.tasks = [
      {
        id: 'task-1',
        account_id: 'acct-123',
        conversation_id: 'conv-123',
        title: 'Test Task',
        description: 'Please do something',
        contact: { full_name: 'John Doe', phone: '+5511999999999' }
      }
    ]

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Successfully completed task.' }
              ]
            }
          }
        ]
      })
    } as any)

    const result = await executePendingAITasks()
    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
    
    // Updates: in_progress followed by review_required
    expect(h.state.updates).toHaveLength(2)
    expect(h.state.updates[0].status).toBe('in_progress')
    expect(h.state.updates[1].status).toBe('review_required')
    expect(h.state.updates[1].ai_draft).toBe('Successfully completed task.')
  })
})
