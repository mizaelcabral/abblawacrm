-- Migration 028: MCP API Keys for tenant integrations
CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies (account scope)
DROP POLICY IF EXISTS "mcp_api_keys_select" ON mcp_api_keys;
CREATE POLICY "mcp_api_keys_select" ON mcp_api_keys
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mcp_api_keys_insert" ON mcp_api_keys;
CREATE POLICY "mcp_api_keys_insert" ON mcp_api_keys
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT account_id FROM profiles WHERE user_id = auth.uid()
    ) AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "mcp_api_keys_delete" ON mcp_api_keys;
CREATE POLICY "mcp_api_keys_delete" ON mcp_api_keys
  FOR DELETE USING (
    account_id IN (
      SELECT account_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Index for key_hash lookup
CREATE INDEX IF NOT EXISTS mcp_api_keys_key_hash_idx ON mcp_api_keys(key_hash);
