import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSignatureTemplateById,
  updateSignatureTemplate,
  toggleSignatureTemplateStatus,
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

// GET /api/signature-templates/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const template = await getSignatureTemplateById(profile.accountId, id);
    if (!template) {
      return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 444 });
    }

    return NextResponse.json(template);
  } catch (error: any) {
    console.error('[signature-templates/[id]] Error in GET:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar modelo de assinatura.' },
      { status: 500 }
    );
  }
}

// PUT /api/signature-templates/[id] - Update signature template (Admin/Owner only)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (!['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Acesso negado: Apenas administradores podem alterar modelos.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updated = await updateSignatureTemplate(
      profile.accountId,
      user.id,
      profile.email,
      id,
      body
    );

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[signature-templates/[id]] Error in PUT:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar modelo de assinatura.' },
      { status: 400 }
    );
  }
}

// DELETE /api/signature-templates/[id] - Soft-delete (disable) signature template (Admin/Owner only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (!['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Acesso negado: Apenas administradores podem desativar modelos.' },
        { status: 403 }
      );
    }

    const updated = await toggleSignatureTemplateStatus(
      profile.accountId,
      user.id,
      profile.email,
      id,
      false
    );

    return NextResponse.json({ success: true, template: updated });
  } catch (error: any) {
    console.error('[signature-templates/[id]] Error in DELETE:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao desativar modelo de assinatura.' },
      { status: 400 }
    );
  }
}
