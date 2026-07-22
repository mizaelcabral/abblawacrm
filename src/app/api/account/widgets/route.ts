import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const { data: widgets } = await supabase
    .from('chat_widget_configs')
    .select('*')
    .eq('account_id', member.account_id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ widgets: widgets || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const body = await request.json();

  const { data: widget, error } = await supabase
    .from('chat_widget_configs')
    .insert({
      account_id: member.account_id,
      name: body.name || 'Widget do Site',
      primary_color: body.primary_color || '#0F172A',
      title: body.title || 'Atendimento Online',
      subtitle: body.subtitle || 'Como podemos ajudar você hoje?',
      welcome_message: body.welcome_message || 'Olá! Seja bem-vindo ao nosso site.',
      position: body.position || 'bottom_right',
      require_lead_info: body.require_lead_info ?? false,
      ai_auto_respond: body.ai_auto_respond ?? false,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ widget });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: 'Widget ID is required' }, { status: 400 });
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
  if (body.ai_auto_respond !== undefined) updates.ai_auto_respond = body.ai_auto_respond;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data: widget, error } = await supabase
    .from('chat_widget_configs')
    .update(updates)
    .eq('id', body.id)
    .eq('account_id', member.account_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ widget });
}
