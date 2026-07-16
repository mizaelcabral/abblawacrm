import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { PLANS } from '@/config/plans';

export async function POST(request: Request) {
  try {
    // 1. Authenticate the user session
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request payload
    const { planKey } = await request.json();
    if (!planKey || !PLANS[planKey]) {
      return NextResponse.json({ error: 'Invalid planKey provided' }, { status: 400 });
    }

    const plan = PLANS[planKey];
    if (!plan.stripePriceId) {
      return NextResponse.json(
        { error: `No Stripe Price ID configured for plan: ${planKey}` },
        { status: 400 }
      );
    }

    // 3. Get user's account details and check permissions (owner or admin only)
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
      .select('name, stripe_customer_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // 4. Resolve or create Stripe Customer
    let stripeCustomerId = account.stripe_customer_id;

    if (!stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: account.name || user.email,
          metadata: {
            account_id: accountId,
          },
        });
        stripeCustomerId = customer.id;

        // Save stripe_customer_id back to the account table in database
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', accountId);

        if (updateError) {
          console.error('[Stripe Checkout] Failed to save stripe_customer_id:', updateError);
        }
      } catch (err) {
        console.error('[Stripe Checkout] Stripe customer creation failed:', err);
        return NextResponse.json(
          { error: 'Failed to initialize payment customer profile with Stripe' },
          { status: 500 }
        );
      }
    }

    // 5. Get request origin for redirect URLs
    const { origin } = new URL(request.url);

    // 6. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/settings?tab=plans&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?tab=plans`,
      metadata: {
        account_id: accountId,
        plan_key: planKey,
      },
      subscription_data: {
        metadata: {
          account_id: accountId,
          plan_key: planKey,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[Stripe Checkout] Error creating session:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
