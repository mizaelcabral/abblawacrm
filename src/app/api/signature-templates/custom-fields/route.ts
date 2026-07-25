import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

function slugifyKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// GET /api/signature-templates/custom-fields - Returns active custom fields for the authenticated account
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
      return NextResponse.json(
        { error: 'Falha ao buscar campos personalizados' },
        { status: 500 }
      );
    }

    // Map & sanitize field_key guarantees
    const mapped = (customFields || [])
      .map((cf) => {
        const resolvedKey = cf.field_key && cf.field_key.trim() !== ''
          ? cf.field_key.trim()
          : slugifyKey(cf.field_name || 'campo');

        return {
          id: cf.id,
          field_key: resolvedKey,
          label: cf.field_name || resolvedKey,
          field_type: cf.field_type || 'text',
          group_name: cf.group_name || 'Gerais',
          is_active: Boolean(cf.is_active),
          display_order: cf.display_order ?? 99,
        };
      })
      .filter((cf) => cf.field_key && cf.field_key.length > 0);

    return NextResponse.json(
      { custom_fields: mapped },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (err: any) {
    console.error('[signature-templates/custom-fields] Error in GET:', err);
    return NextResponse.json(
      { error: 'Erro interno ao consultar campos personalizados' },
      { status: 500 }
    );
  }
}
