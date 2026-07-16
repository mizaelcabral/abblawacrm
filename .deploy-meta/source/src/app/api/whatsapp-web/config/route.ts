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

    const isGlobal = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_TOKEN);
    const autoInstanceName = `abbla-${accountId.replace(/-/g, '').slice(0, 12)}`;

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
        {
          configured: false,
          is_global_configured: isGlobal,
          instance_name: autoInstanceName,
          message: 'Configuração do WhatsApp Web não encontrada.',
        },
        { status: 200 }
      );
    }

    // Check status with Evolution API
    const finalApiUrl = isGlobal ? process.env.EVOLUTION_API_URL : config.api_url;
    const finalToken = (isGlobal ? process.env.EVOLUTION_API_TOKEN : decrypt(config.api_token)) || '';
    let state = 'disconnected';
    
    try {
      const stateRes = await fetch(`${finalApiUrl}/instance/connectionState/${config.instance_name}`, {
        headers: { apikey: finalToken },
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
      is_global_configured: isGlobal,
      api_url: finalApiUrl,
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

    const isGlobal = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_TOKEN);
    const autoInstanceName = `abbla-${accountId.replace(/-/g, '').slice(0, 12)}`;

    const body = await request.json();
    const { api_url, api_token, instance_name, is_active } = body;

    // Retrieve existing config
    const { data: existing } = await supabase
      .from('whatsapp_web_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    const finalApiUrl = isGlobal ? process.env.EVOLUTION_API_URL : (api_url || null);
    const finalInstanceName = existing?.instance_name || instance_name || autoInstanceName;
    let finalToken = (isGlobal ? process.env.EVOLUTION_API_TOKEN : api_token) || '';

    if (!isGlobal) {
      if (finalToken === MASKED_TOKEN) {
        if (!existing) {
          return NextResponse.json({ error: 'API Token é obrigatório para configuração inicial.' }, { status: 400 });
        }
        finalToken = decrypt(existing.api_token);
      }
    }

    if (!finalApiUrl || !finalInstanceName) {
      return NextResponse.json({ error: 'URL da API e Nome da Instância são obrigatórios' }, { status: 400 });
    }

    if (!finalToken) {
      return NextResponse.json({ error: 'API Token é obrigatório' }, { status: 400 });
    }

    const encryptedToken = encrypt(finalToken);
    const origin = request.headers.get('origin') || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;
    const webhookUrl = `${origin}/api/whatsapp-web/webhook`;

    // 1. Create/Retrieve instance in Evolution API
    try {
      console.log(`[WhatsApp Web Config] Creating instance ${finalInstanceName} in ${finalApiUrl}...`);
      const createRes = await fetch(`${finalApiUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: finalToken,
        },
        body: JSON.stringify({
          instanceName: finalInstanceName,
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
      console.log(`[WhatsApp Web Config] Setting webhook for ${finalInstanceName} to ${webhookUrl}...`);
      const webhookRes = await fetch(`${finalApiUrl}/webhook/set/${finalInstanceName}`, {
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
      api_url: finalApiUrl,
      api_token: encryptedToken,
      instance_name: finalInstanceName,
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
