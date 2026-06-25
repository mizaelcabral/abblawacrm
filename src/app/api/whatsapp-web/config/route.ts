import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';

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

// GET - Retrieve configuration and verify status with Evolution API
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
        { configured: false, message: 'Seu perfil não está vinculado a uma conta.' },
        { status: 200 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_web_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching whatsapp_web_config:', configError);
      return NextResponse.json(
        { configured: false, message: 'Erro ao carregar a configuração.' },
        { status: 200 }
      );
    }

    if (!config) {
      return NextResponse.json(
        { configured: false, message: 'Configuração do WhatsApp Web não encontrada.' },
        { status: 200 }
      );
    }

    // Check status with Evolution API
    const token = decrypt(config.api_token);
    let state = 'disconnected';
    
    try {
      const stateRes = await fetch(`${config.api_url}/instance/connectionState/${config.instance_name}`, {
        headers: { apikey: token },
      });
      
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        const apiState = stateData.instance?.state;
        if (apiState === 'open') {
          state = 'connected';
        } else if (apiState === 'connecting') {
          state = 'connecting';
        }
      }
    } catch (err) {
      console.error('[WhatsApp Web Config GET] State check failed:', err);
    }

    // Sync status back to DB if it changed
    if (state !== config.status) {
      await supabase
        .from('whatsapp_web_config')
        .update({ status: state, connected_at: state === 'connected' ? new Date().toISOString() : config.connected_at })
        .eq('id', config.id);
    }

    return NextResponse.json({
      configured: true,
      api_url: config.api_url,
      instance_name: config.instance_name,
      status: state,
      is_active: config.is_active,
    });

  } catch (error) {
    console.error('Error in GET /api/whatsapp-web/config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save configuration and initialize instance in the gateway
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
      return NextResponse.json({ error: 'Seu perfil não está vinculado a uma conta.' }, { status: 403 });
    }

    const body = await request.json();
    const { api_url, api_token, instance_name, is_active } = body;

    if (!api_url || !instance_name) {
      return NextResponse.json({ error: 'URL da API e Nome da Instância são obrigatórios' }, { status: 400 });
    }

    // Retrieve existing config
    const { data: existing } = await supabase
      .from('whatsapp_web_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    let finalToken = api_token;
    if (api_token === MASKED_TOKEN) {
      if (!existing) {
        return NextResponse.json({ error: 'API Token é obrigatório para configuração inicial.' }, { status: 400 });
      }
      finalToken = decrypt(existing.api_token);
    }

    if (!finalToken) {
      return NextResponse.json({ error: 'API Token é obrigatório' }, { status: 400 });
    }

    const encryptedToken = encrypt(finalToken);
    const origin = request.headers.get('origin') || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;
    const webhookUrl = `${origin}/api/whatsapp-web/webhook`;

    // 1. Create/Retrieve instance in Evolution API
    try {
      console.log(`[WhatsApp Web Config] Creating instance ${instance_name} in ${api_url}...`);
      const createRes = await fetch(`${api_url}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: finalToken,
        },
        body: JSON.stringify({
          instanceName: instance_name,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.warn(`[WhatsApp Web Config] Instance creation returned status ${createRes.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[WhatsApp Web Config] Failed to call Evolution API /instance/create:', err);
    }

    // 2. Configure Webhook in Evolution API
    try {
      console.log(`[WhatsApp Web Config] Setting webhook for ${instance_name} to ${webhookUrl}...`);
      const webhookRes = await fetch(`${api_url}/webhook/set/${instance_name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: finalToken,
        },
        body: JSON.stringify({
          enabled: true,
          url: webhookUrl,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
        }),
      });

      if (!webhookRes.ok) {
        const errText = await webhookRes.text();
        console.warn(`[WhatsApp Web Config] Webhook configuration returned status ${webhookRes.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[WhatsApp Web Config] Failed to call Evolution API /webhook/set:', err);
    }

    // 3. Save configuration to Supabase database
    const payload = {
      account_id: accountId,
      user_id: user.id,
      api_url,
      api_token: encryptedToken,
      instance_name,
      is_active: !!is_active,
      updated_at: new Date().toISOString(),
    };

    let saveError;
    if (existing) {
      const { error } = await supabase
        .from('whatsapp_web_config')
        .update(payload)
        .eq('id', existing.id);
      saveError = error;
    } else {
      const { error } = await supabase
        .from('whatsapp_web_config')
        .insert(payload);
      saveError = error;
    }

    if (saveError) {
      console.error('Error saving config in DB:', saveError);
      return NextResponse.json({ error: 'Erro ao salvar configuração no banco de dados.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in POST /api/whatsapp-web/config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
