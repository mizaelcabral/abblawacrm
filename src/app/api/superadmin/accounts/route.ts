import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

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

    return NextResponse.json(accounts);
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
    const { id, subscription_plan, subscription_status, ai_message_limit } = body;

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    
    const updateData: any = {};
    if (subscription_plan !== undefined) updateData.subscription_plan = subscription_plan;
    if (subscription_status !== undefined) updateData.subscription_status = subscription_status;
    if (ai_message_limit !== undefined) updateData.ai_message_limit = ai_message_limit;

    const { data, error } = await admin
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[superadmin/accounts] PUT error:', error);
      return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[superadmin/accounts] PUT exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
