-- 1. Add subscription and plan columns to the accounts table
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'unpaid')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'starter' CHECK (subscription_plan IN ('starter', 'pro', 'scale')),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_message_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_message_limit INT NOT NULL DEFAULT 0;

-- 2. Index for quick checks
CREATE INDEX IF NOT EXISTS idx_accounts_billing ON accounts(subscription_status, subscription_plan);

-- 3. Create a thread-safe increment helper function
CREATE OR REPLACE FUNCTION increment_account_ai_counter(p_account_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE accounts
  SET ai_message_count = ai_message_count + 1
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;
