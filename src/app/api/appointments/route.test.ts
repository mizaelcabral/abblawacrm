import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { supabaseAdmin } from '@/lib/automations/admin-client'

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(),
}))

describe('appointments API POST route', () => {
  let mockAdmin: any
  let adminQueryChain: any

  beforeEach(() => {
    vi.restoreAllMocks()

    adminQueryChain = {}
    adminQueryChain.select = vi.fn().mockReturnValue(adminQueryChain)
    adminQueryChain.eq = vi.fn().mockReturnValue(adminQueryChain)
    adminQueryChain.single = vi.fn()
    adminQueryChain.maybeSingle = vi.fn()
    adminQueryChain.limit = vi.fn().mockReturnValue(adminQueryChain)
    adminQueryChain.order = vi.fn().mockReturnValue(adminQueryChain)
    adminQueryChain.insert = vi.fn().mockReturnValue(adminQueryChain)
    adminQueryChain.lt = vi.fn().mockReturnValue(adminQueryChain)
    adminQueryChain.gt = vi.fn().mockReturnValue(adminQueryChain)

    mockAdmin = {
      from: vi.fn().mockReturnValue(adminQueryChain),
    }

    vi.mocked(supabaseAdmin).mockReturnValue(mockAdmin as any)
  })

  it('deve rejeitar se faltar campos obrigatorios', async () => {
    const req = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Missing required fields')
  })

  it('deve agendar com sucesso se o servico for gratuito (payment_required: false)', async () => {
    // 1. mock profile check
    adminQueryChain.single
      .mockResolvedValueOnce({ data: { account_id: 'acc-123', user_id: 'user-123' }, error: null }) // profile lookup
      .mockResolvedValueOnce({ data: { name: 'Consulta', duration_minutes: 30, price: 0, payment_required: false }, error: null }) // service lookup
      .mockResolvedValueOnce({ data: { id: 'contact-123' }, error: null }) // contact creation
      .mockResolvedValueOnce({ data: { id: 'appt-123', status: 'confirmed' }, error: null }) // appt insertion

    // 2. mock existing contact lookup (not found)
    adminQueryChain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // contact lookup
      .mockResolvedValueOnce({ data: null, error: null }) // pipeline lookup
      .mockResolvedValueOnce({ data: null, error: null }) // pipeline stage lookup

    // 3. mock overlaps (no overlaps)
    adminQueryChain.gt.mockResolvedValueOnce({ data: [], error: null })

    const req = new Request('http://localhost/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        service_id: 'svc-123',
        profile_id: 'prof-123',
        start_time: '2026-07-18T10:00:00Z',
        client: {
          name: 'João Teste',
          phone: '11999999999',
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe('appt-123')
    expect(json.status).toBe('confirmed')
  })
})
