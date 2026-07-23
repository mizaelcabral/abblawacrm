-- ============================================================
-- 061_external_processes_lifecycle.sql
-- ponytail: Adiciona transition_metadata no historico e atualiza a trigger de auditoria
-- ============================================================

ALTER TABLE public.external_process_status_history
  ADD COLUMN IF NOT EXISTS transition_metadata JSONB;

CREATE OR REPLACE FUNCTION public.log_external_process_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.external_process_status_history (
      account_id,
      process_id,
      previous_status,
      new_status,
      changed_by_user_id,
      reason_or_notes,
      origin,
      transition_metadata
    ) VALUES (
      NEW.account_id,
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      COALESCE(NEW.created_by_user_id, auth.uid()),
      NEW.status_reason,
      'system_trigger',
      jsonb_build_object(
        'requirement_due_at', NEW.requirement_due_at,
        'valid_until', NEW.valid_until,
        'decision_at', NEW.decision_at,
        'submitted_at', NEW.submitted_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
