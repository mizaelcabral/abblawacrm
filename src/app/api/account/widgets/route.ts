import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userAuth } = await supabase.auth.getUser();
    if (!userAuth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', userAuth.user.id)
      .single();

    if (profileErr || !profile?.account_id) {
      return NextResponse.json({ error: 'Perfil ou conta não encontrada' }, { status: 404 });
    }

    const { data: widgets, error: widgetsErr } = await supabase
      .from('chat_widget_configs')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false });

    if (widgetsErr) {
      return NextResponse.json({ error: widgetsErr.message }, { status: 500 });
    }

    return NextResponse.json({ widgets: widgets || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userAuth } = await supabase.auth.getUser();
    if (!userAuth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', userAuth.user.id)
      .single();

    if (profileErr || !profile?.account_id) {
      return NextResponse.json({ error: 'Perfil ou conta não encontrada' }, { status: 404 });
    }

    const body = await request.json();

    const { data: widget, error } = await supabase
      .from('chat_widget_configs')
      .insert({
        account_id: profile.account_id,
        name: body.name || 'Widget do Site',
        primary_color: body.primary_color || '#0F172A',
        title: body.title || 'Atendimento Online',
        subtitle: body.subtitle || 'Como podemos ajudar você hoje?',
        welcome_message: body.welcome_message || 'Olá! Seja bem-vindo ao nosso site.',
        position: body.position || 'bottom_right',
        require_lead_info: body.require_lead_info ?? false,
        ask_name: body.ask_name ?? true,
        ask_email: body.ask_email ?? true,
        ask_phone: body.ask_phone ?? true,
        ai_auto_respond: body.ai_auto_respond ?? false,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[widgets-api] Error creating widget:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ widget });
  } catch (err: any) {
    console.error('[widgets-api] Internal server error:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao criar widget' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userAuth } = await supabase.auth.getUser();
    if (!userAuth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', userAuth.user.id)
      .single();

    if (profileErr || !profile?.account_id) {
      return NextResponse.json({ error: 'Perfil ou conta não encontrada' }, { status: 404 });
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'ID do widget é obrigatório' }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.primary_color !== undefined) updates.primary_color = body.primary_color;
    if (body.title !== undefined) updates.title = body.title;
    if (body.subtitle !== undefined) updates.subtitle = body.subtitle;
    if (body.welcome_message !== undefined) updates.welcome_message = body.welcome_message;
    if (body.position !== undefined) updates.position = body.position;
    if (body.require_lead_info !== undefined) updates.require_lead_info = body.require_lead_info;
    if (body.ask_name !== undefined) updates.ask_name = body.ask_name;
    if (body.ask_email !== undefined) updates.ask_email = body.ask_email;
    if (body.ask_phone !== undefined) updates.ask_phone = body.ask_phone;
    if (body.ai_auto_respond !== undefined) updates.ai_auto_respond = body.ai_auto_respond;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const { data: widget, error } = await supabase
      .from('chat_widget_configs')
      .update(updates)
      .eq('id', body.id)
      .eq('account_id', profile.account_id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ widget });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno ao atualizar widget' }, { status: 500 });
  }
}
