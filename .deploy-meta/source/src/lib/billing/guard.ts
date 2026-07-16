import { supabaseAdmin } from '@/lib/automations/admin-client'
import { PLANS } from '@/config/plans'

/**
 * Asserts if an account is authorized to perform AI actions
 */
export async function verifyBillingAndUsage(
  accountId: string,
  actionType: 'autopilot' | 'suggestion'
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data: account, error } = await supabaseAdmin()
      .from('accounts')
      .select('subscription_status, subscription_plan, ai_message_count, ai_message_limit')
      .eq('id', accountId)
      .single()

    if (error || !account) {
      return { allowed: false, reason: 'Conta de faturamento não encontrada.' }
    }

    // 1. Check subscription status (block if past_due, canceled, unpaid)
    const blockedStatuses = ['past_due', 'canceled', 'unpaid']
    if (blockedStatuses.includes(account.subscription_status)) {
      return { 
        allowed: false, 
        reason: 'Assinatura pendente. Por favor, regularize o pagamento em Configurações > Planos.' 
      }
    }

    const planConfig = PLANS[account.subscription_plan]
    if (!planConfig) {
      return { allowed: false, reason: 'Plano contratado inválido.' }
    }

    // 2. Check feature access
    if (actionType === 'autopilot' && !planConfig.allowAutopilot) {
      return { allowed: false, reason: 'Seu plano atual (Starter) não possui o recurso de Piloto Automático de IA.' }
    }
    
    if (actionType === 'suggestion' && !planConfig.allowSuggestions) {
      return { allowed: false, reason: 'Seu plano atual (Starter) não possui o recurso de Sugestões Inteligentes.' }
    }

    // 3. Check message limit
    const limit = account.ai_message_limit || planConfig.aiMessageLimit
    if (account.ai_message_count >= limit) {
      return { 
        allowed: false, 
        reason: 'Limite mensal de mensagens de IA atingido. Regularize ou faça upgrade de seu plano.' 
      }
    }

    return { allowed: true }
  } catch (err) {
    console.error('[Billing Guard] Error checking subscription:', err)
    return { allowed: false, reason: 'Falha interna ao verificar limites de assinatura.' }
  }
}

/**
 * Increment the account's AI message consumption counter by 1
 */
export async function incrementAIConsumption(accountId: string) {
  try {
    const { error } = await supabaseAdmin().rpc('increment_account_ai_counter', { 
      p_account_id: accountId 
    })
    if (error) {
      console.error('[Billing Guard] Failed to increment AI counter via RPC:', error)
    }
  } catch (err) {
    console.error('[Billing Guard] Exception incrementing AI counter:', err)
  }
}
