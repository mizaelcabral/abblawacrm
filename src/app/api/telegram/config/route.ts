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

// GET - Retrieve configuration and test connectivity
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
      .from('telegram_integration_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching telegram_integration_config:', configError);
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Falha ao buscar configuração.' },
        { status: 200 }
      );
    }

    if (!config) {
      return NextResponse.json(
        { connected: false, reason: 'no_config', message: 'Integração com Telegram não configurada.' },
        { status: 200 }
      );
    }

    const token = decrypt(config.bot_token);

    // Test token connectivity with Telegram API
    const testUrl = `https://api.telegram.org/bot${token}/getMe`;
    const tgResponse = await fetch(testUrl);
    
    if (!tgResponse.ok) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'telegram_api_error',
          message: `Erro da API do Telegram: ${tgResponse.statusText}`,
          config: {
            bot_username: config.bot_username || '',
          }
        },
        { status: 200 }
      );
    }

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'telegram_api_error',
          message: 'Token inválido rejeitado pelo Telegram.',
          config: {
            bot_username: config.bot_username || '',
          }
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        connected: true,
        botName: tgData.result.first_name,
        config: {
          bot_username: tgData.result.username,
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/telegram/config:', error);
    return NextResponse.json(
      { connected: false, reason: 'internal_error', message: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}

// POST - Save configuration and setup webhook
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
    const { bot_token } = body;

    if (!bot_token) {
      return NextResponse.json(
        { error: 'Token do Bot é obrigatório' },
        { status: 400 }
      );
    }

    // Get existing config if any
    const { data: existingConfig } = await supabase
      .from('telegram_integration_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    let finalToken = bot_token;
    if (bot_token === MASKED_TOKEN) {
      if (!existingConfig) {
        return NextResponse.json(
          { error: 'Token inválido' },
          { status: 400 }
        );
      }
      finalToken = decrypt(existingConfig.bot_token);
    }

    // Validate the token with Telegram
    const tgResponse = await fetch(`https://api.telegram.org/bot${finalToken}/getMe`);
    if (!tgResponse.ok) {
      return NextResponse.json(
        { error: 'Não foi possível conectar ao bot do Telegram. Verifique se o token está correto.' },
        { status: 400 }
      );
    }

    const tgData = await tgResponse.json();
    if (!tgData.ok || !tgData.result) {
      return NextResponse.json(
        { error: 'Token inválido rejeitado pelo Telegram.' },
        { status: 400 }
      );
    }

    const botUsername = tgData.result.username;

    // Encrypt token for database storage
    const encryptedToken = encrypt(finalToken);

    // Register Webhook with Telegram
    // We use headers x-forwarded-proto & host to build the public URL dynamically
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host');
    const webhookUrl = `${proto}://${host}/api/telegram/webhook?account_id=${accountId}`;

    const webhookRes = await fetch(`https://api.telegram.org/bot${finalToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
      }),
    });

    if (!webhookRes.ok) {
      console.error('Failed to configure Telegram webhook:', webhookRes.statusText);
      // We still proceed to save the config, but warn the user or log it
    }

    const upsertPayload = {
      account_id: accountId,
      user_id: user.id,
      bot_token: encryptedToken,
      bot_username: botUsername,
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('telegram_integration_config')
      .upsert(upsertPayload, { onConflict: 'account_id' });

    if (upsertError) {
      console.error('Error saving telegram_integration_config:', upsertError);
      return NextResponse.json(
        { error: `Erro ao salvar no banco de dados: ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, botUsername });

  } catch (error) {
    console.error('Error in POST /api/telegram/config:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}
