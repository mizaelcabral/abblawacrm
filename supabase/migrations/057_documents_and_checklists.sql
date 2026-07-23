-- ============================================================
-- 057_documents_and_checklists.sql
-- ponytail: Minimal, robust schema for documents, versions, checklists, and compliance
-- ============================================================

-- 1. Tabela de Perfis de Conformidade (Catálogo Global)
CREATE TABLE IF NOT EXISTS public.compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  default_retention_days INT,
  require_reviewer_sign BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_mime_types TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserir Perfis Iniciais (ponytail: apenas o estritamente necessário)
INSERT INTO public.compliance_profiles (code, name, description, default_retention_days, require_reviewer_sign)
VALUES 
  ('standard_crm', 'Padrão CRM', 'Perfil genérico sem retenção obrigatória hardcoded', NULL, FALSE),
  ('health_rdc660', 'Saúde & RDC 660 Anvisa', 'Perfil para documentos de saúde com retenção e revisão estritas', NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Tabela de Configurações de Conformidade do Tenant
CREATE TABLE IF NOT EXISTS public.account_compliance_settings (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  compliance_profile_id UUID REFERENCES public.compliance_profiles(id),
  custom_retention_days INT,
  retention_legal_basis TEXT,
  retention_defined_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  retention_effective_at TIMESTAMPTZ,
  require_reviewer_sign BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_compliance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Compliance settings select" ON public.account_compliance_settings;
CREATE POLICY "Compliance settings select" ON public.account_compliance_settings
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Compliance settings update" ON public.account_compliance_settings;
CREATE POLICY "Compliance settings update" ON public.account_compliance_settings
  FOR ALL USING (is_account_member(account_id, 'admin'));

-- 3. Bucket Privado no Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'protected-documents',
  'protected-documents',
  FALSE, -- ESTRITAMENTE PRIVADO (ponytail: URLs estáticas privadas apenas)
  52428800, -- 50 MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit;

-- RLS do Bucket Privado
DROP POLICY IF EXISTS "Protected docs select" ON storage.objects;
CREATE POLICY "Protected docs select" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'protected-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Protected docs insert" ON storage.objects;
CREATE POLICY "Protected docs insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'protected-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

-- 4. Tabela de Documentos Lógicos
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
  deal_id UUID REFERENCES public.deals(id) ON DELETE RESTRICT,
  
  document_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado' 
    CHECK (status IN ('solicitado', 'recebido', 'em_analise', 'aprovado', 'recusado', 'vencido')),
  
  received_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  rejection_reason TEXT,
  
  version INT NOT NULL DEFAULT 1,
  current_version_id UUID,
  
  uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  
  retention_until TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_account ON public.documents(account_id);
CREATE INDEX IF NOT EXISTS idx_documents_contact ON public.documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_deal ON public.documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Documents select" ON public.documents;
CREATE POLICY "Documents select" ON public.documents FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Documents insert" ON public.documents;
CREATE POLICY "Documents insert" ON public.documents FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "Documents update" ON public.documents;
CREATE POLICY "Documents update" ON public.documents FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "Documents delete" ON public.documents;
CREATE POLICY "Documents delete" ON public.documents FOR DELETE USING (is_account_member(account_id, 'admin'));

-- 5. Tabela de Versões Físicas de Documentos
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  checksum_sha256 TEXT,
  
  uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (document_id, version_number)
);

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS fk_documents_current_version;
ALTER TABLE public.documents ADD CONSTRAINT fk_documents_current_version 
  FOREIGN KEY (current_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doc versions select" ON public.document_versions;
CREATE POLICY "Doc versions select" ON public.document_versions FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Doc versions insert" ON public.document_versions;
CREATE POLICY "Doc versions insert" ON public.document_versions FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- 6. Tabela de Histórico Imutável de Status
CREATE TABLE IF NOT EXISTS public.document_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  reason TEXT,
  origin TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.document_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Status history select" ON public.document_status_history;
CREATE POLICY "Status history select" ON public.document_status_history FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Status history insert" ON public.document_status_history;
CREATE POLICY "Status history insert" ON public.document_status_history FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- 7. Templates de Checklist
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE CASCADE,
  pipeline_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Templates select" ON public.checklist_templates;
CREATE POLICY "Templates select" ON public.checklist_templates FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Templates manage" ON public.checklist_templates;
CREATE POLICY "Templates manage" ON public.checklist_templates FOR ALL USING (is_account_member(account_id, 'admin'));

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  due_days_offset INT
);

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Template items select" ON public.checklist_template_items;
CREATE POLICY "Template items select" ON public.checklist_template_items FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Template items manage" ON public.checklist_template_items;
CREATE POLICY "Template items manage" ON public.checklist_template_items FOR ALL USING (is_account_member(account_id, 'admin'));

-- 8. Tabela de Itens de Checklist Operacionais
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'waived')),
  
  due_date TIMESTAMPTZ,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  notes TEXT,
  
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Checklist select" ON public.checklist_items;
CREATE POLICY "Checklist select" ON public.checklist_items FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Checklist insert" ON public.checklist_items;
CREATE POLICY "Checklist insert" ON public.checklist_items FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "Checklist update" ON public.checklist_items;
CREATE POLICY "Checklist update" ON public.checklist_items FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "Checklist delete" ON public.checklist_items;
CREATE POLICY "Checklist delete" ON public.checklist_items FOR DELETE USING (is_account_member(account_id, 'admin'));

-- 9. Trigger PL/pgSQL de Validação Estrita de Multi-Tenant (8 Vínculos)
CREATE OR REPLACE FUNCTION public.validate_document_and_checklist_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Validar Document
  IF TG_TABLE_NAME = 'documents' THEN
    IF NEW.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = NEW.contact_id AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'contact_id pertence a outra conta';
    END IF;
    IF NEW.deal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deals WHERE id = NEW.deal_id AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'deal_id pertence a outra conta';
    END IF;
  END IF;

  -- Validar Document Version
  IF TG_TABLE_NAME = 'document_versions' THEN
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.document_id AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'document_id da versão pertence a outra conta';
    END IF;
  END IF;

  -- Validar Checklist Item
  IF TG_TABLE_NAME = 'checklist_items' THEN
    IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = NEW.deal_id AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'deal_id pertence a outra conta';
    END IF;
    IF NEW.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = NEW.contact_id AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'contact_id pertence a outra conta';
    END IF;
    IF NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.document_id AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'document_id pertence a outra conta';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_documents_account ON public.documents;
CREATE TRIGGER trg_validate_documents_account
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_and_checklist_accounts();

DROP TRIGGER IF EXISTS trg_validate_document_versions_account ON public.document_versions;
CREATE TRIGGER trg_validate_document_versions_account
  BEFORE INSERT OR UPDATE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_and_checklist_accounts();

DROP TRIGGER IF EXISTS trg_validate_checklist_account ON public.checklist_items;
CREATE TRIGGER trg_validate_checklist_account
  BEFORE INSERT OR UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_and_checklist_accounts();

-- 10. Trigger de Gravação Automática de Histórico de Status
CREATE OR REPLACE FUNCTION public.log_document_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.document_status_history (
      account_id,
      document_id,
      previous_status,
      new_status,
      changed_by_user_id,
      reason,
      origin
    ) VALUES (
      NEW.account_id,
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      COALESCE(NEW.reviewed_by_user_id, NEW.uploaded_by_user_id, auth.uid()),
      NEW.rejection_reason,
      'system_trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_document_status_change ON public.documents;
CREATE TRIGGER trg_log_document_status_change
  AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.log_document_status_change();

-- 11. Trigger de Trava de Retenção Legal (Impedir DELETE físico durante retenção)
CREATE OR REPLACE FUNCTION public.prevent_document_delete_during_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.retention_until IS NOT NULL AND OLD.retention_until > NOW() THEN
    RAISE EXCEPTION 'Exclusão recusada: Documento sob período obrigatório de retenção legal até %', OLD.retention_until;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_document_delete_during_retention ON public.documents;
CREATE TRIGGER trg_prevent_document_delete_during_retention
  BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_document_delete_during_retention();

