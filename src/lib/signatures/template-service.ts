import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  SignatureTemplate,
  createSignatureTemplateSchema,
  updateSignatureTemplateSchema,
  ALLOWED_CONTACT_PROPERTIES,
} from '@/types/signatures';

// ponytail: Helper to validate custom fields against database active custom_fields for account
async function validateFieldMappingsForAccount(
  accountId: string,
  fieldMappings: any[]
): Promise<void> {
  const admin = supabaseAdmin();
  const seenVars = new Set<string>();

  // 1. Check array size
  if (fieldMappings.length > 50) {
    throw new Error('O modelo não pode conter mais do que 50 mapeamentos de campos.');
  }

  // 2. Fetch active custom fields for the account
  const { data: customFields } = await admin
    .from('custom_fields')
    .select('field_key')
    .eq('account_id', accountId)
    .eq('is_active', true);

  const activeCustomFieldKeys = new Set((customFields || []).map((cf) => cf.field_key));

  for (const mapping of fieldMappings) {
    // 3. Duplicate zapsign_var check
    const varName = mapping.zapsign_var.trim();
    if (seenVars.has(varName)) {
      throw new Error(`Variável duplicada encontrada no modelo: {{${varName}}}`);
    }
    seenVars.add(varName);

    // 4. Validate source_type rules
    if (mapping.source_type === 'contact_property') {
      if (!ALLOWED_CONTACT_PROPERTIES.has(mapping.source_key)) {
        throw new Error(
          `Propriedade do contato inválida '${mapping.source_key}'. Permitidas: ${Array.from(ALLOWED_CONTACT_PROPERTIES).join(', ')}`
        );
      }
    } else if (mapping.source_type === 'custom_field') {
      if (!activeCustomFieldKeys.has(mapping.source_key)) {
        throw new Error(
          `Campo personalizado '${mapping.source_key}' não existe ou está desativado na conta.`
        );
      }
    } else if (mapping.source_type === 'fixed_value') {
      if (!mapping.default_value && !mapping.source_key) {
        throw new Error(
          `Mapeamento de valor fixo para '{{${varName}}}' exige um valor padrão preenchido.`
        );
      }
    }
  }
}

// ponytail: Service layer for signature templates management with tenant isolation and mandatory audit logging
export async function getSignatureTemplates(
  accountId: string,
  onlyActive = false
): Promise<SignatureTemplate[]> {
  const admin = supabaseAdmin();
  let query = admin
    .from('signature_templates')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[signatures/template-service] Error fetching templates:', error);
    throw new Error('Falha ao consultar modelos de assinatura.');
  }

  return (data || []) as SignatureTemplate[];
}

export async function getSignatureTemplateById(
  accountId: string,
  templateId: string
): Promise<SignatureTemplate | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('signature_templates')
    .select('*')
    .eq('id', templateId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('[signatures/template-service] Error fetching template by id:', error);
    throw new Error('Falha ao buscar modelo de assinatura.');
  }

  return (data as SignatureTemplate | null) || null;
}

export async function createSignatureTemplate(
  accountId: string,
  userId: string,
  userEmail: string,
  input: unknown
): Promise<SignatureTemplate> {
  const admin = supabaseAdmin();
  const parsed = createSignatureTemplateSchema.parse(input);

  // Validate field mappings against account custom fields and contact property allowlist
  await validateFieldMappingsForAccount(accountId, parsed.field_mappings);

  const { data: created, error } = await admin
    .from('signature_templates')
    .insert({
      account_id: accountId,
      template_id: parsed.template_id.trim(),
      template_name: parsed.template_name.trim(),
      category: parsed.category.trim(),
      description: parsed.description ? parsed.description.trim() : null,
      is_active: parsed.is_active,
      signatory_rule: parsed.signatory_rule,
      delivery_mode: parsed.delivery_mode,
      field_mappings: parsed.field_mappings,
    })
    .select('*')
    .single();

  if (error || !created) {
    console.error('[signatures/template-service] Error creating template:', error);
    if (error?.code === '23505') {
      throw new Error(`Já existe um modelo cadastrado com o ID externo '${parsed.template_id}' nesta conta.`);
    }
    throw new Error('Falha ao salvar modelo de assinatura.');
  }

  // Audit log for template creation (sanitized)
  await admin.from('audit_logs').insert({
    account_id: accountId,
    user_id: userId,
    user_email: userEmail,
    action: 'zapsign.template_created',
    target_type: 'signature_template',
    target_id: created.id,
    details: {
      template_name: created.template_name,
      category: created.category,
      signatory_rule: created.signatory_rule,
      delivery_mode: created.delivery_mode,
    },
  });

  return created as SignatureTemplate;
}

export async function updateSignatureTemplate(
  accountId: string,
  userId: string,
  userEmail: string,
  id: string,
  input: unknown
): Promise<SignatureTemplate> {
  const admin = supabaseAdmin();
  const parsed = updateSignatureTemplateSchema.parse(input);

  const existing = await getSignatureTemplateById(accountId, id);
  if (!existing) {
    throw new Error('Modelo de assinatura não encontrado.');
  }

  if (parsed.field_mappings) {
    await validateFieldMappingsForAccount(accountId, parsed.field_mappings);
  }

  const { data: updated, error } = await admin
    .from('signature_templates')
    .update({
      ...(parsed.template_id ? { template_id: parsed.template_id.trim() } : {}),
      ...(parsed.template_name ? { template_name: parsed.template_name.trim() } : {}),
      ...(parsed.category ? { category: parsed.category.trim() } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description ? parsed.description.trim() : null } : {}),
      ...(parsed.is_active !== undefined ? { is_active: parsed.is_active } : {}),
      ...(parsed.signatory_rule ? { signatory_rule: parsed.signatory_rule } : {}),
      ...(parsed.delivery_mode ? { delivery_mode: parsed.delivery_mode } : {}),
      ...(parsed.field_mappings ? { field_mappings: parsed.field_mappings } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('account_id', accountId)
    .select('*')
    .single();

  if (error || !updated) {
    console.error('[signatures/template-service] Error updating template:', error);
    if (error?.code === '23505') {
      throw new Error(`Já existe um modelo cadastrado com o ID externo '${parsed.template_id}' nesta conta.`);
    }
    throw new Error('Falha ao atualizar modelo de assinatura.');
  }

  // Audit log for template update
  await admin.from('audit_logs').insert({
    account_id: accountId,
    user_id: userId,
    user_email: userEmail,
    action: 'zapsign.template_updated',
    target_type: 'signature_template',
    target_id: updated.id,
    details: {
      template_name: updated.template_name,
      is_active: updated.is_active,
    },
  });

  return updated as SignatureTemplate;
}

export async function toggleSignatureTemplateStatus(
  accountId: string,
  userId: string,
  userEmail: string,
  id: string,
  isActive: boolean
): Promise<SignatureTemplate> {
  const admin = supabaseAdmin();
  const existing = await getSignatureTemplateById(accountId, id);
  if (!existing) {
    throw new Error('Modelo de assinatura não encontrado.');
  }

  const { data: updated, error } = await admin
    .from('signature_templates')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('account_id', accountId)
    .select('*')
    .single();

  if (error || !updated) {
    console.error('[signatures/template-service] Error toggling status:', error);
    throw new Error('Falha ao alterar status do modelo.');
  }

  // Audit log for template status change
  await admin.from('audit_logs').insert({
    account_id: accountId,
    user_id: userId,
    user_email: userEmail,
    action: isActive ? 'zapsign.template_created' : 'zapsign.template_disabled',
    target_type: 'signature_template',
    target_id: updated.id,
    details: {
      template_name: updated.template_name,
      is_active: isActive,
    },
  });

  return updated as SignatureTemplate;
}
