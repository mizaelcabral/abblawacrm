# Multi-Provider LLM Tenant Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the Super Admin to configure different LLM providers (Gemini, OpenAI, Anthropic, OpenRouter) and custom models/API keys per tenant/account, dynamically routing all client assistant completions and worker agent tasks to the configured provider.

**Architecture:** Add columns for LLM configurations (`ai_provider`, `ai_model`, `ai_api_key`, `ai_api_url`) to the `accounts` table. Create a unified, helper-level completion dispatcher in `src/lib/ai/service.ts` that selects the model and key from the database, executes the correct payload formatting and network requests, and returns responses in a uniform interface. Integrate configuration inputs in the Super Admin dashboard modal.

**Tech Stack:** Next.js, Supabase, Postgres, TypeScript, crypto (for AES key encryption).

## Global Constraints
- Do not introduce external SDK dependencies (like `@google/generative-ai` or `openai` package) unless explicitly requested; use `fetch` requests to maintain lightweight builds.
- Ensure all API keys stored in `accounts` are encrypted using GCM format from `@/lib/whatsapp/encryption`.
- Mask AI keys (`••••••••`) when returning them through the superadmin API endpoints to avoid leaking ciphertext or keys in browser responses.

---

### Task 1: Database Schema Migration
Create a SQL migration script to append configuration fields to the `accounts` table.

**Files:**
- Create: `supabase/migrations/035_llm_multi_provider_config.sql`

- [ ] **Step 1: Write the migration file**
  Create the file with the following contents:
  ```sql
  -- Add AI provider configuration fields to accounts table
  ALTER TABLE accounts 
    ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'gemini' CHECK (ai_provider IN ('gemini', 'openai', 'anthropic', 'openrouter')),
    ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
    ADD COLUMN IF NOT EXISTS ai_api_url TEXT;

  -- Create an index to look up accounts by provider
  CREATE INDEX IF NOT EXISTS idx_accounts_ai_provider ON accounts(ai_provider);
  ```
- [ ] **Step 2: Run verification**
  Locally apply the migration or check the syntax using standard SQL rules.
  Run: `supabase migration new llm_multi_provider_config` (if local Supabase CLI is running, or verify it runs cleanly).

---

### Task 2: Super Admin API Integration
Update the superadmin accounts endpoints to return masked configuration details and update account LLM parameters.

**Files:**
- Modify: `src/app/api/superadmin/accounts/route.ts`

**Interfaces:**
- GET: Returns accounts list with `ai_provider`, `ai_model`, `ai_api_url`, and a boolean `has_ai_key`.
- PUT: Accepts `ai_provider`, `ai_model`, `ai_api_url`, `ai_api_key`. If `ai_api_key` is provided and is not the masked string `"••••••••"`, it encrypts it using `encrypt` from `@/lib/whatsapp/encryption`.

- [ ] **Step 1: Update API handlers**
  Replace `GET` and `PUT` implementations in `src/app/api/superadmin/accounts/route.ts` to query and process new fields.
  ```typescript
  import { encrypt } from '@/lib/whatsapp/encryption';
  
  // Inside GET:
  // Map accounts to mask api keys:
  const processedAccounts = accounts.map((acc: any) => ({
    ...acc,
    has_ai_key: !!acc.ai_api_key,
    ai_api_key: undefined, // remove from response for security
  }));
  return NextResponse.json(processedAccounts);

  // Inside PUT:
  const { id, subscription_plan, subscription_status, ai_message_limit, ai_provider, ai_model, ai_api_key, ai_api_url } = body;
  const updateData: any = {};
  // ... existing fields ...
  if (ai_provider !== undefined) updateData.ai_provider = ai_provider;
  if (ai_model !== undefined) updateData.ai_model = ai_model;
  if (ai_api_url !== undefined) updateData.ai_api_url = ai_api_url;
  if (ai_api_key !== undefined && ai_api_key !== '••••••••' && ai_api_key.trim() !== '') {
    updateData.ai_api_key = encrypt(ai_api_key.trim());
  }
  ```
- [ ] **Step 2: Verify typecheck**
  Run: `npm run typecheck`
  Expected: Success.

---

### Task 3: Unified LLM Dispatch Service
Create an interface in `src/lib/ai/service.ts` to call completion endpoints dynamically.

**Files:**
- Modify: `src/lib/ai/service.ts`

**Interfaces:**
- Produces: `dispatchLLMCompletion(messages: Array<{role: string, content: string}>, systemInstruction: string, accountId: string): Promise<string>`

- [ ] **Step 1: Write helper function to load AI configuration**
  ```typescript
  import { decrypt } from '@/lib/whatsapp/encryption'

  async function getAccountAIConfig(accountId: string) {
    const { data } = await supabaseAdmin()
      .from('accounts')
      .select('ai_provider, ai_model, ai_api_key, ai_api_url')
      .eq('id', accountId)
      .single()
      
    return {
      provider: data?.ai_provider || 'gemini',
      model: data?.ai_model || 'gemini-1.5-flash',
      apiKey: data?.ai_api_key ? decrypt(data.ai_api_key) : process.env.GEMINI_API_KEY,
      apiUrl: data?.ai_api_url || null
    }
  }
  ```
- [ ] **Step 2: Implement dispatcher for OpenAI / OpenRouter / Anthropic**
  Write `dispatchLLMCompletion` translating prompt shapes to OpenAI format, Anthropic format, and Gemini format fetch calls.

- [ ] **Step 3: Update `generateAIResponse` to use dispatcher**
  Replace standard fetch of Gemini with `dispatchLLMCompletion`.

- [ ] **Step 4: Run typecheck and tests**
  Run: `npm run typecheck && npm run test`
  Expected: Success.

---

### Task 4: Super Admin UI Integration
Add provider settings inputs to the account editing modal.

**Files:**
- Modify: `src/app/superadmin/accounts/page.tsx`

- [ ] **Step 1: Declare state variables**
  Add state bindings:
  ```typescript
  const [editProvider, setEditProvider] = useState('gemini');
  const [editModel, setEditModel] = useState('gemini-1.5-flash');
  const [editApiKey, setEditApiKey] = useState('');
  const [editApiUrl, setEditApiUrl] = useState('');
  ```
- [ ] **Step 2: Add inputs to modal JSX**
  Create selects and input boxes inside editing modal.
- [ ] **Step 3: Verify build**
  Run: `npm run build`
  Expected: Success.
