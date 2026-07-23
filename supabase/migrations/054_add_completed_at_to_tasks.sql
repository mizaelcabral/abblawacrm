-- ============================================================
-- Migration 054: Add completed_at to tasks table
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill existing completed tasks with updated_at as fallback
UPDATE tasks SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;
