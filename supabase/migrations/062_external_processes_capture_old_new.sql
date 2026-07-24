-- ============================================================
-- 062_external_processes_capture_old_new.sql
-- ponytail: Atualiza a trigger de historico de processos externos para capturar snapshots de OLD e NEW
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_external_process_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
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
      NULL,
      NEW.status,
      COALESCE(NEW.created_by_user_id, auth.uid()),
      NEW.status_reason,
      'system_trigger',
      jsonb_build_object(
        'previous', NULL,
        'current', jsonb_build_object(
          'status', NEW.status,
          'requirement_due_at', NEW.requirement_due_at,
          'decision_at', NEW.decision_at,
          'valid_until', NEW.valid_until,
          'submitted_at', NEW.submitted_at,
          'status_reason', NEW.status_reason
        )
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
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
      OLD.status,
      NEW.status,
      COALESCE(NEW.created_by_user_id, auth.uid()),
      NEW.status_reason,
      'system_trigger',
      jsonb_build_object(
        'previous', jsonb_build_object(
          'status', OLD.status,
          'requirement_due_at', OLD.requirement_due_at,
          'decision_at', OLD.decision_at,
          'valid_until', OLD.valid_until,
          'submitted_at', OLD.submitted_at,
          'status_reason', OLD.status_reason
        ),
        'current', jsonb_build_object(
          'status', NEW.status,
          'requirement_due_at', NEW.requirement_due_at,
          'decision_at', NEW.decision_at,
          'valid_until', NEW.valid_until,
          'submitted_at', NEW.submitted_at,
          'status_reason', NEW.status_reason
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
