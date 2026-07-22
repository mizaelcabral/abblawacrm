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
      .select('id, account_id, ai_auto_respond')
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
      // Check if contact already exists by phone or email for this account
      let existingMatch = null;
      if (phone || email) {
        let query = supabase.from('contacts').select('id, name, email, phone').eq('account_id', config.account_id);
        if (phone && email) {
          query = query.or(`phone.eq.${phone},email.eq.${email}`);
        } else if (phone) {
          query = query.eq('phone', phone);
        } else if (email) {
          query = query.eq('email', email);
        }
        const { data: matched } = await query.limit(1).maybeSingle();
        existingMatch = matched;
      }

      if (existingMatch) {
        contactId = existingMatch.id;
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name && (!existingMatch.name || existingMatch.name === 'Visitante do Site')) updateData.name = name;
        if (email && !existingMatch.email) updateData.email = email;
        if (phone && !existingMatch.phone) updateData.phone = phone;

        if (Object.keys(updateData).length > 1) {
          await supabase.from('contacts').update(updateData).eq('id', contactId);
        }
      } else if (contactId) {
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phone) updateData.phone = phone;

        await supabase.from('contacts').update(updateData).eq('id', contactId);
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
          ai_enabled: config.ai_auto_respond ?? false,
        }).select('id').single();

        conversationId = newConv?.id;
      }
    }

    // 6) Create or update session record (ALWAYS persist visitor_name, visitor_email, visitor_phone)
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
    } else {
      // Update session with new lead details or foreign keys whenever provided
      const updatePayload: Record<string, any> = {};
      if (contactId && contactId !== existingSession.contact_id) updatePayload.contact_id = contactId;
      if (conversationId && conversationId !== existingSession.conversation_id) updatePayload.conversation_id = conversationId;
      if (name) updatePayload.visitor_name = name;
      if (email) updatePayload.visitor_email = email;
      if (phone) updatePayload.visitor_phone = phone;

      if (Object.keys(updatePayload).length > 0) {
        const { data: updatedSession } = await supabase
          .from('chat_widget_sessions')
          .update(updatePayload)
          .eq('id', existingSession.id)
          .select('*')
          .single();
        if (updatedSession) session = updatedSession;
      }
    }

    // 7) Create or update CRM Lead (Deal in pipelines) when lead info (name/phone/email) is provided
    if (ownerUserId && contactId && (name || email || phone)) {
      // ponytail: find or seed default pipeline & stage to record CRM lead
      let { data: pipelines } = await supabase
        .from('pipelines')
        .select('id')
        .eq('account_id', config.account_id)
        .order('created_at', { ascending: true })
        .limit(1);

      let pipelineId = pipelines?.[0]?.id;

      if (!pipelineId) {
        const { data: newPipe } = await supabase
          .from('pipelines')
          .insert({
            account_id: config.account_id,
            user_id: ownerUserId,
            name: 'Funil de Vendas',
          })
          .select('id')
          .single();

        if (newPipe) {
          pipelineId = newPipe.id;
          const stagesToSeed = [
            { pipeline_id: pipelineId, account_id: config.account_id, name: 'Novo Lead', color: '#3b82f6', position: 0 },
            { pipeline_id: pipelineId, account_id: config.account_id, name: 'Qualificado', color: '#eab308', position: 1 },
            { pipeline_id: pipelineId, account_id: config.account_id, name: 'Proposta Enviada', color: '#f97316', position: 2 },
            { pipeline_id: pipelineId, account_id: config.account_id, name: 'Negociação', color: '#8b5cf6', position: 3 },
            { pipeline_id: pipelineId, account_id: config.account_id, name: 'Ganho', color: '#22c55e', position: 4 },
          ];
          await supabase.from('pipeline_stages').insert(stagesToSeed);
        }
      }

      if (pipelineId) {
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .order('position', { ascending: true })
          .limit(1);

        const stageId = stages?.[0]?.id;

        if (stageId) {
          const { data: existingDeal } = await supabase
            .from('deals')
            .select('id')
            .eq('account_id', config.account_id)
            .eq('contact_id', contactId)
            .maybeSingle();

          const leadTitle = name ? `Lead: ${name}` : phone ? `Lead: ${phone}` : email ? `Lead: ${email}` : 'Lead: Web Chat';

          if (!existingDeal) {
            await supabase.from('deals').insert({
              account_id: config.account_id,
              user_id: ownerUserId,
              pipeline_id: pipelineId,
              stage_id: stageId,
              contact_id: contactId,
              conversation_id: conversationId || null,
              title: leadTitle,
              value: 0,
              status: 'open',
              notes: 'Lead cadastrado via Ficha do Chat Web.',
            });
          } else {
            await supabase.from('deals').update({
              title: leadTitle,
              conversation_id: conversationId || undefined,
              updated_at: new Date().toISOString(),
            }).eq('id', existingDeal.id);
          }
        }
      }
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
