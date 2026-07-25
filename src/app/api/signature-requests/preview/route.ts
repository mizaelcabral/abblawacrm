import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { resolveSignatory } from '@/lib/signatures/signatory-resolver';
import { resolveSystemValue } from '@/lib/signatures/system-value-resolver';
import { formatInstructionMessage } from '@/lib/signatures/instruction-message-formatter';
import { ALLOWED_CONTACT_PROPERTIES } from '@/types/signatures';

// POST /api/signature-requests/preview - Pure read-only preview with zero side effects
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile || !profile.account_id) {
      return NextResponse.json({ error: 'Perfil sem conta ativa' }, { status: 403 });
    }

    const body = await request.json();
    const { contact_id, signature_template_id } = body;

    if (!contact_id || !signature_template_id) {
      return NextResponse.json(
        { error: 'contact_id e signature_template_id são obrigatórios para a pré-visualização.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    // 1. Fetch Active Template
    const { data: template, error: tplErr } = await admin
      .from('signature_templates')
      .select('*')
      .eq('id', signature_template_id)
      .eq('account_id', profile.account_id)
      .eq('is_active', true)
      .maybeSingle();

    if (tplErr || !template) {
      return NextResponse.json(
        { error: 'Modelo de assinatura não encontrado ou desativado.' },
        { status: 404 }
      );
    }

    // 2. Fetch Contact
    const { data: contact, error: cErr } = await admin
      .from('contacts')
      .select('id, name, email, phone, company, custom_fields')
      .eq('id', contact_id)
      .eq('account_id', profile.account_id)
      .single();

    if (cErr || !contact) {
      return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 });
    }

    // 3. Resolve Signatory
    const signatoryRes = resolveSignatory(template.signatory_rule, contact);
    if (signatoryRes.is_blocked || !signatoryRes.signatory) {
      return NextResponse.json({
        is_valid: false,
        block_reason: signatoryRes.block_reason,
        missing_fields: signatoryRes.missing_fields || [],
      });
    }

    // 4. Evaluate Variables
    const customFields = contact.custom_fields || {};
    const variables: Array<{ de: string; para: string; is_required: boolean }> = [];
    const missingRequiredVariables: string[] = [];

    for (const mapping of template.field_mappings || []) {
      let resolvedValue: string | undefined = undefined;

      if (mapping.source_type === 'contact_property') {
        if (ALLOWED_CONTACT_PROPERTIES.has(mapping.source_key)) {
          resolvedValue = (contact as any)[mapping.source_key] || undefined;
        }
      } else if (mapping.source_type === 'custom_field') {
        resolvedValue = customFields[mapping.source_key] !== undefined && customFields[mapping.source_key] !== null
          ? String(customFields[mapping.source_key])
          : undefined;
      } else if (mapping.source_type === 'fixed_value') {
        resolvedValue = mapping.default_value;
      } else if (mapping.source_type === 'system_value') {
        const sysRes = resolveSystemValue(mapping.source_key, customFields);
        if (sysRes.is_blocked || !sysRes.value) {
          missingRequiredVariables.push(mapping.zapsign_var);
        } else {
          resolvedValue = sysRes.value;
        }
      }

      if (!resolvedValue || !resolvedValue.trim()) {
        if (mapping.is_required) {
          missingRequiredVariables.push(mapping.source_key || mapping.zapsign_var);
        } else if (mapping.default_value) {
          resolvedValue = mapping.default_value;
        }
      }

      if (resolvedValue) {
        variables.push({
          de: mapping.zapsign_var,
          para: resolvedValue.trim(),
          is_required: mapping.is_required,
        });
      }
    }

    if (missingRequiredVariables.length > 0) {
      return NextResponse.json({
        is_valid: false,
        block_reason: `Campos obrigatórios do documento não preenchidos: ${missingRequiredVariables.join(', ')}`,
        missing_fields: missingRequiredVariables,
      });
    }

    // 5. Format Instruction Message Preview
    const firstName = contact.name ? contact.name.split(' ')[0] : 'Cliente';
    const formattedMsg = formatInstructionMessage({
      templateText: template.instruction_message_template,
      firstName,
      signingLink: '[LINK_SERA_GERADO_NA_ASSINATURA]',
      privacyNoticeUrl: template.privacy_notice_url,
    });

    return NextResponse.json({
      is_valid: true,
      template_name: template.template_name,
      signatory: signatoryRes.signatory,
      variables_count: variables.length,
      instruction_message: formattedMsg.message,
    });
  } catch (err: any) {
    console.error('[POST /api/signature-requests/preview] Error:', err);
    return NextResponse.json({ error: 'Erro ao gerar pré-visualização.' }, { status: 500 });
  }
}
