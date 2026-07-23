-- ============================================================
-- 060_external_processes_status_reason.sql
-- ponytail: Separacao de status_reason em external_processes e atualizacao da trigger de historico
-- ============================================================

-- 1. Adicionar coluna status_reason na tabela external_processes
ALTER TABLE public.external_processes
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- 2. Atualizar trigger de historico para gravar NEW.status_reason
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
      origin
    ) VALUES (
      NEW.account_id,
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      COALESCE(NEW.created_by_user_id, auth.uid()),
      NEW.status_reason,
      'system_trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;
