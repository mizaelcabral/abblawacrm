import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SignatureRequestService } from '@/lib/signatures/signature-request-service';
import { MockSignatureAdapter } from '@/lib/signatures/provider-adapter';

// POST /api/signature-requests/webhook-mock - Simulates webhook event processing in local dev/tests ONLY
export async function POST(request: Request) {
  // Strict Production Protection: Always return 404 in production environment
  if (process.env.NODE_ENV === 'production' && process.env.SIGNATURE_MOCK_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Endpoint não encontrado.' }, { status: 404 });
  }

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
    const { event_type, doc_token } = body;

    if (!event_type || !doc_token) {
      return NextResponse.json({ error: 'event_type e doc_token são obrigatórios' }, { status: 400 });
    }

    const service = new SignatureRequestService(new MockSignatureAdapter());

    const result = await service.processWebhookEvent({
      eventType: event_type,
      docToken: doc_token,
      accountId: profile.account_id,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[POST /api/signature-requests/webhook-mock] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Falha ao reprocessar evento simulado.' },
      { status: 400 }
    );
  }
}
