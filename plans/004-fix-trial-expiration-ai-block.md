# Fix Trial Expiration AI Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent expired trial accounts from using AI autopilot and suggestions.

**Architecture:** Update `verifyBillingAndUsage` in `src/lib/billing/guard.ts` to query `subscription_expires_at` and verify if the trial period has expired.

**Tech Stack:** Next.js, Supabase, TypeScript

## Global Constraints

- Avoid unnecessary abstractions or boilerplates.
- Use native Date checks.
- Keep changes minimal and clean.

---

### Task 1: Check Trial Expiration in Billing Guard

**Files:**
- Modify: `src/lib/billing/guard.ts`

**Interfaces:**
- Consumes: None
- Produces: None

- [ ] **Step 1: Update verifyBillingAndUsage implementation**
  Add the `subscription_expires_at` column to the Supabase select query and check if the trial has expired.
  
  ```typescript
  // In src/lib/billing/guard.ts:
  // Update query:
  const { data: account, error } = await supabaseAdmin()
    .from('accounts')
    .select('subscription_status, subscription_expires_at, subscription_plan, ai_message_count, ai_message_limit')
    .eq('id', accountId)
    .single()
  
  // Update checks (add trial verification):
  // Check if trial has expired
  if (
    account.subscription_status === 'trial' &&
    account.subscription_expires_at &&
    new Date(account.subscription_expires_at) < new Date()
  ) {
    return {
      allowed: false,
      reason: 'Período de teste gratuito expirado. Por favor, regularize o pagamento em Configurações > Planos.'
    }
  }
  ```

- [ ] **Step 2: Add test or manual verification script**
  Since there are tests in the repository, run the test suite to ensure we didn't break other features.
  Run: `npm run test` or `npx vitest run` to make sure existing tests pass.

- [ ] **Step 3: Commit changes**
  ```bash
  git add src/lib/billing/guard.ts
  git commit -m "feat(billing): block AI features for expired trial accounts"
  ```
