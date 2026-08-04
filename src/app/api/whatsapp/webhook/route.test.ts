import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set required env vars so supabaseAdmin() doesn't fail initialization
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

vi.mock('@supabase/supabase-js', () => {
  const mockQueryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  }

  const client = {
    from: vi.fn().mockReturnValue(mockQueryChain),
  }

  ;(globalThis as any)._supabaseMockClient = client
  ;(globalThis as any)._supabaseMockQueryChain = mockQueryChain

  return {
    createClient: vi.fn(() => client),
  }
})

import { findOrCreateConversation } from './route'

describe('findOrCreateConversation', () => {
  let mockQueryChain: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryChain = (globalThis as any)._supabaseMockQueryChain
    mockClient = (globalThis as any)._supabaseMockClient

    mockQueryChain.select.mockReturnThis()
    mockQueryChain.eq.mockReturnThis()
    mockQueryChain.order.mockReturnThis()
    mockQueryChain.limit.mockReturnThis()
    mockQueryChain.insert.mockReturnThis()
    mockClient.from.mockReturnValue(mockQueryChain)
  })

  it('retorna conversa existente sem criar nova', async () => {
    const existingConv = { id: 'conv-existing-1', account_id: 'acc-1', contact_id: 'ct-1', created_at: '2026-01-01' }
    mockQueryChain.maybeSingle.mockResolvedValueOnce({ data: existingConv, error: null })

    const result = await findOrCreateConversation('acc-1', 'user-1', 'ct-1')

    expect(result).toEqual(existingConv)
    expect(mockQueryChain.insert).not.toHaveBeenCalled()
  })

  it('cria nova conversa se não existir nenhuma', async () => {
    const newConv = { id: 'conv-new-1', account_id: 'acc-1', contact_id: 'ct-1', user_id: 'user-1' }
    // 1st query: maybeSingle finds nothing
    mockQueryChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // insert query: single returns new conversation
    mockQueryChain.single.mockResolvedValueOnce({ data: newConv, error: null })

    const result = await findOrCreateConversation('acc-1', 'user-1', 'ct-1')

    expect(result).toEqual(newConv)
    expect(mockQueryChain.insert).toHaveBeenCalledWith({
      account_id: 'acc-1',
      user_id: 'user-1',
      contact_id: 'ct-1',
    })
  })

  it('trata race condition com retry e retorna a conversa criada por requisição concorrente', async () => {
    const racedConv = { id: 'conv-raced-1', account_id: 'acc-1', contact_id: 'ct-1' }
    // 1st query: maybeSingle finds nothing
    mockQueryChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // insert query: returns unique violation error (23505)
    mockQueryChain.single.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    // 2nd query (retry): maybeSingle returns the raced conversation
    mockQueryChain.maybeSingle.mockResolvedValueOnce({ data: racedConv, error: null })

    const result = await findOrCreateConversation('acc-1', 'user-1', 'ct-1')

    expect(result).toEqual(racedConv)
  })

  it('retorna a conversa mais antiga em caso de duplicatas históricas (>= 2 rows)', async () => {
    const oldestConv = { id: 'conv-oldest', account_id: 'acc-1', contact_id: 'ct-1', created_at: '2026-01-01T00:00:00Z' }
    mockQueryChain.maybeSingle.mockResolvedValueOnce({ data: oldestConv, error: null })

    const result = await findOrCreateConversation('acc-1', 'user-1', 'ct-1')

    expect(result).toEqual(oldestConv)
    expect(mockQueryChain.order).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(mockQueryChain.limit).toHaveBeenCalledWith(1)
    expect(mockQueryChain.insert).not.toHaveBeenCalled()
  })
})
