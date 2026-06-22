import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { PLANS } from '@/config/plans';

// Helper to initialize Supabase Admin client (bypasses RLS for system updates)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Map a Stripe Price ID back to our local plan key ('starter' | 'pro' | 'scale')
function getPlanKeyFromPriceId(priceId: string): string {
  for (const [key, config] of Object.entries(PLANS)) {
    if (config.stripePriceId === priceId) {
      return key;
    }
  }
  return 'starter'; // Default fallback
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature') || '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const accountId = session.metadata?.account_id;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        if (!accountId) {
          console.warn('[Stripe Webhook] Missing account_id in session metadata');
          break;
        }

        // Fetch subscription details to get the current price ID and expiration time
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
        const priceId = subscription.items.data[0].price.id;
        const planKey = getPlanKeyFromPriceId(priceId);
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        const limit = PLANS[planKey].aiMessageLimit;

        // Update account info
        const { error } = await supabaseAdmin
          .from('accounts')
          .update({
            subscription_status: 'active',
            subscription_plan: planKey,
            subscription_expires_at: expiresAt,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            ai_message_limit: limit,
          })
          .eq('id', accountId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to update account ${accountId} on checkout:`, error);
        } else {
          console.log(`[Stripe Webhook] Account ${accountId} successfully upgraded to ${planKey}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        const subscriptionId = subscription.id;
        
        // Resolve account ID either from metadata or lookup by customer ID in DB
        let accountId = subscription.metadata?.account_id;

        if (!accountId) {
          const { data: account } = await supabaseAdmin
            .from('accounts')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          accountId = account?.id;
        }

        if (!accountId) {
          console.warn(`[Stripe Webhook] Could not resolve account for customer ${customerId}`);
          break;
        }

        const priceId = subscription.items.data[0].price.id;
        const rawPlanKey = getPlanKeyFromPriceId(priceId);
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

        // Translate Stripe subscription status to our local status
        let status = 'active';
        let planKey = rawPlanKey;
        let limit = PLANS[planKey].aiMessageLimit;

        if (subscription.status === 'past_due') {
          status = 'past_due';
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          status = 'canceled';
          planKey = 'starter'; // Downgrade
          limit = PLANS.starter.aiMessageLimit;
        } else if (subscription.status === 'trialing') {
          status = 'trial';
        }

        const { error } = await supabaseAdmin
          .from('accounts')
          .update({
            subscription_status: status,
            subscription_plan: planKey,
            subscription_expires_at: expiresAt,
            stripe_subscription_id: subscriptionId,
            ai_message_limit: limit,
          })
          .eq('id', accountId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to update account ${accountId} on subscription update:`, error);
        } else {
          console.log(`[Stripe Webhook] Account ${accountId} subscription updated to status ${status}, plan ${planKey}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;

        let accountId = subscription.metadata?.account_id;

        if (!accountId) {
          const { data: account } = await supabaseAdmin
            .from('accounts')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          accountId = account?.id;
        }

        if (!accountId) {
          console.warn(`[Stripe Webhook] Could not resolve account for customer ${customerId} on subscription deletion`);
          break;
        }

        // Downgrade account to starter on deletion/cancellation
        const { error } = await supabaseAdmin
          .from('accounts')
          .update({
            subscription_status: 'canceled',
            subscription_plan: 'starter',
            subscription_expires_at: null,
            stripe_subscription_id: null,
            ai_message_limit: PLANS.starter.aiMessageLimit,
          })
          .eq('id', accountId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to downgrade account ${accountId} on subscription deletion:`, error);
        } else {
          console.log(`[Stripe Webhook] Account ${accountId} subscription deleted and downgraded to starter`);
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook] Exception processing event:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
