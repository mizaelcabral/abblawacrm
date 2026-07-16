-- Create whatsapp_web_config table for unofficial QR Code WhatsApp integration
CREATE TABLE IF NOT EXISTS whatsapp_web_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL,
  api_token TEXT NOT NULL,         -- Encrypted API key/token
  instance_name TEXT NOT NULL,     -- Instance ID/Name in Evolution API
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting')),
  is_active BOOLEAN NOT NULL DEFAULT FALSE, -- If TRUE, replaces Meta Cloud API for WhatsApp messages
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE whatsapp_web_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS whatsapp_web_config_select ON whatsapp_web_config;
DROP POLICY IF EXISTS whatsapp_web_config_insert ON whatsapp_web_config;
DROP POLICY IF EXISTS whatsapp_web_config_update ON whatsapp_web_config;
DROP POLICY IF EXISTS whatsapp_web_config_delete ON whatsapp_web_config;

-- Create account-based member policies
CREATE POLICY whatsapp_web_config_select ON whatsapp_web_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY whatsapp_web_config_insert ON whatsapp_web_config FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY whatsapp_web_config_update ON whatsapp_web_config FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY whatsapp_web_config_delete ON whatsapp_web_config FOR DELETE USING (is_account_member(account_id, 'agent'));
