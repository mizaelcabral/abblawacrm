-- Migration 064: Signature Templates and ZapSign Enhancements (Phase 1)
-- 100% Additive and Backward Compatible

-- 1. Create signature_templates table
CREATE TABLE IF NOT EXISTS public.signature_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'procuracao',
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    signatory_rule TEXT NOT NULL DEFAULT 'contact_only' CHECK (signatory_rule IN ('contact_only', 'guardian_if_minor', 'guardian_only')),
    delivery_mode TEXT NOT NULL DEFAULT 'manual_link' CHECK (delivery_mode IN ('manual_link', 'zapsign_email', 'zapsign_whatsapp')),
    field_mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes & RLS for signature_templates
CREATE INDEX IF NOT EXISTS idx_signature_templates_account_id ON public.signature_templates(account_id);

ALTER TABLE public.signature_templates ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'signature_templates' 
        AND policyname = 'Tenants can manage their own signature_templates'
    ) THEN
        CREATE POLICY "Tenants can manage their own signature_templates" 
        ON public.signature_templates 
        FOR ALL 
        USING (is_account_member(account_id));
    END IF;
END $$;

-- 2. Additive nullable columns on zapsign_config
ALTER TABLE public.zapsign_config 
ADD COLUMN IF NOT EXISTS webhook_secret TEXT NULL,
ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'manual_link';

-- 3. Additive nullable columns on zapsign_documents
ALTER TABLE public.zapsign_documents
ADD COLUMN IF NOT EXISTS request_id UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS deal_id UUID NULL REFERENCES public.deals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS document_id UUID NULL REFERENCES public.documents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS template_id UUID NULL REFERENCES public.signature_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL,
ADD COLUMN IF NOT EXISTS signatory_type TEXT NULL CHECK (signatory_type IS NULL OR signatory_type IN ('contact', 'guardian')),
ADD COLUMN IF NOT EXISTS encrypted_signer_token TEXT NULL,
ADD COLUMN IF NOT EXISTS encrypted_sign_url TEXT NULL,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS raw_status TEXT NULL;

-- 4. Indexes for zapsign_documents
CREATE UNIQUE INDEX IF NOT EXISTS idx_zapsign_documents_request_id ON public.zapsign_documents(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zapsign_documents_idempotency ON public.zapsign_documents(account_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zapsign_documents_deal_id ON public.zapsign_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_zapsign_documents_document_id ON public.zapsign_documents(document_id);
