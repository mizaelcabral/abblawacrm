import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const body = await request.json();
  const { visitorToken, name, email, phone, metadata } = body;

  if (!visitorToken) {
    return NextResponse.json({ error: 'visitorToken is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: config, error: configErr } = await supabase
    .from('chat_widget_configs')
    .select('id, account_id')
    .eq('widget_key', widgetKey)
    .eq('is_active', true)
    .single();

  if (configErr || !config) {
    return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
  }

  const { data: existingSession } = await supabase
    .from('chat_widget_sessions')
    .select('*, contact:contacts(*)')
    .eq('widget_config_id', config.id)
    .eq('visitor_token', visitorToken)
    .maybeSingle();

  let contactId = existingSession?.contact_id;

  if (name || email || phone) {
    if (contactId) {
      await supabase.from('contacts').update({
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', contactId);
    } else {
      const { data: newContact } = await supabase.from('contacts').insert({
        account_id: config.account_id,
        name: name || 'Visitante do Site',
        email: email || null,
        phone: phone || null,
        channel: 'livechat',
      }).select('id').single();

      contactId = newContact?.id;
    }
  }

  let session = existingSession;
  if (!session) {
    const { data: newSession } = await supabase
      .from('chat_widget_sessions')
      .insert({
        widget_config_id: config.id,
        account_id: config.account_id,
        visitor_token: visitorToken,
        contact_id: contactId || null,
        visitor_name: name || null,
        visitor_email: email || null,
        visitor_phone: phone || null,
        metadata: metadata || {},
      })
      .select('*')
      .single();
    session = newSession;
  } else if (contactId && !existingSession.contact_id) {
    await supabase.from('chat_widget_sessions').update({
      contact_id: contactId,
      visitor_name: name || existingSession.visitor_name,
      visitor_email: email || existingSession.visitor_email,
      visitor_phone: phone || existingSession.visitor_phone,
    }).eq('id', existingSession.id);
  }

  return NextResponse.json({ session, contactId }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
