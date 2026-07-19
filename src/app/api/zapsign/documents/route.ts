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

    return NextResponse.json({
      documents: documents || [],
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
