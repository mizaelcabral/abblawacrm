import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { ZapSignClient } from '@/lib/zapsign/client';
import {
  getSignatureTemplates,
  createSignatureTemplate,
} from '@/lib/signatures/template-service';

async function resolveProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ accountId: string; email: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id, email')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return { accountId: data.account_id as string, email: data.email as string };
}

// GET /api/zapsign/templates?source=db|zapsign
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
    const source = searchParams.get('source') || 'db';

    if (source === 'zapsign') {
      const { data: config } = await supabase
        .from('zapsign_config')
        .select('api_key, environment')
        .eq('account_id', profile.accountId)
        .maybeSingle();

      if (!config || !config.api_key) {
        return NextResponse.json({ templates: [] }, { status: 200 });
      }

      const decryptedKey = decrypt(config.api_key);
      const client = new ZapSignClient(decryptedKey, config.environment === 'sandbox');
      const data = await client.listTemplates();
      return NextResponse.json({ templates: data.results || [] });
    }

    // Default: Return configured templates from database
    const dbTemplates = await getSignatureTemplates(profile.accountId);
    return NextResponse.json({ templates: dbTemplates });
  } catch (error: any) {
    console.error('[zapsign/templates] Error in GET:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar modelos de assinatura.' },
      { status: 500 }
    );
  }
}

// POST /api/zapsign/templates - Create/configure a signature template
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

    const body = await request.json();
    const created = await createSignatureTemplate(
      profile.accountId,
      user.id,
      profile.email,
      body
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error('[zapsign/templates] Error in POST:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao criar modelo de assinatura.' },
      { status: 400 }
    );
  }
}
