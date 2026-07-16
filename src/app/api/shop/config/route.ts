import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantSlug = searchParams.get('tenantSlug');

  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug);
  let query = supabaseAdmin.from('woovi_config').select('*');

  if (isUuid) {
    query = query.or(`account_id.eq.${tenantSlug},store_slug.eq.${tenantSlug}`);
  } else {
    query = query.eq('store_slug', tenantSlug);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Retorna apenas dados públicos seguros (OMITE app_id, secret_key e store_password)
  return NextResponse.json({
    account_id: data.account_id,
    onboarding_status: data.onboarding_status,
    default_shipping_fee: data.default_shipping_fee,
    store_name: data.store_name,
    store_slug: data.store_slug,
    store_description: data.store_description,
    store_logo_url: data.store_logo_url,
    password_protected: data.password_protected,
    has_app_id: !!data.app_id
  });
}
