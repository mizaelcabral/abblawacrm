import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';

const MASKED_TOKEN = '••••••••••••••••';

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

// GET - Test connectivity and fetch config
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
      .from('meta_integration_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching meta_integration_config:', configError);
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Falha ao buscar configuração' },
        { status: 200 }
      );
    }

    if (!config) {
      return NextResponse.json(
        { connected: false, reason: 'no_config', message: 'Integração com Facebook/Instagram não configurada.' },
        { status: 200 }
      );
    }

    const token = decrypt(config.page_access_token);

    // Test token validity by querying Page name on Graph API
    const testUrl = `https://graph.facebook.com/v21.0/me?fields=name,id&access_token=${token}`;
    const metaResponse = await fetch(testUrl);
    
    if (!metaResponse.ok) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'meta_api_error',
          message: `Erro da API da Meta: ${metaResponse.statusText}`,
          config: {
            facebook_page_id: config.facebook_page_id || '',
            instagram_business_id: config.instagram_business_id || '',
            verify_token: config.verify_token ? decrypt(config.verify_token) : '',
          }
        },
        { status: 200 }
      );
    }

    const metaData = await metaResponse.json();

    return NextResponse.json(
      {
        connected: true,
        pageName: metaData.name,
        config: {
          facebook_page_id: config.facebook_page_id || '',
          instagram_business_id: config.instagram_business_id || '',
          verify_token: config.verify_token ? decrypt(config.verify_token) : '',
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/meta/config:', error);
    return NextResponse.json(
      { connected: false, reason: 'internal_error', message: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

// POST - Save or update config
export async function POST(request: Request) {
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

    const body = await request.json();
    const {
      facebook_page_id,
      instagram_business_id,
      page_access_token,
      verify_token,
    } = body;

    // Check if configuration already exists
    const { data: existingConfig } = await supabase
      .from('meta_integration_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    let finalAccessToken = page_access_token;
    if (page_access_token === MASKED_TOKEN) {
      if (!existingConfig) {
        return NextResponse.json(
          { error: 'Token de acesso da página inválido' },
          { status: 400 }
        );
      }
      finalAccessToken = decrypt(existingConfig.page_access_token);
    }

    const encryptedAccessToken = encrypt(finalAccessToken);
    const encryptedVerifyToken = verify_token ? encrypt(verify_token) : null;

    const upsertPayload = {
      account_id: accountId,
      user_id: user.id,
      facebook_page_id: facebook_page_id || null,
      instagram_business_id: instagram_business_id || null,
      page_access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('meta_integration_config')
      .upsert(upsertPayload, { onConflict: 'account_id' });

    if (upsertError) {
      console.error('Error saving meta_integration_config:', upsertError);
      return NextResponse.json(
        { error: `Erro ao salvar no banco de dados: ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in POST /api/meta/config:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}
