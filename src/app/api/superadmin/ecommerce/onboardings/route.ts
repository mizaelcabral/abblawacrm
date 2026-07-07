import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import fs from 'fs';
import path from 'path';

// Force load .env.local manually as fallback for Next.js Turbopack env parsing bugs
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const firstEquals = trimmed.indexOf('=');
        if (firstEquals !== -1) {
          const key = trimmed.substring(0, firstEquals).trim();
          const val = trimmed.substring(firstEquals + 1).trim();
          if (key && val && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
} catch (err) {
  console.error('Failed to manually parse .env.local:', err);
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
      // Modo automático: chamar a Woovi
      console.log('DEBUG: process.env.WOOVI_MASTER_APP_ID =', process.env.WOOVI_MASTER_APP_ID);
      const masterAppId = process.env.WOOVI_MASTER_APP_ID;
      if (!masterAppId) {
        return NextResponse.json({ error: 'WOOVI_MASTER_APP_ID is not configured.' }, { status: 400 });
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

      const response = await fetch(wooviUrl, {
        method: 'POST',
        headers: {
          'Authorization': masterAppId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: account.name,
          pixKey: pixKey || '',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[superadmin/ecommerce/onboardings] POST automatic woovi request error:', response.status, errorText);
        return NextResponse.json({ error: `Woovi subaccount creation failed: ${response.status} - ${errorText}` }, { status: 400 });
      }

      const resData = await response.json();
      const subAppId = resData.subaccount?.apiKey || resData.apiKey;

      if (!subAppId) {
        console.error('[superadmin/ecommerce/onboardings] POST automatic woovi response missing apiKey:', resData);
        return NextResponse.json({ error: 'Woovi subaccount creation returned invalid response (missing apiKey)' }, { status: 500 });
      }

      const { data, error } = await admin
        .from('woovi_config')
        .update({
          app_id: subAppId,
          onboarding_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[superadmin/ecommerce/onboardings] POST automatic db update error:', error);
        return NextResponse.json({ error: 'Failed to update database with approved status and app_id' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }
  } catch (err: any) {
    console.error('[superadmin/ecommerce/onboardings] POST exception:', err);
    return NextResponse.json({ error: `Internal server error: ${err.message || err}` }, { status: 500 });
  }
}
