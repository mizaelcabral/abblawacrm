import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  try {
    const { widgetKey } = await params;
    const body = await request.json().catch(() => ({}));
    const { visitorToken, name, email, phone, metadata } = body;

    if (!visitorToken) {
      return NextResponse.json({ error: 'visitorToken é obrigatório' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1) Find widget config
    const { data: config, error: configErr } = await supabase
      .from('chat_widget_configs')
      .select('id, account_id')
      .eq('widget_key', widgetKey)
      .eq('is_active', true)
      .single();

    if (configErr || !config) {
      return NextResponse.json({ error: 'Widget não encontrado ou inativo' }, { status: 404 });
    }

    // 2) Find account owner user_id
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('account_id', config.account_id)
      .limit(1)
      .maybeSingle();

    const ownerUserId = ownerProfile?.user_id;

    // 3) Find existing session
    const { data: existingSession } = await supabase
      .from('chat_widget_sessions')
      .select('*')
      .eq('widget_config_id', config.id)
      .eq('visitor_token', visitorToken)
      .maybeSingle();

    let contactId = existingSession?.contact_id;
    let conversationId = existingSession?.conversation_id;

    // 4) Create or update contact if details provided or missing
    if (ownerUserId && (name || email || phone || !contactId)) {
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
          user_id: ownerUserId,
          name: name || 'Visitante do Site',
          email: email || null,
          phone: phone || null,
        }).select('id').single();

        contactId = newContact?.id;
      }
    }

    // 5) Create or find conversation if contactId exists
    if (ownerUserId && contactId && !conversationId) {
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('account_id', config.account_id)
        .eq('contact_id', contactId)
        .eq('channel', 'livechat')
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConv } = await supabase.from('conversations').insert({
          account_id: config.account_id,
          user_id: ownerUserId,
          contact_id: contactId,
          channel: 'livechat',
          status: 'open',
        }).select('id').single();

        conversationId = newConv?.id;
      }
    }

    // 6) Create or update session record
    let session = existingSession;
    if (!session) {
      const { data: newSession } = await supabase
        .from('chat_widget_sessions')
        .insert({
          widget_config_id: config.id,
          account_id: config.account_id,
          visitor_token: visitorToken,
          contact_id: contactId || null,
          conversation_id: conversationId || null,
          visitor_name: name || null,
          visitor_email: email || null,
          visitor_phone: phone || null,
          metadata: metadata || {},
        })
        .select('*')
        .single();
      session = newSession;
    } else if (contactId !== existingSession.contact_id || conversationId !== existingSession.conversation_id) {
      const { data: updatedSession } = await supabase
        .from('chat_widget_sessions')
        .update({
          contact_id: contactId || existingSession.contact_id,
          conversation_id: conversationId || existingSession.conversation_id,
          visitor_name: name || existingSession.visitor_name,
          visitor_email: email || existingSession.visitor_email,
          visitor_phone: phone || existingSession.visitor_phone,
        })
        .eq('id', existingSession.id)
        .select('*')
        .single();
      session = updatedSession;
    }

    return NextResponse.json({ session, contactId, conversationId }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  } catch (err: any) {
    console.error('[widget-session-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Erro interno na sessão' }, { status: 500 });
  }
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
