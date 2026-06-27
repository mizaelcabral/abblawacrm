import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import crypto from 'crypto';

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

export async function GET(request: Request) {
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

    const isGlobal = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_TOKEN);
    const finalApiUrl = isGlobal ? process.env.EVOLUTION_API_URL : config.api_url;
    const token = (isGlobal ? process.env.EVOLUTION_API_TOKEN : decrypt(config.api_token)) || '';

    // 1. Check connection state first
    let isConnected = false;
    try {
      const stateRes = await fetch(`${finalApiUrl}/instance/connectionState/${config.instance_name}`, {
        headers: { apikey: token },
      });

      if (stateRes.ok) {
        const stateData = await stateRes.json();
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
      const qrRes = await fetch(`${finalApiUrl}/instance/connect/${config.instance_name}`, {
        headers: { apikey: token },
      });

      if (!qrRes.ok) {
        const errText = await qrRes.text();
        let errJson: any = {};
        try {
          errJson = JSON.parse(errText);
        } catch {}

        const isNotFoundError = qrRes.status === 404 || 
          errText.includes('does not exist') || 
          errJson?.response?.message?.some?.((m: string) => m.includes('does not exist'));

        if (isNotFoundError) {
          console.log(`[WhatsApp Web QR] Instance ${config.instance_name} not found. Attempting auto-creation...`);
          
          const origin = request.headers.get('origin') || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;
          const webhookUrl = `${origin}/api/whatsapp-web/webhook`;

          // A. Create instance
          const createRes = await fetch(`${finalApiUrl}/instance/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: token,
            },
            body: JSON.stringify({
              instanceName: config.instance_name,
              token: crypto.randomBytes(16).toString('hex'),
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS',
            }),
          });

          if (!createRes.ok) {
            const createErr = await createRes.text();
            console.error(`[WhatsApp Web QR] Auto-creation failed:`, createErr);
          } else {
            console.log(`[WhatsApp Web QR] Instance created successfully. Setting webhook...`);
            
            // B. Set webhook
            const webhookRes = await fetch(`${finalApiUrl}/webhook/set/${config.instance_name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: token,
              },
              body: JSON.stringify({
                webhook: {
                  enabled: true,
                  url: webhookUrl,
                  events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
                }
              }),
            });

            if (!webhookRes.ok) {
              const webhookErr = await webhookRes.text();
              console.warn(`[WhatsApp Web QR] Setting webhook failed:`, webhookErr);
            }

            // C. Retry connecting (fetching QR)
            console.log(`[WhatsApp Web QR] Retrying QR fetch after auto-creation...`);
            const retryRes = await fetch(`${finalApiUrl}/instance/connect/${config.instance_name}`, {
              headers: { apikey: token },
            });

            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (retryData.instance?.state === 'open' || retryData.message === 'Instance already connected') {
                await supabase
                  .from('whatsapp_web_config')
                  .update({ status: 'connected', connected_at: new Date().toISOString() })
                  .eq('id', config.id);
                return NextResponse.json({ status: 'connected' });
              }
              return NextResponse.json({
                status: 'disconnected',
                qrcode: retryData.base64 || retryData.qrcode?.base64 || null,
                code: retryData.code || null
              });
            } else {
              const retryErr = await retryRes.text();
              console.error(`[WhatsApp Web QR] Retry failed:`, retryErr);
            }
          }
        }

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
