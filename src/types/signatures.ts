import { z } from 'zod';

export type SignatoryRule = 'contact_only' | 'guardian_if_minor' | 'guardian_only';
export type DeliveryMode = 'manual_link' | 'zapsign_email' | 'zapsign_whatsapp';
export type FieldSourceType = 'contact_property' | 'custom_field' | 'fixed_value';
export type FieldFormatType = 'uppercase' | 'lowercase' | 'digits_only' | 'date_ptbr';

// Strict allowlist for native columns on the contacts table ONLY.
// Extended fields (cpf, birth_date, address, guardian_*, etc.) MUST be configured as custom_fields!
export const ALLOWED_CONTACT_PROPERTIES = new Set(['name', 'phone', 'email', 'company']);

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
  created_at: string;
  updated_at: string;
}

// Strict Zod schema for validating field mappings without allowing arbitrary code execution
export const fieldMappingSchema = z.object({
  zapsign_var: z
    .string()
    .min(1, 'Variável é obrigatória')
    .max(100)
    .regex(/^[a-zA-Z0-9_]+$/, 'Nome da variável deve conter apenas letras, números e underline'),
  source_type: z.enum(['contact_property', 'custom_field', 'fixed_value']),
  source_key: z
    .string()
    .min(1, 'Chave de origem é obrigatória')
    .max(100)
    .regex(/^[a-zA-Z0-9._]+$/, 'Chave de origem inválida'),
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
});

export const updateSignatureTemplateSchema = createSignatureTemplateSchema.partial();
