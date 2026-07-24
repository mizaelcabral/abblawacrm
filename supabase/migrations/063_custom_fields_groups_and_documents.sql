-- ============================================================
-- 063_custom_fields_groups_and_documents.sql
-- ponytail: Additive, backward-compatible schema extensions for
-- contact custom fields (groups, stable keys, active flag) and
-- document multi-deal association.
-- ============================================================

-- 1. Extend custom_fields with group_name, field_key, is_active, display_order
ALTER TABLE public.custom_fields
  ADD COLUMN IF NOT EXISTS field_key TEXT,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_regex TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for custom_fields queries per account
CREATE INDEX IF NOT EXISTS idx_custom_fields_account_active ON public.custom_fields(account_id, is_active);

-- 2. Extend contact_custom_values with updated_at and updated_by_user_id
ALTER TABLE public.contact_custom_values
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Add document_deals junction table for multi-deal association without removing documents.deal_id
CREATE TABLE IF NOT EXISTS public.document_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_document_deals_account ON public.document_deals(account_id);
CREATE INDEX IF NOT EXISTS idx_document_deals_document ON public.document_deals(document_id);
CREATE INDEX IF NOT EXISTS idx_document_deals_deal ON public.document_deals(deal_id);

ALTER TABLE public.document_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Document deals select" ON public.document_deals;
CREATE POLICY "Document deals select" ON public.document_deals
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Document deals insert" ON public.document_deals;
CREATE POLICY "Document deals insert" ON public.document_deals
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Document deals delete" ON public.document_deals;
CREATE POLICY "Document deals delete" ON public.document_deals
  FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Validation trigger for document_deals multi-tenant integrity
CREATE OR REPLACE FUNCTION public.validate_document_deals_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.document_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'document_id pertence a outra conta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = NEW.deal_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'deal_id pertence a outra conta';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_document_deals_account ON public.document_deals;
CREATE TRIGGER trg_validate_document_deals_account
  BEFORE INSERT OR UPDATE ON public.document_deals
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_deals_account();
