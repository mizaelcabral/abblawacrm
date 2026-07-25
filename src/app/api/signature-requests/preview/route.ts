import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { resolveSignatory } from '@/lib/signatures/signatory-resolver';
import { resolveSystemValue } from '@/lib/signatures/system-value-resolver';
import { formatInstructionMessage } from '@/lib/signatures/instruction-message-formatter';
import { getContactWithCustomFields } from '@/lib/signatures/contact-helper';
import { ALLOWED_CONTACT_PROPERTIES } from '@/types/signatures';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateCorrelationId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PREVIEW-${ts}-${rand}`;
}

// POST /api/signature-requests/preview - Read-only preview with zero side effects
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado.', correlation_id: correlationId },
        { status: 401 }
      );
    }

    const admin = supabaseAdmin();

    // 1. Canonical Tenant Resolution (same as /api/signature-templates & /api/contacts)
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('account_id, email, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profErr || !profile || !profile.account_id) {
      console.warn(`[POST /api/signature-requests/preview] Profile/Account Resolution Failed (${correlationId}):`, {
        userId: user.id,
        hasProfile: !!profile,
        hasAccountId: !!profile?.account_id,
        error: profErr?.message,
      });
      return NextResponse.json(
        { error: 'Perfil sem conta ativa.', correlation_id: correlationId },
        { status: 403 }
      );
    }

    const accountId = profile.account_id;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo da requisição inválido (JSON esperado).', correlation_id: correlationId },
        { status: 400 }
      );
    }

    const { contact_id, signature_template_id, deal_id } = body;

    // 2. Contract & Format Audits
    if (!contact_id) {
      return NextResponse.json(
        { error: 'O parâmetro contact_id é obrigatório.', correlation_id: correlationId },
        { status: 400 }
      );
    }

    if (!signature_template_id) {
      return NextResponse.json(
        { error: 'O parâmetro signature_template_id é obrigatório.', correlation_id: correlationId },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(contact_id)) {
      return NextResponse.json(
        { error: `O contact_id enviado ('${contact_id}') é inválido. Formato UUID esperado.`, correlation_id: correlationId },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(signature_template_id)) {
      // Check if external template_id was sent instead of internal UUID
      const { data: extCheck } = await admin
        .from('signature_templates')
        .select('id, template_name')
        .eq('account_id', accountId)
        .eq('template_id', signature_template_id)
        .maybeSingle();

      if (extCheck) {
        return NextResponse.json(
          {
            error: `O ID enviado ('${signature_template_id}') é o template_id externo da ZapSign. Utilize o signature_template_id interno (UUID) do modelo '${extCheck.template_name}'.`,
            correlation_id: correlationId,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: `O signature_template_id enviado ('${signature_template_id}') é inválido. Formato UUID esperado.`, correlation_id: correlationId },
        { status: 400 }
      );
    }

    // 3. Fetch Active Internal Template
    const { data: template, error: tplErr } = await admin
      .from('signature_templates')
      .select('*')
      .eq('id', signature_template_id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (tplErr || !template) {
      return NextResponse.json(
        { error: 'Modelo de assinatura não encontrado nesta conta.', correlation_id: correlationId },
        { status: 404 }
      );
    }

    if (!template.is_active) {
      return NextResponse.json(
        { error: 'Este modelo de assinatura está desativado.', correlation_id: correlationId },
        { status: 400 }
      );
    }

    // 4. Fetch Contact with Relational Custom Fields
    const contact = await getContactWithCustomFields(accountId, contact_id);

    if (!contact) {
      console.warn(`[POST /api/signature-requests/preview] Contact Not Found (${correlationId}):`, {
        userId: user.id,
        resolvedAccountId: accountId,
        requestedContactId: contact_id,
        resolutionSource: 'profile',
      });

      return NextResponse.json(
        { error: 'Contato não encontrado nesta conta.', correlation_id: correlationId },
        { status: 404 }
      );
    }

    // 5. Deal Link Validation (if provided)
    if (deal_id) {
      if (!UUID_REGEX.test(deal_id)) {
        return NextResponse.json(
          { error: `O deal_id enviado ('${deal_id}') é inválido. Formato UUID esperado.`, correlation_id: correlationId },
          { status: 400 }
        );
      }

      const { data: deal, error: dealErr } = await admin
        .from('deals')
        .select('id, contact_id, account_id')
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (dealErr || !deal || deal.contact_id !== contact_id) {
        return NextResponse.json(
          { error: 'O negócio informado não pertence ao contato ou a esta conta.', correlation_id: correlationId },
          { status: 400 }
        );
      }
    }

    // 6. Resolve Signatory Rule
    const signatoryRes = resolveSignatory(template.signatory_rule, contact);
    if (signatoryRes.is_blocked || !signatoryRes.signatory) {
      return NextResponse.json({
        is_valid: false,
        block_reason: signatoryRes.block_reason,
        missing_fields: signatoryRes.missing_fields || [],
        correlation_id: correlationId,
      });
    }

    // 7. Evaluate Variable Mappings (DOCX de/para) & Categorize Breakdown
    const customFields = contact.custom_fields || {};
    const isMinor = customFields.is_minor === true || String(customFields.is_minor).toLowerCase() === 'true';

    const fieldMappings = template.field_mappings || [];
    const totalMappings = fieldMappings.length;
    const variables: Array<{ de: string; para: string; is_required: boolean }> = [];
    const missingRequiredVariables: string[] = [];

    let filledCount = 0;
    let nonApplicableCount = 0;

    for (const mapping of fieldMappings) {
      const sourceKey = mapping.source_key || '';
      const isGuardianField = sourceKey === 'guardian_name' || sourceKey === 'guardian_cpf' || sourceKey.startsWith('guardian_');

      // Conditional non-applicable check: Guardian fields for adult patient are non-applicable
      if (!isMinor && isGuardianField) {
        nonApplicableCount++;
        continue;
      }

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
          missingRequiredVariables.push(mapping.source_key || mapping.zapsign_var);
        } else {
          resolvedValue = sysRes.value;
        }
      }

      if (!resolvedValue || !resolvedValue.trim()) {
        if (mapping.is_required) {
          missingRequiredVariables.push(mapping.source_key || mapping.zapsign_var);
        } else if (mapping.default_value) {
          resolvedValue = mapping.default_value;
        } else {
          nonApplicableCount++;
        }
      }

      if (resolvedValue && resolvedValue.trim()) {
        filledCount++;
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
        correlation_id: correlationId,
      });
    }

    // 8. Format Instruction Message Preview
    const firstName = contact.name ? contact.name.split(' ')[0] : 'Cliente';
    const formattedMsg = formatInstructionMessage({
      templateText: template.instruction_message_template,
      firstName,
      signingLink: '[LINK_SERA_GERADO_NA_ASSINATURA]',
      privacyNoticeUrl: template.privacy_notice_url,
    });

    // Sanitized Server Log (NO PII)
    console.info(`[POST /api/signature-requests/preview] Success (${correlationId}):`, {
      correlationId,
      userId: user.id,
      resolvedAccountId: accountId,
      requestedContactId: contact_id,
      contactAccountId: contact.account_id,
      templateId: template.id,
      signatoryType: signatoryRes.signatory.signatory_type,
      totalMappings,
      filledCount,
      nonApplicableCount,
      resolutionSource: 'profile',
    });

    return NextResponse.json({
      is_valid: true,
      template_name: template.template_name,
      signatory: signatoryRes.signatory,
      total_mappings: totalMappings,
      filled_variables_count: filledCount,
      non_applicable_variables_count: nonApplicableCount,
      variables_count: filledCount,
      instruction_message: formattedMsg.message,
      correlation_id: correlationId,
    });
  } catch (err: any) {
    console.error(`[POST /api/signature-requests/preview] Server Error (${correlationId}):`, err.message || err);
    return NextResponse.json(
      { error: 'Não foi possível gerar a pré-visualização. Tente novamente mais tarde.', correlation_id: correlationId },
      { status: 500 }
    );
  }
}
