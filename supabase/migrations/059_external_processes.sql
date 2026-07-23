-- ============================================================
-- 059_external_processes.sql
-- ponytail: Minimal, robust schema for generic external processes and status history
-- ============================================================

-- 1. Tabela de Processos Externos
CREATE TABLE IF NOT EXISTS public.external_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  approved_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  process_type TEXT NOT NULL,
  authority_name TEXT NOT NULL,
  protocol_number TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'requirement', 'approved', 'denied', 'cancelled', 'expired')),

  submitted_at TIMESTAMPTZ,
  last_status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requirement_due_at TIMESTAMPTZ,
  decision_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,

  external_reference TEXT,
  notes TEXT,

  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_proc_account ON public.external_processes(account_id);
CREATE INDEX IF NOT EXISTS idx_ext_proc_deal ON public.external_processes(deal_id);
CREATE INDEX IF NOT EXISTS idx_ext_proc_contact ON public.external_processes(contact_id);
CREATE INDEX IF NOT EXISTS idx_ext_proc_status ON public.external_processes(status);

ALTER TABLE public.external_processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ext processes select" ON public.external_processes;
CREATE POLICY "Ext processes select" ON public.external_processes FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Ext processes insert" ON public.external_processes;
CREATE POLICY "Ext processes insert" ON public.external_processes FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "Ext processes update" ON public.external_processes;
CREATE POLICY "Ext processes update" ON public.external_processes FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "Ext processes delete" ON public.external_processes;
CREATE POLICY "Ext processes delete" ON public.external_processes FOR DELETE USING (is_account_member(account_id, 'admin'));

-- 2. Tabela de Histórico Imutável de Status
CREATE TABLE IF NOT EXISTS public.external_process_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES public.external_processes(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason_or_notes TEXT,
  origin TEXT NOT NULL DEFAULT 'mcp_api',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.external_process_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ext status history select" ON public.external_process_status_history;
CREATE POLICY "Ext status history select" ON public.external_process_status_history FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Ext status history insert" ON public.external_process_status_history;
CREATE POLICY "Ext status history insert" ON public.external_process_status_history FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- 3. Trigger de Validação Estrita de Multi-Tenant
CREATE OR REPLACE FUNCTION public.validate_external_process_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = NEW.deal_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'deal_id pertence a outra conta';
  END IF;

  IF NEW.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = NEW.contact_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'contact_id pertence a outra conta';
  END IF;

  IF NEW.approved_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.approved_document_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'approved_document_id pertence a outra conta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_external_process_accounts ON public.external_processes;
CREATE TRIGGER trg_validate_external_process_accounts
  BEFORE INSERT OR UPDATE ON public.external_processes
  FOR EACH ROW EXECUTE FUNCTION public.validate_external_process_accounts();

-- 4. Trigger de Registro Automático de Histórico de Status
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
      NEW.notes,
      'system_trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_external_process_status_change ON public.external_processes;
CREATE TRIGGER trg_log_external_process_status_change
  AFTER INSERT OR UPDATE ON public.external_processes
  FOR EACH ROW EXECUTE FUNCTION public.log_external_process_status_change();
