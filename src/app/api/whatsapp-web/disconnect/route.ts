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

    // Call logout endpoint in Evolution API
    try {
      console.log(`[WhatsApp Web Disconnect] Logging out instance ${config.instance_name}...`);
      const logoutRes = await fetch(`${finalApiUrl}/instance/logout/${config.instance_name}`, {
        method: 'POST',
        headers: { apikey: token },
      });

      if (!logoutRes.ok) {
        const errText = await logoutRes.text();
        console.warn(`[WhatsApp Web Disconnect] Logout API returned status ${logoutRes.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[WhatsApp Web Disconnect] Failed to call logout endpoint:', err);
    }

    // Update status in database
    const { error: updateError } = await supabase
      .from('whatsapp_web_config')
      .update({
        status: 'disconnected',
        connected_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id);

    if (updateError) {
      console.error('Error updating config in DB:', updateError);
      return NextResponse.json({ error: 'Erro ao atualizar status no banco de dados.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in POST /api/whatsapp-web/disconnect:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
