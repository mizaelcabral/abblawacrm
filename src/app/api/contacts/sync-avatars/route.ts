import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { persistContactAvatar } from '@/lib/contacts/avatar';

async function fetchProfileWithRetry(
  apiUrl: string,
  instanceName: string,
  token: string,
  remoteJid: string
): Promise<{ picture: string | null }> {
  try {
    const res = await fetch(`${apiUrl}/chat/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: token,
      },
      body: JSON.stringify({ number: remoteJid }),
    });
    if (!res.ok) return { picture: null };
    const data = await res.json();
    return { picture: data.picture || null };
  } catch {
    return { picture: null };
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    // Check authorization (bearer service key or active session)
    const authHeader = req.headers.get('Authorization');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isServiceCall = serviceKey && authHeader === `Bearer ${serviceKey}`;

    if (!isServiceCall && (userErr || !user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();

    let accountId: string | null = null;
    if (user && !isServiceCall) {
      const { data: profile } = await admin
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      accountId = profile?.account_id || null;
    }

    // Query contacts needing avatar persistence
    // 1) avatar_url contains external CDN (e.g. pps.whatsapp.net, cdninstagram.com)
    // 2) avatar_url IS NULL
    let query = admin
      .from('contacts')
      .select('id, phone, avatar_url, account_id')
      .not('phone', 'is', null);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: contacts, error: contactsError } = await query
      .or('avatar_url.is.null,avatar_url.not.ilike.%supabase.co/storage%')
      .limit(100);

    if (contactsError) {
      console.error('[Sync Avatars API] Error fetching contacts:', contactsError);
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'All contact avatars are up to date.',
        processed: 0,
        updated: 0,
      });
    }

    // Fetch active WhatsApp Web configs
    const accountIds = Array.from(new Set(contacts.map((c) => c.account_id).filter(Boolean)));
    const { data: configs } = await admin
      .from('whatsapp_web_config')
      .select('*')
      .in('account_id', accountIds)
      .eq('is_active', true);

    const configMap = new Map<string, any>();
    if (configs) {
      for (const cfg of configs) {
        configMap.set(cfg.account_id, cfg);
      }
    }

    const isGlobal = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_TOKEN);

    let processedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      processedCount++;
      let targetRawUrl = contact.avatar_url;

      // If avatar_url is missing or external, attempt to fetch fresh picture from Evolution API
      if (!targetRawUrl || targetRawUrl.includes('pps.whatsapp.net')) {
        const config = configMap.get(contact.account_id);
        const finalApiUrl = isGlobal ? process.env.EVOLUTION_API_URL! : config?.api_url;
        const token = (isGlobal ? process.env.EVOLUTION_API_TOKEN! : config ? decrypt(config.api_token) : '') || '';

        if (finalApiUrl && token && contact.phone) {
          const remoteJid = contact.phone.includes('@') ? contact.phone : `${contact.phone}@s.whatsapp.net`;
          const instanceName = isGlobal ? 'global' : config?.instance_name;
          const freshProfile = await fetchProfileWithRetry(finalApiUrl, instanceName, token, remoteJid);
          if (freshProfile.picture) {
            targetRawUrl = freshProfile.picture;
          }
        }
      }

      if (targetRawUrl) {
        const persistentUrl = await persistContactAvatar(admin, contact.id, targetRawUrl);
        if (persistentUrl && persistentUrl !== contact.avatar_url) {
          const { error: updateError } = await admin
            .from('contacts')
            .update({ avatar_url: persistentUrl })
            .eq('id', contact.id);

          if (!updateError) {
            updatedCount++;
          } else {
            failedCount++;
          }
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      processed: processedCount,
      updated: updatedCount,
      failed: failedCount,
    });
  } catch (err: any) {
    console.error('[Sync Avatars API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
