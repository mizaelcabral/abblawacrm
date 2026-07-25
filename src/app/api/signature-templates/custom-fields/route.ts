import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

// GET /api/signature-templates/custom-fields - Returns active custom fields grouped by group_name
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile || !profile.account_id) {
      return NextResponse.json({ error: 'Perfil sem conta ativa' }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const { data: customFields, error: cfError } = await admin
      .from('custom_fields')
      .select('id, field_key, field_name, field_type, group_name, is_active, display_order')
      .eq('account_id', profile.account_id)
      .eq('is_active', true)
      .order('group_name', { ascending: true })
      .order('display_order', { ascending: true });

    if (cfError) {
      console.error('[signature-templates/custom-fields] Error fetching custom fields:', cfError);
      return NextResponse.json({ error: 'Falha ao buscar campos personalizados' }, { status: 500 });
    }

    // Map field_name to label for frontend consistency
    const mapped = (customFields || []).map((cf) => ({
      id: cf.id,
      field_key: cf.field_key,
      label: cf.field_name || cf.field_key,
      field_type: cf.field_type,
      group_name: cf.group_name || 'Gerais',
      is_active: cf.is_active,
      display_order: cf.display_order,
    }));

    return NextResponse.json({
      custom_fields: mapped,
    });
  } catch (err: any) {
    console.error('[signature-templates/custom-fields] Error in GET:', err);
    return NextResponse.json(
      { error: 'Erro interno ao consultar campos personalizados' },
      { status: 500 }
    );
  }
}
