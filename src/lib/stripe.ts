import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe SDK] Warning: STRIPE_SECRET_KEY is missing from environment variables.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'mock_key_for_build', {
  typescript: true,
});
