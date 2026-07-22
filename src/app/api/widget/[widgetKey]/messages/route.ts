import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAIResponse } from '@/lib/ai/service';
import { verifyBillingAndUsage, incrementAIConsumption } from '@/lib/billing/guard';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  try {
    const { widgetKey } = await params;
    const { searchParams } = new URL(request.url);
    const visitorToken = searchParams.get('visitorToken');

    if (!visitorToken) {
      return NextResponse.json({ error: 'visitorToken é obrigatório' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: session } = await supabase
      .from('chat_widget_sessions')
      .select('conversation_id')
      .eq('visitor_token', visitorToken)
      .maybeSingle();

    if (!session?.conversation_id) {
      return NextResponse.json({ messages: [] }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const { data: dbMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', session.conversation_id)
      .order('created_at', { ascending: true });

    const formattedMessages = (dbMessages || []).map((m: any) => ({
      id: m.id,
      content: m.content_text || '',
      direction: m.sender_type === 'customer' || m.sender_type === 'visitor' ? 'inbound' : 'outbound',
      created_at: m.created_at || m.inserted_at,
    }));

    return NextResponse.json({ messages: formattedMessages }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar mensagens' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  try {
    const { widgetKey } = await params;
    const body = await request.json().catch(() => ({}));
    const { visitorToken, content } = body;

    if (!visitorToken || !content?.trim()) {
      return NextResponse.json({ error: 'visitorToken e content são obrigatórios' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1) Get widget config
    const { data: config } = await supabase
      .from('chat_widget_configs')
      .select('id, account_id, ai_auto_respond')
      .eq('widget_key', widgetKey)
      .eq('is_active', true)
      .single();

    if (!config) {
      return NextResponse.json({ error: 'Widget não encontrado ou inativo' }, { status: 404 });
    }

    // 2) Get owner user_id
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('account_id', config.account_id)
      .limit(1)
      .maybeSingle();

    const ownerUserId = ownerProfile?.user_id;

    // 3) Find or create session
    let { data: session } = await supabase
      .from('chat_widget_sessions')
      .select('*')
      .eq('widget_config_id', config.id)
      .eq('visitor_token', visitorToken)
      .maybeSingle();

    let contactId = session?.contact_id;
    let conversationId = session?.conversation_id;

    if (ownerUserId && !contactId) {
      const { data: newContact } = await supabase.from('contacts').insert({
        account_id: config.account_id,
        user_id: ownerUserId,
        name: 'Visitante do Site',
      }).select('id').single();

      contactId = newContact?.id;
    }

    if (ownerUserId && contactId && !conversationId) {
      const { data: newConv } = await supabase.from('conversations').insert({
        account_id: config.account_id,
        user_id: ownerUserId,
        contact_id: contactId,
        channel: 'livechat',
        status: 'open',
        ai_enabled: config.ai_auto_respond ?? false,
      }).select('id').single();

      conversationId = newConv?.id;
    }

    if (!session && ownerUserId) {
      const { data: newSession } = await supabase.from('chat_widget_sessions').insert({
        widget_config_id: config.id,
        account_id: config.account_id,
        visitor_token: visitorToken,
        contact_id: contactId || null,
        conversation_id: conversationId || null,
      }).select('*').single();
      session = newSession;
    } else if (session && (contactId !== session.contact_id || conversationId !== session.conversation_id)) {
      await supabase.from('chat_widget_sessions').update({
        contact_id: contactId,
        conversation_id: conversationId,
      }).eq('id', session.id);
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'Erro ao criar conversa no CRM' }, { status: 500 });
    }

    // 4) Insert visitor message into Supabase
    const { data: dbMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'customer',
        content_type: 'text',
        content_text: content.trim(),
        status: 'delivered',
        channel: 'livechat',
      })
      .select('*')
      .single();

    if (msgErr) {
      console.error('[widget-messages-api] Insert message error:', msgErr);
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    // 5) Update conversation metadata
    await supabase.from('conversations').update({
      last_message_text: content.trim(),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);

    // 6) Check and trigger AI Autopilot if enabled
    const { data: convData } = await supabase
      .from('conversations')
      .select('ai_enabled, ai_system_prompt')
      .eq('id', conversationId)
      .single();

    const isAiActive = convData?.ai_enabled || config.ai_auto_respond;

    if (isAiActive) {
      const billingGuard = await verifyBillingAndUsage(config.account_id, 'autopilot');
      if (!billingGuard.allowed) {
        console.warn(`[Widget AI] Autopilot blocked: ${billingGuard.reason}`);

        await supabase.from('conversations').update({ ai_enabled: false }).eq('id', conversationId);
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'system',
          content_type: 'text',
          content_text: `⚠️ Piloto Automático desativado: ${billingGuard.reason}`,
          status: 'delivered',
          channel: 'livechat',
        });
      } else {
        try {
          const aiResult = await generateAIResponse(
            content.trim(),
            conversationId,
            config.account_id,
            convData?.ai_system_prompt || undefined,
            true
          );

          let replyText = aiResult.text || '';
          const isHandoff = aiResult.action === 'handoff';

          if (isHandoff) {
            await supabase.from('conversations').update({ ai_enabled: false, status: 'open' }).eq('id', conversationId);
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              sender_type: 'system',
              content_type: 'text',
              content_text: '⚠️ IA desativada automaticamente. Cliente solicitou atendente humano.',
              status: 'delivered',
              channel: 'livechat',
            });
            replyText = aiResult.text || 'Entendi. Vou transferir você para um atendente humano agora mesmo. Por favor, aguarde.';
          }

          // Insert AI response into messages table
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_type: 'bot',
            content_type: 'text',
            content_text: replyText,
            status: 'delivered',
            channel: 'livechat',
          });

          // Update conversation metadata
          await supabase.from('conversations').update({
            last_message_text: replyText,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', conversationId);

          // Increment AI usage
          await incrementAIConsumption(config.account_id);
        } catch (aiErr) {
          console.error('[Widget AI] Failed to generate AI response:', aiErr);
        }
      }
    }

    const messageResponse = {
      id: dbMsg.id,
      content: dbMsg.content_text,
      direction: 'inbound',
      created_at: dbMsg.created_at || dbMsg.inserted_at,
    };

    return NextResponse.json({ message: messageResponse }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    console.error('[widget-messages-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Erro ao enviar mensagem' }, { status: 500 });
  }
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
