import { z } from 'zod';

export type SignatoryRule = 'contact_only' | 'guardian_if_minor' | 'guardian_only';
export type DeliveryMode = 'manual_link' | 'zapsign_email' | 'zapsign_whatsapp';
export type FieldSourceType = 'contact_property' | 'custom_field' | 'fixed_value' | 'system_value';
export type FieldFormatType = 'uppercase' | 'lowercase' | 'digits_only' | 'date_ptbr';

export type SignatureRequestStatus =
  | 'draft'
  | 'creating'
  | 'pending'
  | 'viewed'
  | 'signed'
  | 'refused'
  | 'expired'
  | 'cancelled'
  | 'error';

// Strict allowlist for native columns on the contacts table ONLY.
export const ALLOWED_CONTACT_PROPERTIES = new Set(['name', 'phone', 'email', 'company']);

// Strict allowlist for system values
export const ALLOWED_SYSTEM_VALUES = new Set(['contact_city_current_date_ptbr']);

export interface FieldMapping {
  zapsign_var: string;
  source_type: FieldSourceType;
  source_key: string;
  default_value?: string;
  is_required: boolean;
  format?: FieldFormatType;
}

export interface SignatureTemplate {
  id: string;
  account_id: string;
  template_id: string;
  template_name: string;
  category: string;
  description: string | null;
  is_active: boolean;
  signatory_rule: SignatoryRule;
  delivery_mode: DeliveryMode;
  field_mappings: FieldMapping[];
  instruction_message_template?: string | null;
  privacy_notice_url?: string | null;
  destination_document_type?: string;
  created_at: string;
  updated_at: string;
}

export const fieldMappingSchema = z.object({
  zapsign_var: z
    .string()
    .min(1, 'Variável é obrigatória')
    .max(100),
  source_type: z.enum(['contact_property', 'custom_field', 'fixed_value', 'system_value']),
  source_key: z
    .string()
    .min(1, 'Chave de origem é obrigatória')
    .max(100),
  default_value: z.string().max(500).optional(),
  is_required: z.boolean().default(false),
  format: z.enum(['uppercase', 'lowercase', 'digits_only', 'date_ptbr']).optional(),
});

export const createSignatureTemplateSchema = z.object({
  template_id: z.string().min(1, 'ID do modelo na ZapSign é obrigatório'),
  template_name: z.string().min(1, 'Nome do modelo é obrigatório'),
  category: z.string().min(1, 'Categoria é obrigatória').default('procuracao'),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  signatory_rule: z.enum(['contact_only', 'guardian_if_minor', 'guardian_only']).default('contact_only'),
  delivery_mode: z.enum(['manual_link', 'zapsign_email', 'zapsign_whatsapp']).default('manual_link'),
  field_mappings: z.array(fieldMappingSchema).max(50, 'Máximo 50 mapeamentos por modelo').default([]),
  instruction_message_template: z.string().nullable().optional(),
  privacy_notice_url: z.string().url('URL deve ser HTTPS').nullable().optional(),
  destination_document_type: z.string().default('procuracao'),
});

export const updateSignatureTemplateSchema = createSignatureTemplateSchema.partial();
