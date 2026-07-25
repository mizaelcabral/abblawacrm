import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { SignatureRequestService } from '@/lib/signatures/signature-request-service';
import { MockSignatureAdapter, ZapSignAdapter } from '@/lib/signatures/provider-adapter';

// POST /api/signature-requests - Create a new idempotent signature request
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
      .select('account_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile || !profile.account_id) {
      return NextResponse.json({ error: 'Perfil sem conta ativa' }, { status: 403 });
    }

    if (profile.role === 'viewer') {
      return NextResponse.json(
        { error: 'Acesso negado: usuários com papel de visualizador não podem solicitar assinaturas.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { contact_id, deal_id, signature_template_id, idempotency_key } = body;

    if (!contact_id || !signature_template_id || !idempotency_key) {
      return NextResponse.json(
        { error: 'contact_id, signature_template_id e idempotency_key são obrigatórios.' },
        { status: 400 }
      );
    }

    // Check if account has ZapSign credentials
    const admin = supabaseAdmin();
    const { data: zapsignConfig } = await admin
      .from('zapsign_config')
      .select('api_key, is_active')
      .eq('account_id', profile.account_id)
      .maybeSingle();

    // In Production or without explicit MOCK flag, require real ZapSign credentials
    if (process.env.NODE_ENV === 'production' && process.env.SIGNATURE_MOCK_ENABLED !== 'true') {
      if (!zapsignConfig || !zapsignConfig.is_active || !zapsignConfig.api_key) {
        return NextResponse.json(
          { error: 'Conexão com a ZapSign não configurada para esta conta. Acesse Configurações > ZapSign para cadastrar seu Token de API.' },
          { status: 400 }
        );
      }
    }

    // Determine adapter
    const isMockMode = process.env.NODE_ENV !== 'production' || process.env.SIGNATURE_MOCK_ENABLED === 'true';
    const adapter = isMockMode
      ? new MockSignatureAdapter()
      : new ZapSignAdapter(zapsignConfig?.api_key || '');

    const service = new SignatureRequestService(adapter);

    const result = await service.createRequest({
      accountId: profile.account_id,
      userId: user.id,
      contactId: contact_id,
      dealId: deal_id,
      signatureTemplateId: signature_template_id,
      idempotencyKey: idempotency_key,
    });

    return NextResponse.json({
      request_id: result.requestId,
      status: result.status,
      signatory_type: result.signatoryType,
      signatory_name: result.signatoryName,
      is_existing: result.isExisting,
    });
  } catch (err: any) {
    console.error('[POST /api/signature-requests] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Falha ao processar solicitação de assinatura' },
      { status: 400 }
    );
  }
}
