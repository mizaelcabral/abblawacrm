-- Migration 066: Fix SECURITY DEFINER search_path for Tenant Coherence Trigger Function

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
