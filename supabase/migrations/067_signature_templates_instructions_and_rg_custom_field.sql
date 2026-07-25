-- Migration 067: Additive columns for Signature Templates instruction messages and RG custom field setup

-- 1. Add instruction message and privacy notice columns to signature_templates
ALTER TABLE public.signature_templates
ADD COLUMN IF NOT EXISTS instruction_message_template TEXT NULL,
ADD COLUMN IF NOT EXISTS privacy_notice_url TEXT NULL,
ADD COLUMN IF NOT EXISTS destination_document_type TEXT NOT NULL DEFAULT 'procuracao';

-- 2. Register 'rg' custom field for the test account if missing
INSERT INTO public.custom_fields (account_id, user_id, field_name, field_key, field_type, group_name, is_active, display_order)
SELECT '1267974e-27b7-4eb5-b3f6-ae66da045ec6', 'eb2fd73f-d57d-4ee4-925c-4d292fb59f87', 'RG', 'rg', 'text', 'Dados pessoais', true, 15
WHERE NOT EXISTS (
    SELECT 1 FROM public.custom_fields 
    WHERE account_id = '1267974e-27b7-4eb5-b3f6-ae66da045ec6' AND field_key = 'rg'
);
