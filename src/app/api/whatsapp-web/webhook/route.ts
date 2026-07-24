import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { generateAIResponse, transcribeAudioUsingGemini } from '@/lib/ai/service';
import { verifyBillingAndUsage, incrementAIConsumption } from '@/lib/billing/guard';

// ponytail: format phone number as a human-readable fallback name (no external deps)
function formatPhoneAsName(phone: string): string {
  // Brazilian numbers: +55 XX XXXXX-XXXX or +55 XX XXXX-XXXX
  if (phone.startsWith('55') && phone.length >= 12) {
    const country = phone.slice(0, 2);
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    if (rest.length === 9) {
      return `+${country} ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+${country} ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return `+${phone}`;
}

// ponytail: fetchProfile with 1-retry and 1s delay between attempts
async function fetchProfileWithRetry(
  apiUrl: string,
  instanceName: string,
  token: string,
  remoteJid: string
): Promise<{ name: string | null; picture: string | null; resolvedJid: string | null }> {
  const doFetch = async (): Promise<{ name: string | null; picture: string | null; resolvedJid: string | null }> => {
    const res = await fetch(`${apiUrl}/chat/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: token,
      },
      body: JSON.stringify({ number: remoteJid })
    });
    if (!res.ok) return { name: null, picture: null, resolvedJid: null };
    const profileData = await res.json();
    const jid = profileData.wuid || profileData.jid || profileData.id;
    return {
      name: profileData.name || null,
      picture: profileData.picture || null,
      resolvedJid: (jid && !jid.includes('@lid')) ? jid.split('@')[0].split(':')[0] : null,
    };
  };

  const first = await doFetch();
  if (first.name) return first;

  // Retry once after 1s delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  return doFetch();
}

// Admin client helper
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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[WhatsApp Web Webhook] Received payload event:', payload.event, 'Instance:', payload.instance);

    // LOG WEBHOOK PAYLOAD FOR DEBUGGING
    try {
      await supabaseAdmin().from('webhook_logs').insert({ payload });
    } catch (err) {
      console.error('[Webhook Logger] Failed to write log:', err);
    }

    // Only process message events (e.g. messages.upsert for incoming/outgoing)
    if (payload.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_event' }, { status: 200 });
    }

    const messageData = payload.data;
    if (!messageData || !messageData.key) {
      return NextResponse.json({ error: 'Invalid payload data' }, { status: 400 });
    }

    const instanceName = payload.instance;
    
    // Find WhatsApp Web config by instance name
    const { data: config, error: configError } = await supabaseAdmin()
      .from('whatsapp_web_config')
      .select('*')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (configError || !config) {
      console.error('[WhatsApp Web Webhook] Config not found for instance:', instanceName);
      return NextResponse.json({ error: 'Instance not configured' }, { status: 404 });
    }

    // Ignore messages sent by ourselves in the CRM (outbox messages already saved)
    // Wait: Baileys event messages.upsert triggers for both incoming and outgoing messages.
    // Outgoing messages have key.fromMe = true. If they are fromMe, let's see if we should ignore them
    // or insert them if they were sent from another device (syncing).
    // If they were sent from another device, saving them to DB is good (multi-device sync!).
    // But if they were sent from the CRM, we already insert them in the send endpoint.
    // To prevent duplicate insertions, we check if a message with key.id already exists.
    const messageId = messageData.key.id;
    const { data: existingMsg } = await supabaseAdmin()
      .from('messages')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (existingMsg) {
      return NextResponse.json({ status: 'ignored_duplicate' }, { status: 200 });
    }

    await processIncomingMessage(config, messageData);

    return NextResponse.json({ status: 'processed' }, { status: 200 });
  } catch (error) {
    console.error('[WhatsApp Web Webhook] Webhook handler crashed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processIncomingMessage(config: any, messageData: any) {
  const messageId = messageData.key.id;
  const remoteJid = messageData.key.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us')) {
    // Ignore group chats
    return;
  }

  // ponytail: split by colon to strip multi-device index suffix (e.g. 5511930258947:77 -> 5511930258947)
  let phone = remoteJid.split('@')[0].split(':')[0];

  const existingContact = await findExistingContact(supabaseAdmin(), config.account_id, phone);
  let avatarUrl: string | null = (existingContact?.avatar_url as string | null) || null;
  let profileName: string | null = null;

  // ponytail: only fetch profile if contact is new, has no avatar, has no real name, or is a LID JID
  if (!existingContact || !existingContact.avatar_url || !existingContact.name || existingContact.name === 'WhatsApp Contact' || existingContact.name.startsWith('+') || remoteJid.endsWith('@lid')) {
    try {
      const token = decrypt(config.api_token);
      const profile = await fetchProfileWithRetry(config.api_url, config.instance_name, token, remoteJid);
      if (profile.resolvedJid) {
        phone = profile.resolvedJid;
      }
      if (profile.name) {
        profileName = profile.name;
        if (existingContact && (!existingContact.name || existingContact.name === 'WhatsApp Contact' || existingContact.name.startsWith('+'))) {
          await supabaseAdmin()
            .from('contacts')
            .update({ name: profileName })
            .eq('id', existingContact.id);
          existingContact.name = profileName;
        }
      }
      if (profile.picture) {
        avatarUrl = profile.picture;
        if (existingContact && existingContact.avatar_url !== avatarUrl) {
          await supabaseAdmin()
            .from('contacts')
            .update({ avatar_url: avatarUrl })
            .eq('id', existingContact.id);
          existingContact.avatar_url = avatarUrl;
        }
      }
    } catch (err) {
      console.error('[WhatsApp Web Webhook] Failed to fetch/resolve profile:', err);
    }
  }

  const fromMe = messageData.key.fromMe;
  const senderType = fromMe ? 'agent' : 'customer';

  // 1) Find or create contact
  // ponytail: do not use agent's own pushName for contacts when syncing outgoing messages
  const displayName = fromMe 
    ? (profileName || formatPhoneAsName(phone)) 
    : (messageData.pushName || profileName || formatPhoneAsName(phone));
  const contact = await findOrCreateContact(config.account_id, config.user_id, phone, displayName, avatarUrl);
  if (!contact) return;

  // 2) Find or create conversation
  const conversation = await findOrCreateConversation(config.account_id, config.user_id, contact.id);
  if (!conversation) return;

  // 3) Parse content type and text
  let contentType = 'text';
  let contentText = '';
  let mediaUrl: string | null = null;
  let filename: string | null = null;

  let msgBody = messageData.message;
  if (!msgBody) return;

  // Unwrap potential message wrappers (ephemeral, viewOnce, etc.)
  while (
    msgBody?.viewOnceMessage?.message ||
    msgBody?.viewOnceMessageV2?.message ||
    msgBody?.viewOnceMessageV2Extension?.message ||
    msgBody?.ephemeralMessage?.message ||
    msgBody?.documentWithCaptionMessage?.message
  ) {
    msgBody =
      msgBody.viewOnceMessage?.message ||
      msgBody.viewOnceMessageV2?.message ||
      msgBody.viewOnceMessageV2Extension?.message ||
      msgBody.ephemeralMessage?.message ||
      msgBody.documentWithCaptionMessage?.message;
  }

  if (msgBody.conversation) {
    contentText = msgBody.conversation;
  } else if (msgBody.extendedTextMessage) {
    contentText = msgBody.extendedTextMessage.text || '';
  } else if (msgBody.imageMessage) {
    contentType = 'image';
    contentText = msgBody.imageMessage.caption || '[Imagem]';
  } else if (msgBody.stickerMessage) {
    contentType = 'sticker';
    contentText = '[Figurinha]';
    filename = 'sticker';
  } else if (msgBody.videoMessage) {
    contentType = 'video';
    contentText = msgBody.videoMessage.caption || '[Vídeo]';
  } else if (msgBody.audioMessage) {
    contentType = 'audio';
    contentText = '[Mensagem de voz]';
  } else if (msgBody.documentMessage) {
    contentType = 'document';
    filename = msgBody.documentMessage.fileName || 'document';
    contentText = msgBody.documentMessage.caption || filename || '[Documento]';
  }

  // 4) Handle Media Download if payload contains base64 or direct URL
  // In Evolution API, if base64 or direct URL is in messageData/msgBody, we use it.
  // Otherwise, we fetch it asynchronously from Evolution API's getBase64FromMediaMessage endpoint.
  let base64Data =
    messageData.base64 ||
    messageData.message?.base64 ||
    msgBody.videoMessage?.base64 ||
    msgBody.imageMessage?.base64 ||
    msgBody.audioMessage?.base64 ||
    msgBody.documentMessage?.base64 ||
    msgBody.stickerMessage?.base64;

  const directUrl =
    messageData.mediaUrl ||
    messageData.url ||
    msgBody.videoMessage?.url ||
    msgBody.imageMessage?.url ||
    msgBody.audioMessage?.url ||
    msgBody.documentMessage?.url;

  if (!base64Data && directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
    mediaUrl = directUrl;
  }

  if (!base64Data && !mediaUrl && (contentType === 'image' || contentType === 'video' || contentType === 'audio' || contentType === 'document' || contentType === 'sticker')) {
    try {
      console.log('[WhatsApp Web Webhook] Base64 missing from payload. Fetching from getBase64FromMediaMessage...');
      const token = decrypt(config.api_token);
      const res = await fetch(`${config.api_url}/chat/getBase64FromMediaMessage/${config.instance_name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: token,
        },
        body: JSON.stringify({
          message: messageData,
          convertToMp4: contentType === 'video',
        }),
      });

      if (res.ok) {
        const responseData = await res.json();
        const fetchedBase64 =
          typeof responseData.base64 === 'string' ? responseData.base64 :
          typeof responseData.base64?.base64 === 'string' ? responseData.base64.base64 :
          typeof responseData.base64Data === 'string' ? responseData.base64Data :
          typeof responseData.media === 'string' ? responseData.media : null;

        if (fetchedBase64) {
          base64Data = fetchedBase64;
          console.log('[WhatsApp Web Webhook] Successfully fetched media base64 for message:', messageId);
        } else if (responseData.mediaUrl || responseData.url) {
          mediaUrl = responseData.mediaUrl || responseData.url;
        } else {
          console.warn('[WhatsApp Web Webhook] getBase64FromMediaMessage response missing base64 field:', responseData);
        }
      } else {
        const errText = await res.text();
        console.error(`[WhatsApp Web Webhook] Failed to fetch base64 from Evolution API: ${res.status} - ${errText}`);
      }
    } catch (err) {
      console.error('[WhatsApp Web Webhook] Error fetching base64 from Evolution API:', err);
    }
  }

  if (base64Data) {
    try {
      // Ensure the base64 has standard data URI prefix so uploadMediaFromBase64 parses it correctly
      let cleanBase64 = base64Data;
      if (!cleanBase64.includes(';base64,')) {
        let detectedMime = 'application/octet-stream';
        if (contentType === 'image') detectedMime = msgBody.imageMessage?.mimetype || 'image/jpeg';
        else if (contentType === 'video') detectedMime = msgBody.videoMessage?.mimetype || 'video/mp4';
        else if (contentType === 'audio') detectedMime = msgBody.audioMessage?.mimetype || 'audio/ogg';
        else if (contentType === 'document') detectedMime = msgBody.documentMessage?.mimetype || 'application/pdf';
        else if (contentType === 'sticker') detectedMime = 'image/webp';
        
        cleanBase64 = `data:${detectedMime};base64,${cleanBase64}`;
      }

      base64Data = cleanBase64;
      mediaUrl = await uploadMediaFromBase64(config.account_id, cleanBase64, filename || 'media_file');
    } catch (err) {
      console.error('[WhatsApp Web Webhook] Failed to upload media:', err);
    }
  }

  // ponytail: transcribe audio using base64Data or mediaUrl fallback
  if (contentType === 'audio' && (base64Data || mediaUrl)) {
    try {
      console.log('[WhatsApp Web Webhook] Transcribing incoming audio...');
      const audioSource = base64Data || mediaUrl;
      const transcription = await transcribeAudioUsingGemini(audioSource, config.account_id);
      if (transcription) {
        console.log('[WhatsApp Web Webhook] Audio transcribed successfully:', transcription);
        contentText = `🎙️ [Áudio Transcrito]: "${transcription}"`;
      } else {
        console.warn('[WhatsApp Web Webhook] Audio transcription returned empty response');
        contentText = '[Mensagem de voz]';
      }
    } catch (err) {
      console.error('[WhatsApp Web Webhook] Failed to transcribe audio:', err);
      contentText = '[Mensagem de voz]';
    }
  }

  // 5) Insert message into database
  const { data: msgRow, error: insertError } = await supabaseAdmin()
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: senderType,
      content_type: contentType,
      content_text: contentText || null,
      media_url: mediaUrl,
      message_id: messageData.key.id,
      status: fromMe ? 'sent' : 'delivered',
      channel: 'whatsapp',
    })
    .select()
    .single();

  if (insertError) {
    console.error('[WhatsApp Web Webhook] Error inserting message:', insertError);
    return;
  }

  // 6) Update conversation metadata
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      unread_count: fromMe ? 0 : (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  // 7) Trigger AI Autopilot Autopilot if enabled (and message is incoming from customer)
  if (!fromMe && conversation.ai_enabled && contentText) {
    const billingGuard = await verifyBillingAndUsage(config.account_id, 'autopilot');
    if (!billingGuard.allowed) {
      console.warn(`[WhatsApp Web Webhook AI] Autopilot blocked: ${billingGuard.reason}`);
      
      await supabaseAdmin()
        .from('conversations')
        .update({ ai_enabled: false })
        .eq('id', conversation.id);

      await supabaseAdmin().from('messages').insert({
        conversation_id: conversation.id,
        sender_type: 'system',
        content_type: 'text',
        content_text: `⚠️ Piloto Automático desativado: ${billingGuard.reason}`,
        status: 'delivered'
      });
    } else {
      try {
        const aiResult = await generateAIResponse(
          contentText,
          conversation.id,
          config.account_id,
          conversation.ai_system_prompt || undefined,
          true // use RAG
        );

        let replyText = aiResult.text || '';
        const isHandoff = aiResult.action === 'handoff';

        if (isHandoff) {
          await supabaseAdmin()
            .from('conversations')
            .update({ ai_enabled: false, status: 'open' })
            .eq('id', conversation.id);

          await supabaseAdmin().from('messages').insert({
            conversation_id: conversation.id,
            sender_type: 'system',
            content_type: 'text',
            content_text: '⚠️ IA desativada automaticamente. Cliente solicitou atendente humano.',
            status: 'delivered'
          });

          replyText = aiResult.text || 'Entendi. Vou transferir você para um atendente humano agora mesmo. Por favor, aguarde.';
        }

        // Send the AI-generated reply back via Evolution API
        const token = decrypt(config.api_token);
        await fetch(`${config.api_url}/message/sendText/${config.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: token,
          },
          body: JSON.stringify({
            number: phone,
            text: replyText
          })
        });

        // Insert AI reply to DB
        await supabaseAdmin().from('messages').insert({
          conversation_id: conversation.id,
          sender_type: 'bot',
          content_type: 'text',
          content_text: replyText,
          status: 'sent',
          channel: 'whatsapp'
        });

        // Update conversation
        await supabaseAdmin()
          .from('conversations')
          .update({
            last_message_text: replyText,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);

        await incrementAIConsumption(config.account_id);
      } catch (aiError) {
        console.error('[WhatsApp Web Webhook AI] Failed to run autopilot:', aiError);
      }
    }
  }
}

async function findOrCreateContact(accountId: string, userId: string, phone: string, name: string, avatarUrl?: string | null) {
  // Normalize phone variant (matching our DB dedupe structure)
  const normalized = normalizePhone(phone);
  const existing = await findExistingContact(
    supabaseAdmin(),
    accountId,
    phone
  );

  if (existing) {
    // ponytail: update placeholder name or missing avatar if we have real profile data now
    let needsUpdate = false;
    const updatePayload: any = {};
    if ((!existing.name || existing.name === 'WhatsApp Contact' || existing.name.startsWith('+')) && name && name !== 'WhatsApp Contact' && !name.startsWith('+')) {
      updatePayload.name = name;
      needsUpdate = true;
    }
    if (avatarUrl && existing.avatar_url !== avatarUrl) {
      updatePayload.avatar_url = avatarUrl;
      needsUpdate = true;
    }
    if (needsUpdate) {
      const { data } = await supabaseAdmin()
        .from('contacts')
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();
      if (data) return data;
    }
    return existing;
  }

  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      name,
      phone: normalized,
      avatar_url: avatarUrl || null,
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContact(
        supabaseAdmin(),
        accountId,
        phone
      );
      if (raced) return raced;
    }
    console.error('[WhatsApp Web Webhook] Error creating contact:', createError);
    return null;
  }

  return newContact;
}

async function findOrCreateConversation(accountId: string, userId: string, contactId: string) {
  const { data: existing, error } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (!error && existing) {
    return existing;
  }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      channel: 'whatsapp',
    })
    .select()
    .single();

  if (createError) {
    console.error('[WhatsApp Web Webhook] Error creating conversation:', createError);
    return null;
  }

  return newConv;
}

async function uploadMediaFromBase64(accountId: string, base64Data: string, filename: string): Promise<string> {
  const base64Parts = base64Data.split(';base64,');
  const rawMime = base64Parts[0].includes(':') ? base64Parts[0].split(':')[1]?.split(';')[0] : 'application/octet-stream';
  const mimeType = rawMime || 'application/octet-stream';
  const base64Bytes = base64Parts[1] || base64Data;
  const buffer = Buffer.from(base64Bytes, 'base64');

  let ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  if (ext === 'quicktime') ext = 'mov';
  if (ext === '3gpp') ext = '3gp';
  const cleanFilename = filename.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const now = Date.now();
  const storagePath = `account-${accountId}/${now}-${cleanFilename}.${ext}`;

  const { error: uploadError } = await supabaseAdmin()
    .storage
    .from('chat-media')
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  const { data } = supabaseAdmin().storage.from('chat-media').getPublicUrl(storagePath);
  return data.publicUrl;
}
