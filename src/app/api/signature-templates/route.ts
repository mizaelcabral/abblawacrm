import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSignatureTemplates,
  createSignatureTemplate,
} from '@/lib/signatures/template-service';

async function resolveProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ accountId: string; email: string; role: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id, email, account_role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return {
    accountId: data.account_id as string,
    email: data.email as string,
    role: (data.account_role as string) || 'agent',
  };
}

// GET /api/signature-templates - List internal signature templates
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const profile = await resolveProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Perfil sem conta ativa.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get('active') === 'true';

    const templates = await getSignatureTemplates(profile.accountId, onlyActive);
    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error('[signature-templates] Error in GET:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar modelos de assinatura.' },
      { status: 500 }
    );
  }
}

// POST /api/signature-templates - Create signature template (Admin/Owner only)
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

    const profile = await resolveProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Perfil sem conta ativa.' }, { status: 403 });
    }

    // Role Security: Only Owner and Admin can create templates
    if (!['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Acesso negado: Apenas administradores podem configurar modelos.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const created = await createSignatureTemplate(
      profile.accountId,
      user.id,
      profile.email,
      body
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error('[signature-templates] Error in POST:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao criar modelo de assinatura.' },
      { status: 400 }
    );
  }
}
