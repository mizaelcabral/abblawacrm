import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';

// fetchProfile with 1-retry and 1s delay between attempts (mirrors webhook/route.ts)
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

export async function POST(req: Request) {
  try {
    // 1. Authorization bearer verification using SUPABASE_SERVICE_ROLE_KEY
    const authHeader = req.headers.get('Authorization');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();

    // 2. Query up to 50 contacts matching pending name conditions
    // - name = 'WhatsApp Contact'
    // - name IS NULL
    // - name starts with '+'
    // - phone IS NOT NULL
    const { data: contacts, error: contactsError } = await admin
      .from('contacts')
      .select('id, name, phone, avatar_url, account_id')
      .not('phone', 'is', null)
      .or('name.eq.WhatsApp Contact,name.is.null,name.ilike.+%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (contactsError) {
      console.error('[Resolve Names Job] Error fetching pending contacts:', contactsError);
      return NextResponse.json({ error: 'Failed to fetch pending contacts' }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        status: 'success',
        processed: 0,
        resolved: 0,
        errors: 0,
        details: []
      });
    }

    // 3. Fetch whatsapp_web_config configurations for account_ids
    const accountIds = Array.from(new Set(contacts.map(c => c.account_id).filter(Boolean)));
    const { data: configs, error: configsError } = await admin
      .from('whatsapp_web_config')
      .select('*')
      .in('account_id', accountIds)
      .eq('is_active', true);

    if (configsError) {
      console.error('[Resolve Names Job] Error fetching whatsapp_web_configs:', configsError);
      return NextResponse.json({ error: 'Failed to fetch integrations configuration' }, { status: 500 });
    }

    const configMap = new Map<string, any>();
    if (configs) {
      for (const cfg of configs) {
        configMap.set(cfg.account_id, cfg);
      }
    }

    let processedCount = 0;
    let resolvedCount = 0;
    let errorCount = 0;
    const details = [];

    const isGlobal = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_TOKEN);

    // 4. Resolve names
    for (const contact of contacts) {
      processedCount++;
      const config = configMap.get(contact.account_id);

      if (!config && !isGlobal) {
        details.push({
          phone: contact.phone,
          status: 'skipped',
          reason: 'no_active_integration'
        });
        continue;
      }

      try {
        const finalApiUrl = isGlobal ? process.env.EVOLUTION_API_URL! : config.api_url;
        const token = (isGlobal ? process.env.EVOLUTION_API_TOKEN! : decrypt(config.api_token)) || '';

        if (!finalApiUrl || !token) {
          details.push({
            phone: contact.phone,
            status: 'skipped',
            reason: 'missing_credentials'
          });
          continue;
        }

        const remoteJid = contact.phone.includes('@') ? contact.phone : `${contact.phone}@s.whatsapp.net`;
        const profile = await fetchProfileWithRetry(
          finalApiUrl,
          isGlobal ? 'global' : config.instance_name,
          token,
          remoteJid
        );

        // Update name if we got a valid new name (that is not a placeholder)
        const hasNewName = profile.name && profile.name !== 'WhatsApp Contact' && !profile.name.startsWith('+');
        const updatePayload: any = {};
        let shouldUpdate = false;

        if (hasNewName && profile.name !== contact.name) {
          updatePayload.name = profile.name;
          shouldUpdate = true;
        }

        // Always update the avatar URL if a new one is returned, to refresh expired links
        if (profile.picture && profile.picture !== contact.avatar_url) {
          updatePayload.avatar_url = profile.picture;
          shouldUpdate = true;
        }

        if (shouldUpdate) {
          const { error: updateError } = await admin
            .from('contacts')
            .update(updatePayload)
            .eq('id', contact.id);

          if (updateError) {
            throw updateError;
          }

          resolvedCount++;
          details.push({
            phone: contact.phone,
            status: 'resolved',
            newName: updatePayload.name || contact.name,
            newAvatar: !!updatePayload.avatar_url
          });
        } else {
          details.push({
            phone: contact.phone,
            status: 'no_changes_needed'
          });
        }
      } catch (err: any) {
        console.error(`[Resolve Names Job] Error resolving profile for ${contact.phone}:`, err);
        errorCount++;
        details.push({
          phone: contact.phone,
          status: 'error',
          error: err.message || String(err)
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      processed: processedCount,
      resolved: resolvedCount,
      errors: errorCount,
      details
    });

  } catch (error: any) {
    console.error('[Resolve Names Job] Background job crashed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
