import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { isUniqueViolation } from '@/lib/contacts/dedupe';

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
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');

    if (!accountId) {
      console.error('[telegram-webhook] Missing accountId in query params');
      return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });
    }

    const payload = await request.json();

    // Process update synchronously to ensure database persistence before returning
    // (prevents serverless environments from freezing background tasks)
    try {
      await processTelegramUpdate(accountId, payload);
    } catch (error) {
      console.error('[telegram-webhook] Error processing update:', error);
    }

    return NextResponse.json({ status: 'received' }, { status: 200 });
  } catch (error) {
    console.error('[telegram-webhook] Webhook handler crashed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processTelegramUpdate(accountId: string, payload: any) {
  const message = payload.message || payload.edited_message;
  if (!message || !message.chat || !message.from) return;

  const chatId = message.chat.id.toString();

  // Find Telegram integration config to decrypt bot token (needed to download media)
  const { data: config, error: configError } = await supabaseAdmin()
    .from('telegram_integration_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (configError || !config) {
    console.error('[telegram-webhook] Integration config not found for account:', accountId);
    return;
  }

  const botToken = decrypt(config.bot_token);
  const configOwnerUserId = config.user_id;

  // 1) Find or create contact
  const firstName = message.from.first_name || '';
  const lastName = message.from.last_name || '';
  const username = message.from.username;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 
    (username ? `@${username}` : `TG User ${chatId.slice(-6)}`);

  const contact = await findOrCreateTelegramContact(
    accountId,
    configOwnerUserId,
    chatId,
    fullName
  );
  if (!contact) return;

  // 2) Find or create conversation
  const conversation = await findOrCreateTelegramConversation(
    accountId,
    configOwnerUserId,
    contact.id
  );
  if (!conversation) return;

  // 3) Parse content types
  let contentType = 'text';
  let contentText = message.text || '';
  let mediaUrl: string | null = null;
  let fileId: string | null = null;
  let mimeType: string | null = null;
  let filename: string | null = null;

  if (message.photo && message.photo.length > 0) {
    contentType = 'image';
    const largestPhoto = message.photo[message.photo.length - 1];
    fileId = largestPhoto.file_id;
    contentText = message.caption || '[Imagem]';
  } else if (message.voice) {
    contentType = 'audio';
    fileId = message.voice.file_id;
    mimeType = message.voice.mime_type || 'audio/ogg';
    contentText = '[Mensagem de voz]';
  } else if (message.audio) {
    contentType = 'audio';
    fileId = message.audio.file_id;
    mimeType = message.audio.mime_type;
    contentText = message.caption || '[Áudio]';
  } else if (message.document) {
    contentType = 'document';
    fileId = message.document.file_id;
    mimeType = message.document.mime_type;
    filename = message.document.file_name;
    contentText = message.caption || filename || '[Documento]';
  } else if (message.video) {
    contentType = 'video';
    fileId = message.video.file_id;
    mimeType = message.video.mime_type;
    contentText = message.caption || '[Vídeo]';
  }

  // 4) If media, download from Telegram and upload to Supabase Storage
  if (fileId) {
    try {
      mediaUrl = await downloadAndUploadTelegramFile(accountId, botToken, fileId, filename || 'telegram_file', mimeType);
    } catch (err) {
      console.error('[telegram-webhook] Failed to handle media file:', err);
      contentText = contentText + ' (Falha ao carregar mídia)';
    }
  }

  // 5) Insert message into Supabase
  const messageId = message.message_id.toString();
  const { data: msgRow, error: insertError } = await supabaseAdmin()
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'customer',
      content_type: contentType,
      content_text: contentText,
      media_url: mediaUrl,
      message_id: messageId,
      status: 'delivered',
      channel: 'telegram',
    })
    .select()
    .single();

  if (insertError) {
    console.error('[telegram-webhook] Error inserting message:', insertError);
    return;
  }

  // 6) Update conversation metadata
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[Mídia]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);
}

async function findOrCreateTelegramContact(
  accountId: string,
  configOwnerUserId: string,
  chatId: string,
  name: string
) {
  const { data: existing, error } = await supabaseAdmin()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      name,
      telegram_chat_id: chatId,
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const raced = await supabaseAdmin()
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('telegram_chat_id', chatId)
        .maybeSingle();
      if (raced.data) return raced.data;
    }
    console.error('[telegram-webhook] Error creating Telegram contact:', createError);
    return null;
  }

  return newContact;
}

async function findOrCreateTelegramConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string
) {
  const { data: existing, error } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('channel', 'telegram')
    .maybeSingle();

  if (!error && existing) {
    return existing;
  }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
      channel: 'telegram',
    })
    .select()
    .single();

  if (createError) {
    console.error('[telegram-webhook] Error creating Telegram conversation:', createError);
    return null;
  }

  return newConv;
}

async function downloadAndUploadTelegramFile(
  accountId: string,
  botToken: string,
  fileId: string,
  originalFilename: string,
  mimeType: string | null
): Promise<string> {
  // A. Fetch file path from Telegram API
  const getFileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  if (!getFileRes.ok) {
    throw new Error(`Telegram getFile failed: ${getFileRes.statusText}`);
  }

  const getFileData = await getFileRes.json();
  if (!getFileData.ok || !getFileData.result?.file_path) {
    throw new Error(`Telegram getFile returned invalid payload`);
  }

  const filePath = getFileData.result.file_path;

  // B. Download the file bytes
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`Telegram download file failed: ${fileRes.statusText}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // C. Upload to Supabase Storage (bucket 'chat-media')
  const ext = filePath.split('.').pop() || 'bin';
  const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const now = Date.now();
  const storagePath = `account-${accountId}/${now}-${cleanFilename}.${ext}`;

  const { error: uploadError } = await supabaseAdmin()
    .storage
    .from('chat-media')
    .upload(storagePath, buffer, {
      contentType: mimeType || getMimeTypeFromExt(ext),
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  // D. Retrieve public URL
  const { data } = supabaseAdmin().storage.from('chat-media').getPublicUrl(storagePath);
  return data.publicUrl;
}

function getMimeTypeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}
