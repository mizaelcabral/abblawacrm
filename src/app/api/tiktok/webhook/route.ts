import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { dispatchInboundToFlows } from '@/lib/flows/engine';
import { generateAIResponse } from '@/lib/ai/service';

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

// GET - Webhook verification handshake/challenge if TikTok sends one
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return NextResponse.json({ ok: true });
}

// POST - Ingest TikTok Event Webhooks
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log('TikTok webhook received payload:', JSON.stringify(payload));

    // Handle TikTok Webhook Verification if it's sent in POST body
    if (payload.event === 'verify') {
      return NextResponse.json({ challenge: payload.challenge });
    }

    const { event, client_key, content } = payload;
    if (!event || !content) {
      return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
    }

    // 1. Resolve account config using the client_key or search database
    const { data: config, error: configError } = await supabaseAdmin()
      .from('tiktok_integration_config')
      .select('*')
      .limit(1) // In production, we'd lookup by client_key/open_id
      .maybeSingle();

    if (configError || !config) {
      console.error('No config found for TikTok webhook event or error occurred:', configError);
      return NextResponse.json({ error: 'Configuração não encontrada' }, { status: 404 });
    }

    const accountId = config.account_id;

    // 2. Handle Message Event (DMs)
    if (event === 'im.messages') {
      const { sender_openid, conversation_id, text, message_id } = content;

      // Find or create Contact
      let { data: contact, error: contactError } = await supabaseAdmin()
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('tiktok_user_id', sender_openid)
        .maybeSingle();

      if (!contact && !contactError) {
        // Create new contact
        const name = `TikTok User ${sender_openid.slice(-4)}`;
        const { data: newContact, error: createError } = await supabaseAdmin()
          .from('contacts')
          .insert({
            account_id: accountId,
            name: name,
            tiktok_user_id: sender_openid,
          })
          .select('*')
          .single();

        if (createError) {
          console.error('Failed to create contact for TikTok message:', createError);
          return NextResponse.json({ error: 'Erro ao criar contato' }, { status: 500 });
        }
        contact = newContact;
      }

      if (!contact) {
        return NextResponse.json({ error: 'Contato não encontrado' }, { status: 500 });
      }

      // Find or create Conversation
      let { data: conversation, error: convError } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .eq('channel', 'tiktok')
        .maybeSingle();

      if (!conversation && !convError) {
        const { data: newConv, error: createConvError } = await supabaseAdmin()
          .from('conversations')
          .insert({
            account_id: accountId,
            contact_id: contact.id,
            channel: 'tiktok',
            status: 'open',
          })
          .select('*')
          .single();

        if (createConvError) {
          console.error('Failed to create conversation for TikTok webhook:', createConvError);
          return NextResponse.json({ error: 'Erro ao criar conversa' }, { status: 500 });
        }
        conversation = newConv;
      }

      if (!conversation) {
        return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 500 });
      }

      // Insert message
      const { error: msgInsertError } = await supabaseAdmin()
        .from('messages')
        .insert({
          account_id: accountId,
          conversation_id: conversation.id,
          contact_id: contact.id,
          channel: 'tiktok',
          direction: 'inbound',
          body: text || '',
          sender_name: contact.name,
        });

      if (msgInsertError) {
        console.error('Failed to insert TikTok message:', msgInsertError);
        return NextResponse.json({ error: 'Erro ao salvar mensagem' }, { status: 500 });
      }

      // Run automation engine triggers
      await runAutomationsForTrigger({
        accountId,
        triggerType: 'new_message_received',
        contactId: contact.id,
        context: {
          message_text: text || '',
          conversation_id: conversation.id,
        },
      }).catch((err) => console.error('[automations] dispatch failed:', err));

      // Run flows engine triggers
      await dispatchInboundToFlows({
        accountId,
        userId: config.user_id,
        contactId: contact.id,
        conversationId: conversation.id,
        message: {
          kind: 'text',
          text: text || '',
          meta_message_id: message_id || '',
        },
        isFirstInboundMessage: false, // We'd determine this properly in prod, default to false for mock
      });

      // Optionally invoke AI Autopilot if active
      // (Similar to WhatsApp autopilot flow logic)
    }

    // 3. Handle TikTok Ads Manager Lead Forms
    if (event === 'lead_generation') {
      const { lead_id, form_id, user_answers } = content;
      // Ingest form answers, create or update lead/contact, and map answers to fields
      console.log(`Processing lead from TikTok Form ${form_id}:`, user_answers);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error handling TikTok webhook POST:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
