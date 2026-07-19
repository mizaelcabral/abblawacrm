import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { ZapSignClient } from '@/lib/zapsign/client';

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
      return NextResponse.json({ error: 'Conta não vinculada.' }, { status: 400 });
    }

    const { data: config } = await supabase
      .from('zapsign_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!config || !config.api_key) {
      return NextResponse.json({ templates: [] }, { status: 200 });
    }

    const decryptedKey = decrypt(config.api_key);
    const client = new ZapSignClient(decryptedKey, config.environment === 'sandbox');

    const data = await client.listTemplates();
    return NextResponse.json({ templates: data.results || [] });
  } catch (error) {
    console.error('Error fetching ZapSign templates:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar modelos do ZapSign.' },
      { status: 500 }
    );
  }
}
