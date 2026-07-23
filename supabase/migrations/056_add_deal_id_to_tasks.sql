-- ============================================================
-- Migration 056: Add deal_id to tasks table
-- ============================================================

ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_deal_id ON tasks(deal_id);
