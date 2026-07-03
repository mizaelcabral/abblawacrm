import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: {
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
              single: () => {
                if (table === 'accounts') {
                  return Promise.resolve({ data: h.state.account, error: null })
                }
                return Promise.resolve({ data: null, error: new Error('Not found') })
              }
            })
          })
        }
      }
    })
  }
})

import { verifyBillingAndUsage } from './guard'

describe('verifyBillingAndUsage', () => {
  beforeEach(() => {
    h.state.account = null
    vi.clearAllMocks()
  })

  it('allows active plans with limits remaining', async () => {
    h.state.account = {
      subscription_status: 'active',
      subscription_plan: 'pro',
      ai_message_count: 0,
      ai_message_limit: 100
    }
    const result = await verifyBillingAndUsage('acc-123', 'suggestion')
    expect(result.allowed).toBe(true)
  })

  it('blocks delinquent accounts (past_due, canceled, unpaid)', async () => {
    h.state.account = {
      subscription_status: 'past_due',
      subscription_plan: 'pro',
      ai_message_count: 0,
      ai_message_limit: 1000
    }
    const result = await verifyBillingAndUsage('acc-123', 'autopilot')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Assinatura pendente')
  })

  it('allows active trial accounts before expiration date', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 5) // 5 days in the future

    h.state.account = {
      subscription_status: 'trial',
      subscription_expires_at: futureDate.toISOString(),
      subscription_plan: 'pro',
      ai_message_count: 0,
      ai_message_limit: 1000
    }
    const result = await verifyBillingAndUsage('acc-123', 'autopilot')
    expect(result.allowed).toBe(true)
  })

  it('blocks trial accounts after expiration date', async () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1) // 1 day in the past

    h.state.account = {
      subscription_status: 'trial',
      subscription_expires_at: pastDate.toISOString(),
      subscription_plan: 'pro',
      ai_message_count: 0,
      ai_message_limit: 1000
    }
    const result = await verifyBillingAndUsage('acc-123', 'autopilot')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Período de teste gratuito expirado')
  })
})
