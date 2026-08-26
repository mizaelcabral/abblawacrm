-- ============================================================
-- 060: AI BILLING AGENT TASKS ENHANCEMENTS
-- ============================================================

-- 1. Add AI agent enhancement columns to tasks table
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS ai_agent_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'approval',
  ADD COLUMN IF NOT EXISTS billing_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

-- 2. Add check constraints for valid values (safely drop if existing)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'tasks'::regclass 
          AND contype = 'c' 
          AND (pg_get_constraintdef(oid) LIKE '%ai_agent_type%' OR pg_get_constraintdef(oid) LIKE '%execution_mode%')
    LOOP
        EXECUTE 'ALTER TABLE tasks DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE tasks 
  ADD CONSTRAINT tasks_ai_agent_type_check CHECK (ai_agent_type IN ('billing', 'followup', 'onboarding', 'general')),
  ADD CONSTRAINT tasks_execution_mode_check CHECK (execution_mode IN ('approval', 'autonomous'));

-- 3. Create index for efficient querying of pending AI tasks by type & status
CREATE INDEX IF NOT EXISTS idx_tasks_ai_execution ON tasks(is_ai_task, status) WHERE is_ai_task = true;
