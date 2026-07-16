-- Migration 042: Super Admin Config table for global platform settings
-- This avoids dependency on runtime environment variables for sensitive keys

CREATE TABLE IF NOT EXISTS super_admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only super_admin can read/write
ALTER TABLE super_admin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_config_select" ON super_admin_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_config_insert" ON super_admin_config
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_config_update" ON super_admin_config
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- Service role (backend) can also read without auth context
CREATE POLICY "super_admin_config_service_role" ON super_admin_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
