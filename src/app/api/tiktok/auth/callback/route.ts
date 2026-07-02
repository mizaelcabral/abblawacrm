import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';

const CLIENT_ID = process.env.TIKTOK_CLIENT_KEY || '';
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || '';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host');
  const redirectBase = `${proto}://${host}`;

  if (error || !code || !state) {
    console.error('TikTok auth error or missing params:', { error, code, state });
    return NextResponse.redirect(`${redirectBase}/settings?integration=tiktok&status=error&message=${encodeURIComponent(error || 'Parâmetros ausentes')}`);
  }

  try {
    // Parse state: accountId:userId
    const [accountId, userId] = state.split(':');
    if (!accountId || !userId) {
      throw new Error('Estado de autenticação inválido.');
    }

    // Exchange code for Access Token
    const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
    const details = {
      client_key: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    };

    const formBody = Object.keys(details)
      .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(details[key as keyof typeof details]))
      .join('&');

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: formBody,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Failed to exchange code for TikTok token:', errorText);
      throw new Error('Falha ao obter token de acesso do TikTok.');
    }

    const tokenData = await tokenResponse.json();
    const dataObj = tokenData.data;

    if (!dataObj || !dataObj.access_token) {
      console.error('TikTok token payload is missing data.access_token:', tokenData);
      throw new Error(`Token de acesso não retornado pelo TikTok. Resposta: ${JSON.stringify(tokenData)}`);
    }

    const supabase = await createClient();

    // Encrypt the tokens
    const encryptedAccess = encrypt(dataObj.access_token);
    const encryptedRefresh = dataObj.refresh_token ? encrypt(dataObj.refresh_token) : null;
    const expiresAt = new Date(Date.now() + (dataObj.expires_in || 86400) * 1000).toISOString();

    const upsertPayload = {
      account_id: accountId,
      user_id: userId,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      tiktok_open_id: dataObj.open_id,
      status: 'connected',
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabase
      .from('tiktok_integration_config')
      .upsert(upsertPayload, { onConflict: 'account_id' });

    if (dbError) {
      console.error('Failed to save TikTok config to database:', dbError);
      throw new Error(`Erro de banco de dados: ${dbError.message}`);
    }

    // Successfully connected, redirect back to settings
    return NextResponse.redirect(`${redirectBase}/settings?integration=tiktok&status=success`);

  } catch (err: any) {
    console.error('Error in TikTok callback handler:', err);
    return NextResponse.redirect(`${redirectBase}/settings?integration=tiktok&status=error&message=${encodeURIComponent(err.message || 'Erro de autenticação')}`);
  }
}
