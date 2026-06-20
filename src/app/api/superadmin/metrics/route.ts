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

    // Perform aggregate queries across all tenants using admin client
    const [accountsRes, profilesRes, whatsappRes, messagesRes] = await Promise.all([
      admin.from('accounts').select('subscription_plan, subscription_status'),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('whatsapp_config').select('id', { count: 'exact', head: true }),
      admin.from('messages').select('id', { count: 'exact', head: true }),
    ]);

    const accounts = accountsRes.data || [];
    const totalAccounts = accounts.length;
    const totalUsers = profilesRes.count || 0;
    const totalWhatsApp = whatsappRes.count || 0;
    const totalMessages = messagesRes.count || 0;

    // Calculate MRR and counts by plan
    let mrr = 0;
    let starterCount = 0;
    let proCount = 0;
    let scaleCount = 0;

    accounts.forEach((acc) => {
      const isPaid = acc.subscription_status === 'active';
      if (acc.subscription_plan === 'scale') {
        scaleCount++;
        if (isPaid) mrr += 497;
      } else if (acc.subscription_plan === 'pro') {
        proCount++;
        if (isPaid) mrr += 249;
      } else {
        starterCount++;
        if (isPaid) mrr += 97;
      }
    });

    return NextResponse.json({
      metrics: {
        totalAccounts,
        totalUsers,
        totalWhatsApp,
        totalMessages,
        mrr,
        plans: {
          starter: starterCount,
          pro: proCount,
          scale: scaleCount,
        },
      },
    });
  } catch (err: any) {
    console.error('[superadmin/metrics] Error fetching dashboard metrics:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
