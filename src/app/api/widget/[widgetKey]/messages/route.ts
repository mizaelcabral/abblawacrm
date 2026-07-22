import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const { searchParams } = new URL(request.url);
  const visitorToken = searchParams.get('visitorToken');

  if (!visitorToken) {
    return NextResponse.json({ error: 'visitorToken is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from('chat_widget_sessions')
    .select('contact_id')
    .eq('visitor_token', visitorToken)
    .single();

  if (!session?.contact_id) {
    return NextResponse.json({ messages: [] }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('contact_id', session.contact_id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ messages: messages || [] }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const body = await request.json();
  const { visitorToken, content } = body;

  if (!visitorToken || !content) {
    return NextResponse.json({ error: 'visitorToken and content are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from('chat_widget_configs')
    .select('id, account_id, ai_auto_respond, ai_agent_id')
    .eq('widget_key', widgetKey)
    .single();

  if (!config) {
    return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
  }

  let { data: session } = await supabase
    .from('chat_widget_sessions')
    .select('*')
    .eq('widget_config_id', config.id)
    .eq('visitor_token', visitorToken)
    .single();

  let contactId = session?.contact_id;
  if (!contactId) {
    const { data: newContact } = await supabase.from('contacts').insert({
      account_id: config.account_id,
      name: 'Visitante do Site',
      channel: 'livechat',
    }).select('id').single();

    contactId = newContact?.id;

    if (session) {
      await supabase.from('chat_widget_sessions').update({ contact_id: contactId }).eq('id', session.id);
    }
  }

  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      account_id: config.account_id,
      contact_id: contactId,
      direction: 'inbound',
      content: content,
      channel: 'livechat',
      sender_type: 'visitor',
    })
    .select('*')
    .single();

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json({ message }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
