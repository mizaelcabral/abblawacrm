-- 1. Update the Channel check constraints on conversations and messages
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check 
  CHECK (channel IN ('whatsapp', 'messenger', 'instagram', 'telegram'));

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE messages ADD CONSTRAINT messages_channel_check 
  CHECK (channel IN ('whatsapp', 'messenger', 'instagram', 'telegram'));

-- 2. Add Telegram Chat ID identifier to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_telegram_chat_id
  ON contacts (account_id, telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- 3. Create telegram_integration_config table
CREATE TABLE IF NOT EXISTS telegram_integration_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token TEXT NOT NULL,       -- Encrypted token
  bot_username TEXT,             -- Username of the bot (e.g. @MyCRM_bot)
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- 4. Enable Row Level Security (RLS) and create policies
ALTER TABLE telegram_integration_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_config_select ON telegram_integration_config;
DROP POLICY IF EXISTS telegram_config_insert ON telegram_integration_config;
DROP POLICY IF EXISTS telegram_config_update ON telegram_integration_config;
DROP POLICY IF EXISTS telegram_config_delete ON telegram_integration_config;

CREATE POLICY telegram_config_select ON telegram_integration_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY telegram_config_insert ON telegram_integration_config FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY telegram_config_update ON telegram_integration_config FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY telegram_config_delete ON telegram_integration_config FOR DELETE USING (is_account_member(account_id, 'agent'));
