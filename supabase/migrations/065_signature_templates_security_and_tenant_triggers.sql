-- Migration 065: Signature Templates Role Security, Unique Index, FK Rename and Tenant Coherence Triggers

-- 1. Rename template_id to signature_template_id in zapsign_documents
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'zapsign_documents' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE public.zapsign_documents RENAME COLUMN template_id TO signature_template_id;
  END IF;
END $$;

-- 2. Create Unique Index on signature_templates(account_id, template_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_templates_account_template ON public.signature_templates(account_id, template_id);

-- 3. Multi-Tenant Coherence Trigger Function for zapsign_documents
CREATE OR REPLACE FUNCTION public.fn_check_zapsign_documents_tenant_coherence()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.contact_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = NEW.contact_id AND account_id = NEW.account_id) THEN
            RAISE EXCEPTION 'O contato informado pertence a outra conta.';
        END IF;
    END IF;

    IF NEW.deal_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = NEW.deal_id AND account_id = NEW.account_id) THEN
            RAISE EXCEPTION 'O negócio informado pertence a outra conta.';
        END IF;
    END IF;

    IF NEW.document_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.document_id AND account_id = NEW.account_id) THEN
            RAISE EXCEPTION 'O documento informado pertence a outra conta.';
        END IF;
    END IF;

    IF NEW.signature_template_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.signature_templates WHERE id = NEW.signature_template_id AND account_id = NEW.account_id) THEN
            RAISE EXCEPTION 'O modelo de assinatura informado pertence a outra conta.';
        END IF;
    END IF;

    IF NEW.conversation_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = NEW.conversation_id AND account_id = NEW.account_id) THEN
            RAISE EXCEPTION 'A conversa informada pertence a outra conta.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_zapsign_documents_tenant_check ON public.zapsign_documents;
CREATE TRIGGER trg_zapsign_documents_tenant_check
BEFORE INSERT OR UPDATE ON public.zapsign_documents
FOR EACH ROW EXECUTE FUNCTION public.fn_check_zapsign_documents_tenant_coherence();

-- 4. Role-Based RLS Policies on signature_templates
DROP POLICY IF EXISTS "Tenants can manage their own signature_templates" ON public.signature_templates;
DROP POLICY IF EXISTS "Tenants select signature_templates" ON public.signature_templates;
DROP POLICY IF EXISTS "Admins insert signature_templates" ON public.signature_templates;
DROP POLICY IF EXISTS "Admins update signature_templates" ON public.signature_templates;
DROP POLICY IF EXISTS "Admins delete signature_templates" ON public.signature_templates;

-- SELECT allowed for all account members (including agents)
CREATE POLICY "Tenants select signature_templates"
ON public.signature_templates FOR SELECT
USING (is_account_member(account_id, 'viewer'));

-- INSERT/UPDATE/DELETE strictly restricted to owners and admins
CREATE POLICY "Admins insert signature_templates"
ON public.signature_templates FOR INSERT
WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY "Admins update signature_templates"
ON public.signature_templates FOR UPDATE
USING (is_account_member(account_id, 'admin'))
WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY "Admins delete signature_templates"
ON public.signature_templates FOR DELETE
USING (is_account_member(account_id, 'admin'));

-- 5. Role-Based RLS Policies on zapsign_config
DROP POLICY IF EXISTS "Tenants can manage their own zapsign_config" ON public.zapsign_config;
DROP POLICY IF EXISTS "Admins select zapsign_config" ON public.zapsign_config;
DROP POLICY IF EXISTS "Admins insert zapsign_config" ON public.zapsign_config;
DROP POLICY IF EXISTS "Admins update zapsign_config" ON public.zapsign_config;

CREATE POLICY "Admins select zapsign_config"
ON public.zapsign_config FOR SELECT
USING (is_account_member(account_id, 'admin'));

CREATE POLICY "Admins insert zapsign_config"
ON public.zapsign_config FOR INSERT
WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY "Admins update zapsign_config"
ON public.zapsign_config FOR UPDATE
USING (is_account_member(account_id, 'admin'))
WITH CHECK (is_account_member(account_id, 'admin'));
