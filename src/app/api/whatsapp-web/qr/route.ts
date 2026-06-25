import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';

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
      return NextResponse.json({ error: 'Seu perfil não está vinculado a uma conta.' }, { status: 403 });
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_web_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError || !config) {
      return NextResponse.json({ error: 'Configuração do WhatsApp Web não encontrada.' }, { status: 404 });
    }

    const token = decrypt(config.api_token);

    // 1. Check connection state first
    let isConnected = false;
    try {
      const stateRes = await fetch(`${config.api_url}/instance/connectionState/${config.instance_name}`, {
        headers: { apikey: token },
      });

      if (stateRes.ok) {
        const stateData = await stateRes.ok ? await stateRes.json() : null;
        if (stateData?.instance?.state === 'open') {
          isConnected = true;
        }
      }
    } catch (err) {
      console.error('[WhatsApp Web QR] Failed to check connectionState:', err);
    }

    if (isConnected) {
      // Sync in DB
      if (config.status !== 'connected') {
        await supabase
          .from('whatsapp_web_config')
          .update({ status: 'connected', connected_at: new Date().toISOString() })
          .eq('id', config.id);
      }
      return NextResponse.json({ status: 'connected' });
    }

    // 2. Fetch QR Code from the gateway
    try {
      console.log(`[WhatsApp Web QR] Requesting QR Code for instance ${config.instance_name} from gateway...`);
      const qrRes = await fetch(`${config.api_url}/instance/connect/${config.instance_name}`, {
        headers: { apikey: token },
      });

      if (!qrRes.ok) {
        const errText = await qrRes.text();
        return NextResponse.json({
          status: 'disconnected',
          error: `Gateway returned status ${qrRes.status}: ${errText}`
        });
      }

      const qrData = await qrRes.json();

      // If the gateway says already connected or returns a code
      if (qrData.instance?.state === 'open' || qrData.message === 'Instance already connected') {
        // Sync in DB
        await supabase
          .from('whatsapp_web_config')
          .update({ status: 'connected', connected_at: new Date().toISOString() })
          .eq('id', config.id);
        return NextResponse.json({ status: 'connected' });
      }

      // Return base64 image data
      return NextResponse.json({
        status: 'disconnected',
        qrcode: qrData.base64 || qrData.qrcode?.base64 || null,
        code: qrData.code || null
      });

    } catch (err) {
      console.error('[WhatsApp Web QR] Failed to fetch QR from gateway:', err);
      return NextResponse.json({
        status: 'disconnected',
        error: 'Falha ao conectar com o gateway do WhatsApp.'
      });
    }

  } catch (error) {
    console.error('Error in GET /api/whatsapp-web/qr:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
