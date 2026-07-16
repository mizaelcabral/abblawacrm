import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { tenantSlug, password } = await request.json();

    if (!tenantSlug || !password) {
      return NextResponse.json({ error: 'tenantSlug and password are required' }, { status: 400 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug);
    let query = supabaseAdmin.from('woovi_config').select('store_password');

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

    if (data.store_password === password) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Senha incorreta' }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
