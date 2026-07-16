-- Add channel column to conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp' 
CHECK (channel IN ('whatsapp', 'messenger', 'instagram'));

-- Add channel column to messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp' 
CHECK (channel IN ('whatsapp', 'messenger', 'instagram'));

-- Create meta_integration_config table
CREATE TABLE IF NOT EXISTS meta_integration_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facebook_page_id TEXT,
  instagram_business_id TEXT,
  page_access_token TEXT NOT NULL,
  verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- Enable RLS and add policies
ALTER TABLE meta_integration_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_config_select ON meta_integration_config;
DROP POLICY IF EXISTS meta_config_insert ON meta_integration_config;
DROP POLICY IF EXISTS meta_config_update ON meta_integration_config;
DROP POLICY IF EXISTS meta_config_delete ON meta_integration_config;

CREATE POLICY meta_config_select ON meta_integration_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY meta_config_insert ON meta_integration_config FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY meta_config_update ON meta_integration_config FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY meta_config_delete ON meta_integration_config FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Alter contacts table to make phone nullable
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

-- Add messenger_psid and instagram_igsid columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS messenger_psid TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram_igsid TEXT;

-- Create unique indexes for the new channels
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_messenger_psid
  ON contacts (account_id, messenger_psid)
  WHERE messenger_psid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_instagram_igsid
  ON contacts (account_id, instagram_igsid)
  WHERE instagram_igsid IS NOT NULL;
