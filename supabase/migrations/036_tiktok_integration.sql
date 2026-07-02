-- 1. Update the Channel check constraints on conversations and messages
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check 
  CHECK (channel IN ('whatsapp', 'messenger', 'instagram', 'telegram', 'tiktok'));

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE messages ADD CONSTRAINT messages_channel_check 
  CHECK (channel IN ('whatsapp', 'messenger', 'instagram', 'telegram', 'tiktok'));

-- 2. Add TikTok User ID identifier to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tiktok_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_tiktok_user_id
  ON contacts (account_id, tiktok_user_id)
  WHERE tiktok_user_id IS NOT NULL;

-- 3. Create tiktok_integration_config table
CREATE TABLE IF NOT EXISTS tiktok_integration_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,       -- Encrypted token
  refresh_token TEXT,              -- Encrypted refresh token
  tiktok_open_id TEXT,             -- TikTok Open ID or Business account ID
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- 4. Enable Row Level Security (RLS) and create policies
ALTER TABLE tiktok_integration_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tiktok_config_select ON tiktok_integration_config;
DROP POLICY IF EXISTS tiktok_config_insert ON tiktok_integration_config;
DROP POLICY IF EXISTS tiktok_config_update ON tiktok_integration_config;
DROP POLICY IF EXISTS tiktok_config_delete ON tiktok_integration_config;

CREATE POLICY tiktok_config_select ON tiktok_integration_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY tiktok_config_insert ON tiktok_integration_config FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY tiktok_config_update ON tiktok_integration_config FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY tiktok_config_delete ON tiktok_integration_config FOR DELETE USING (is_account_member(account_id, 'agent'));
