-- Add AI provider configuration fields to accounts table
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'gemini' CHECK (ai_provider IN ('gemini', 'openai', 'anthropic', 'openrouter')),
  ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_api_url TEXT;

-- Create an index to look up accounts by provider
CREATE INDEX IF NOT EXISTS idx_accounts_ai_provider ON accounts(ai_provider);
