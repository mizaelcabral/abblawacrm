import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user session
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch user's profile and check permissions
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || !profile.account_id) {
      return NextResponse.json({ error: 'Account profile not found' }, { status: 404 });
    }

    const isAuthorized = profile.account_role === 'owner' || profile.account_role === 'admin';
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Only owners and admins can manage billing and subscriptions' },
        { status: 403 }
      );
    }

    const accountId = profile.account_id;

    // Fetch the account to get the current stripe_customer_id
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('stripe_customer_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (!account.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing profile found. Please subscribe to a plan first.' },
        { status: 400 }
      );
    }

    // 3. Get request origin for redirect back URL
    const { origin } = new URL(request.url);

    // 4. Create Stripe Billing Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: `${origin}/settings?tab=plans`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[Stripe Portal] Error creating session:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
