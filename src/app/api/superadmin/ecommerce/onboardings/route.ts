import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { parseEnvLocal } from '@/lib/env-local';

// Reads WOOVI_MASTER_APP_ID from super_admin_config in Supabase.
// Uses direct HTTP REST fetch (not SDK) to avoid Turbopack env-freeze bugs.
// Credentials are read fresh from disk via parseEnvLocal().
async function getWooviMasterAppId(): Promise<string | null> {
  if (process.env.NODE_ENV === 'test') {
    return process.env.WOOVI_MASTER_APP_ID || null;
  }

  // Read credentials fresh from disk — never frozen by bundler
  const env = parseEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (supabaseUrl && serviceRoleKey) {
    try {
      // Direct REST query — no SDK, no process.env dependency at call time
      const res = await fetch(
        `${supabaseUrl}/rest/v1/super_admin_config?key=eq.woovi_master_app_id&select=value&limit=1`,
        {
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (res.ok) {
        const rows: Array<{ value: string }> = await res.json();
        if (rows.length > 0 && rows[0].value) {
          return rows[0].value;
        }
      } else {
        console.error('[getWooviMasterAppId] REST query failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[getWooviMasterAppId] Exception:', err);
    }
  } else {
    console.error('[getWooviMasterAppId] Missing Supabase credentials in env');
  }

  // Fallback: read WOOVI_MASTER_APP_ID from .env.local directly or process.env
  return env.WOOVI_MASTER_APP_ID || process.env.WOOVI_MASTER_APP_ID || null;
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const { data: onboardings, error } = await admin
      .from('woovi_config')
      .select(`
        *,
        accounts (
          name
        )
      `)
      .eq('onboarding_status', 'pending_approval')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[superadmin/ecommerce/onboardings] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch onboardings' }, { status: 500 });
    }

    return NextResponse.json(onboardings || []);
  } catch (err: any) {
    console.error('[superadmin/ecommerce/onboardings] GET exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { accountId, action, appId, secretKey, pixKey } = body;

    if (!accountId || !action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
    }

    const admin = supabaseAdmin();

    if (action === 'reject') {
      const { data, error } = await admin
        .from('woovi_config')
        .update({
          onboarding_status: 'none',
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[superadmin/ecommerce/onboardings] POST reject error:', error);
        return NextResponse.json({ error: 'Failed to reject onboarding' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    // action === 'approve'
    if (appId) {
      // Modo manual: salvar appId, secretKey (se houver) e definir status = approved
      const updatePayload: any = {
        app_id: appId,
        onboarding_status: 'approved',
        updated_at: new Date().toISOString(),
      };
      if (secretKey !== undefined) {
        updatePayload.secret_key = secretKey;
      }

      const { data, error } = await admin
        .from('woovi_config')
        .update(updatePayload)
        .eq('account_id', accountId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[superadmin/ecommerce/onboardings] POST approve manual error:', error);
        return NextResponse.json({ error: 'Failed to approve onboarding (manual mode)' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    } else {
      // Modo automático: ler Master App ID do banco e chamar a Woovi
      const masterAppId = await getWooviMasterAppId();
      if (!masterAppId) {
        return NextResponse.json(
          { error: 'Woovi Master App ID não configurado. Configure-o em Painel Super Admin > Configurações.' },
          { status: 400 }
        );
      }

      // Obter o nome da conta do banco de dados
      const { data: account, error: accError } = await admin
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .maybeSingle();

      if (accError || !account) {
        return NextResponse.json({ error: 'Account not found or database error' }, { status: 400 });
      }

      const isSandbox = masterAppId.includes('sandbox') || masterAppId.includes('plugin_sb');
      const wooviUrl = isSandbox
        ? 'https://api.woovi-sandbox.com/api/v1/subaccount'
        : 'https://api.woovi.com/api/v1/subaccount';

      const wooviPayload = {
        name: account.name,
        pixKey: pixKey || '',
      };

      console.log(`[superadmin/ecommerce/onboardings] Creating subaccount at ${wooviUrl}`, wooviPayload);

      const response = await fetch(wooviUrl, {
        method: 'POST',
        headers: {
          'Authorization': masterAppId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wooviPayload),
      });

      const resText = await response.text();
      console.log(`[superadmin/ecommerce/onboardings] Woovi response ${response.status}:`, resText);

      if (!response.ok) {
        return NextResponse.json(
          { error: `Woovi subaccount creation failed: ${response.status} - ${resText}` },
          { status: 400 }
        );
      }

      let resData: any;
      try {
        resData = JSON.parse(resText);
      } catch {
        return NextResponse.json(
          { error: `Woovi returned invalid JSON: ${resText}` },
          { status: 500 }
        );
      }

      const subAccount = resData.subAccount || resData.subaccount;
      const subAccountPixKey = subAccount?.pixKey || pixKey || '';

      // Save: app_id = master app id (used to call woovi), secret_key = pix key of subconta
      const { data, error } = await admin
        .from('woovi_config')
        .update({
          app_id: masterAppId,
          secret_key: subAccountPixKey,
          onboarding_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[superadmin/ecommerce/onboardings] POST automatic db update error:', error);
        return NextResponse.json({ error: 'Failed to update database with approved status' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }
  } catch (err: any) {
    console.error('[superadmin/ecommerce/onboardings] POST exception:', err);
    return NextResponse.json({ error: `Internal server error: ${err.message || err}` }, { status: 500 });
  }
}
