import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  SignatureTemplate,
  createSignatureTemplateSchema,
  updateSignatureTemplateSchema,
} from '@/types/signatures';

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
    throw new Error('Falha ao salvar modelo de assinatura.');
  }

  // Audit log for template creation (sanitized, no PII)
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
