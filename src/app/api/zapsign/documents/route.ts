import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return data.account_id as string;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ error: 'Conta não vinculada.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const searchFilter = searchParams.get('search');

    // 1. Build document list query
    let query = supabase
      .from('zapsign_documents')
      .select('*, contact:contacts(id, name, phone, email)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (searchFilter) {
      query = query.or(`doc_name.ilike.%${searchFilter}%,signer_name.ilike.%${searchFilter}%`);
    }

    const { data: documents, error: docsError } = await query;

    if (docsError) {
      console.error('Error fetching zapsign documents:', docsError);
      return NextResponse.json({ error: 'Falha ao buscar assinaturas.' }, { status: 500 });
    }

    // 2. Fetch metrics
    const { data: allDocs, error: metricsError } = await supabase
      .from('zapsign_documents')
      .select('status')
      .eq('account_id', accountId);

    if (metricsError) {
      console.error('Error fetching zapsign document metrics:', metricsError);
    }

    const total = allDocs?.length || 0;
    const pending = allDocs?.filter((d) => d.status === 'pending').length || 0;
    const signed = allDocs?.filter((d) => d.status === 'signed').length || 0;
    const failed = allDocs?.filter((d) => ['refused', 'expired', 'cancelled'].includes(d.status)).length || 0;

    const sanitizedDocuments = (documents || []).map((doc: any) => ({
      id: doc.id,
      request_id: doc.request_id || doc.id,
      account_id: doc.account_id,
      contact_id: doc.contact_id,
      deal_id: doc.deal_id || null,
      document_id: doc.document_id || null,
      template_id: doc.template_id || null,
      doc_name: doc.doc_name,
      status: doc.status,
      signer_name: doc.signer_name,
      signer_email: doc.signer_email,
      signer_phone: doc.signer_phone,
      signatory_type: doc.signatory_type || 'contact',
      signed_at: doc.signed_at,
      rejection_reason: doc.rejection_reason || null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      can_open_signing_link: Boolean(doc.sign_url || doc.encrypted_sign_url),
      contact: doc.contact,
    }));

    return NextResponse.json({
      documents: sanitizedDocuments,
      metrics: {
        total,
        pending,
        signed,
        failed,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/zapsign/documents:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar assinaturas.' },
      { status: 500 }
    );
  }
}
