import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import { ZapSignClient } from '@/lib/zapsign/client';

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

// GET - Retrieve configuration and test connection
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
        { connected: false, message: 'Seu perfil não está vinculado a uma conta.' },
        { status: 200 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('zapsign_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching zapsign_config:', configError);
      return NextResponse.json(
        { connected: false, message: 'Falha ao buscar configuração.' },
        { status: 200 }
      );
    }

    if (!config || !config.api_key) {
      return NextResponse.json(
        { connected: false, message: 'ZapSign não configurada.' },
        { status: 200 }
      );
    }

    // Decrypt and test connectivity by listing templates
    const decryptedKey = decrypt(config.api_key);
    const client = new ZapSignClient(decryptedKey, config.environment === 'sandbox');

    try {
      await client.listTemplates();
      return NextResponse.json({
        connected: true,
        environment: config.environment,
        api_key: MASKED_TOKEN,
      });
    } catch (apiErr) {
      console.error('ZapSign API validation failed:', apiErr);
      return NextResponse.json({
        connected: false,
        environment: config.environment,
        api_key: MASKED_TOKEN,
        message: 'A chave da API parece inválida ou expirou.',
      });
    }
  } catch (error) {
    console.error('Error in GET /api/zapsign/config:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

// POST - Save configuration
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
    const { api_key, environment } = body;

    if (!api_key) {
      return NextResponse.json({ error: 'API Key é obrigatória' }, { status: 400 });
    }

    // Get existing config if any
    const { data: existingConfig } = await supabase
      .from('zapsign_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    let finalKey = api_key;
    if (api_key === MASKED_TOKEN) {
      if (!existingConfig || !existingConfig.api_key) {
        return NextResponse.json({ error: 'API Key inválida' }, { status: 400 });
      }
      finalKey = decrypt(existingConfig.api_key);
    }

    // Validate the key with ZapSign API before saving
    const testClient = new ZapSignClient(finalKey, environment === 'sandbox');
    try {
      await testClient.listTemplates();
    } catch (err) {
      return NextResponse.json(
        { error: 'Não foi possível conectar à ZapSign. Verifique se o API Token está correto.' },
        { status: 400 }
      );
    }

    const encryptedKey = encrypt(finalKey);

    const upsertPayload = {
      account_id: accountId,
      api_key: encryptedKey,
      environment: environment || 'production',
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('zapsign_config')
      .upsert(upsertPayload, { onConflict: 'account_id' });

    if (upsertError) {
      console.error('Error saving zapsign_config:', upsertError);
      return NextResponse.json(
        { error: `Erro ao salvar no banco: ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/zapsign/config:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}
