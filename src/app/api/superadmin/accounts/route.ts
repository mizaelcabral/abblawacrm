import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { encrypt } from '@/lib/whatsapp/encryption';

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

    const { data: accounts, error } = await admin
      .from('accounts')
      .select('*, profiles(user_id, full_name, email, account_role), whatsapp_config(phone_number_id)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[superadmin/accounts] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }

    const processedAccounts = (accounts || []).map((acc: any) => ({
      ...acc,
      has_ai_key: !!acc.ai_api_key,
      ai_api_key: acc.ai_api_key ? '••••••••' : undefined,
    }));

    return NextResponse.json(processedAccounts);
  } catch (err: any) {
    console.error('[superadmin/accounts] GET exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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
    const {
      id,
      subscription_plan,
      subscription_status,
      ai_message_limit,
      ai_provider,
      ai_model,
      ai_api_key,
      ai_api_url,
      is_lifetime,
      lifetime_has_ai,
      woovi_markup_fixed,
      woovi_markup_percent,
      woovi_markup_pix_key,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    
    const updateData: any = {};
    if (subscription_plan !== undefined) updateData.subscription_plan = subscription_plan;
    if (subscription_status !== undefined) updateData.subscription_status = subscription_status;
    if (ai_message_limit !== undefined) updateData.ai_message_limit = ai_message_limit;
    if (ai_provider !== undefined) updateData.ai_provider = ai_provider;
    if (ai_model !== undefined) updateData.ai_model = ai_model;
    if (ai_api_url !== undefined) updateData.ai_api_url = ai_api_url;
    if (is_lifetime !== undefined) updateData.is_lifetime = is_lifetime;
    if (lifetime_has_ai !== undefined) updateData.lifetime_has_ai = lifetime_has_ai;
    if (woovi_markup_fixed !== undefined) updateData.woovi_markup_fixed = woovi_markup_fixed;
    if (woovi_markup_percent !== undefined) updateData.woovi_markup_percent = woovi_markup_percent;
    if (woovi_markup_pix_key !== undefined) updateData.woovi_markup_pix_key = woovi_markup_pix_key;
    
    if (ai_api_key !== undefined) {
      if (ai_api_key === null || (typeof ai_api_key === 'string' && ai_api_key.trim() === '')) {
        updateData.ai_api_key = null;
      } else if (typeof ai_api_key === 'string' && ai_api_key !== '••••••••') {
        updateData.ai_api_key = encrypt(ai_api_key.trim());
      }
    }

    const { data, error } = await admin
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[superadmin/accounts] PUT error:', error);
      return NextResponse.json({ error: `Failed to update account: ${error.message} (${error.code})` }, { status: 500 });
    }

    const processedData = {
      ...data,
      has_ai_key: !!data.ai_api_key,
      ai_api_key: data.ai_api_key ? '••••••••' : undefined,
    };

    return NextResponse.json(processedData);
  } catch (err: any) {
    console.error('[superadmin/accounts] PUT exception:', err);
    return NextResponse.json({ error: `Internal server error: ${err.message || err}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const { error } = await admin
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[superadmin/accounts] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[superadmin/accounts] DELETE exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
