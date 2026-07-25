import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SignatureRequestService } from '@/lib/signatures/signature-request-service';
import { MockSignatureAdapter } from '@/lib/signatures/provider-adapter';

// POST /api/signature-requests/[requestId]/access-link - Protected access link retrieval
export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;
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

    const service = new SignatureRequestService(new MockSignatureAdapter());

    const accessData = await service.getAccessLink({
      requestId,
      accountId: profile.account_id,
      userId: user.id,
      userRole: profile.role || 'agent',
    });

    return NextResponse.json({
      request_id: accessData.requestId,
      status: accessData.status,
      signing_link: accessData.signingLink,
      instruction_message: accessData.instructionMessage,
    });
  } catch (err: any) {
    console.error('[POST /api/signature-requests/[requestId]/access-link] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Falha ao recuperar link de assinatura.' },
      { status: 400 }
    );
  }
}
