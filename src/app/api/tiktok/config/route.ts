import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';

const CLIENT_ID = process.env.TIKTOK_CLIENT_KEY || '';
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || '';

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

// GET - Retrieve configuration and status
export async function GET() {
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
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_account',
          message: 'Seu perfil não está vinculado a uma conta.',
        },
        { status: 200 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('tiktok_integration_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching tiktok_integration_config:', configError);
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Falha ao buscar configuração.' },
        { status: 200 }
      );
    }

    if (!config) {
      return NextResponse.json(
        { connected: false, reason: 'no_config', message: 'Integração com TikTok não configurada.' },
        { status: 200 }
      );
    }

    const isExpired = config.expires_at ? new Date(config.expires_at) < new Date() : true;

    return NextResponse.json(
      {
        connected: config.status === 'connected' && !isExpired,
        tiktok_open_id: config.tiktok_open_id || '',
        expires_at: config.expires_at,
        isExpired,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/tiktok/config:', error);
    return NextResponse.json(
      { connected: false, reason: 'internal_error', message: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

// POST - Initiate OAuth redirection URL
export async function POST() {
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
      return NextResponse.json(
        { error: 'Seu perfil não está vinculado a uma conta.' },
        { status: 403 }
      );
    }

    // Build TikTok Auth URL
    // Scopes needed: user.info.basic, video.list, im.messages, im.comments
    const state = `${accountId}:${user.id}`;
    const scope = 'user.info.basic,video.list,im.messages,im.comments';
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(
      CLIENT_ID
    )}&scope=${encodeURIComponent(scope)}&response_type=code&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ url: authUrl });

  } catch (error) {
    console.error('Error in POST /api/tiktok/config:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

// DELETE - Revoke configuration
export async function DELETE() {
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
      return NextResponse.json(
        { error: 'Seu perfil não está vinculado a uma conta.' },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from('tiktok_integration_config')
      .delete()
      .eq('account_id', accountId);

    if (deleteError) {
      console.error('Error deleting tiktok_integration_config:', deleteError);
      return NextResponse.json({ error: 'Falha ao remover a integração.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/tiktok/config:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
