-- ============================================================
-- AI TASKS ENHANCEMENTS
-- ============================================================

-- 1. Add columns to tasks table
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS is_ai_task BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_draft TEXT;

-- 2. Safely drop existing CHECK constraint on status column
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'tasks'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%status%'
    LOOP
        EXECUTE 'ALTER TABLE tasks DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 3. Re-create CHECK constraint to allow 'review_required'
ALTER TABLE tasks 
  ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'review_required'));
