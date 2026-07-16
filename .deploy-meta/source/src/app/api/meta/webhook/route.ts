import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature';

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

// GET - Webhook verification
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const challenge = searchParams.get('hub.challenge');
    const verifyToken = searchParams.get('hub.verify_token');

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 }
      );
    }

    // Fetch configs to check verify tokens
    const { data: configs, error: configError } = await supabaseAdmin()
      .from('meta_integration_config')
      .select('id, verify_token');

    if (configError || !configs) {
      console.error('Error fetching meta configs for verification:', configError);
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 403 }
      );
    }

    let matchedConfig: any = null;
    for (const config of configs) {
      if (!config.verify_token) continue;
      try {
        if (decrypt(config.verify_token) === verifyToken) {
          matchedConfig = config;
          break;
        }
      } catch {
        // Skip wrong-key rows
      }
    }

    if (matchedConfig) {
      // Upgrade token to GCM if it was in legacy CBC format
      if (isLegacyFormat(matchedConfig.verify_token)) {
        void supabaseAdmin()
          .from('meta_integration_config')
          .update({ verify_token: encrypt(verifyToken) })
          .eq('id', matchedConfig.id)
          .then(({ error }: any) => {
            if (error) console.warn('[meta-webhook] verify_token upgrade failed:', error);
          });
      }
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return NextResponse.json(
      { error: 'Verification token mismatch' },
      { status: 403 }
    );
  } catch (error) {
    console.error('Error in meta webhook GET verification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Receive messages
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    console.warn('[meta-webhook] rejected request with invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Process asynchronously to avoid webhook timeouts
  processWebhook(body).catch((error) => {
    console.error('Error processing meta webhook:', error);
  });

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

async function processWebhook(body: any) {
  if (body.object !== 'page' || !body.entry) return;

  for (const entry of body.entry) {
    // entry.id is the Facebook Page ID
    const pageId = entry.id;

    if (!entry.messaging) continue;

    for (const messagingItem of entry.messaging) {
      // We only process inbound messages sent by customers
      if (!messagingItem.message || messagingItem.message.is_echo) continue;

      const senderId = messagingItem.sender.id;
      const recipientId = messagingItem.recipient.id;

      // Find config by either page_id or instagram_business_id
      const { data: configs, error: configError } = await supabaseAdmin()
        .from('meta_integration_config')
        .select('*')
        .or(`facebook_page_id.eq.${recipientId},instagram_business_id.eq.${recipientId}`);

      if (configError || !configs || configs.length === 0) {
        console.error('[meta-webhook] No config found for recipient ID:', recipientId);
        continue;
      }

      const config = configs[0];
      const channel = config.instagram_business_id === recipientId ? 'instagram' : 'messenger';
      const pageAccessToken = decrypt(config.page_access_token);

      await processInboundMessage({
        messagingItem,
        channel,
        accountId: config.account_id,
        configOwnerUserId: config.user_id,
        pageAccessToken,
      });
    }
  }
}

interface InboundMessageArgs {
  messagingItem: any;
  channel: 'messenger' | 'instagram';
  accountId: string;
  configOwnerUserId: string;
  pageAccessToken: string;
}

async function processInboundMessage({
  messagingItem,
  channel,
  accountId,
  configOwnerUserId,
  pageAccessToken,
}: InboundMessageArgs) {
  const senderId = messagingItem.sender.id;
  const message = messagingItem.message;

  // 1) Find or create contact
  const contact = await findOrCreateMetaContact(
    accountId,
    configOwnerUserId,
    channel,
    senderId,
    pageAccessToken
  );
  if (!contact) return;

  // 2) Find or create conversation
  const conversation = await findOrCreateMetaConversation(
    accountId,
    configOwnerUserId,
    contact.id,
    channel
  );
  if (!conversation) return;

  // 3) Parse content
  let contentType = 'text';
  let contentText = message.text || '';
  let mediaUrl: string | null = null;

  if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0];
    contentType = attachment.type === 'file' ? 'document' : attachment.type;
    mediaUrl = attachment.payload?.url || null;
    if (attachment.type !== 'text' && !contentText) {
      contentText = `[Arquivo ${attachment.type}]`;
    }
  }

  // 4) Insert message into Supabase
  const { data: msgRow, error: insertError } = await supabaseAdmin()
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'customer',
      content_type: contentType,
      content_text: contentText,
      media_url: mediaUrl,
      message_id: message.mid,
      status: 'delivered',
      channel,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[meta-webhook] Error inserting message:', insertError);
    return;
  }

  // 5) Update conversation metadata
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

async function findOrCreateMetaContact(
  accountId: string,
  configOwnerUserId: string,
  channel: 'messenger' | 'instagram',
  scopedId: string,
  pageAccessToken: string
) {
  const columnName = channel === 'messenger' ? 'messenger_psid' : 'instagram_igsid';

  const { data: existing, error } = await supabaseAdmin()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq(columnName, scopedId)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  // Create contact with fallback name, then fetch real profile name asynchronously
  const fallbackName = `${channel === 'messenger' ? 'FB User' : 'IG User'} ${scopedId.slice(-6)}`;
  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      name: fallbackName,
      [columnName]: scopedId,
    })
    .select()
    .single();

  if (createError) {
    console.error(`[meta-webhook] Error creating ${channel} contact:`, createError);
    return null;
  }

  // Fetch real profile details in background
  void fetchUserProfileDetails(newContact.id, channel, scopedId, pageAccessToken);

  return newContact;
}

async function findOrCreateMetaConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
  channel: 'messenger' | 'instagram'
) {
  const { data: existing, error } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('channel', channel)
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
      channel,
    })
    .select()
    .single();

  if (createError) {
    console.error('[meta-webhook] Error creating conversation:', createError);
    return null;
  }

  return newConv;
}

// Helper to fetch Facebook/Instagram user details asynchronously
async function fetchUserProfileDetails(
  contactId: string,
  channel: 'messenger' | 'instagram',
  scopedId: string,
  pageAccessToken: string
) {
  try {
    let url = `https://graph.facebook.com/v20.0/${scopedId}?access_token=${pageAccessToken}`;
    if (channel === 'messenger') {
      url = `https://graph.facebook.com/v20.0/${scopedId}?fields=first_name,last_name,profile_pic&access_token=${pageAccessToken}`;
    }

    const response = await fetch(url);
    if (!response.ok) return;

    const data = await response.json();
    let name = '';
    let avatarUrl = '';

    if (channel === 'messenger') {
      name = [data.first_name, data.last_name].filter(Boolean).join(' ');
      avatarUrl = data.profile_pic || '';
    } else {
      // Instagram uses name/username fields
      name = data.name || data.username || '';
      avatarUrl = data.profile_picture_url || '';
    }

    if (name) {
      const updatePayload: any = { name };
      if (avatarUrl) updatePayload.avatar_url = avatarUrl;

      await supabaseAdmin()
        .from('contacts')
        .update(updatePayload)
        .eq('id', contactId);
    }
  } catch (err) {
    console.warn('[meta-webhook] failed to fetch background profile info:', err);
  }
}
