import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sanitizePhoneForMeta, isValidE164, normalizePhone } from '@/lib/whatsapp/phone-utils';
import { WooviClient } from '@/lib/woovi/client';

async function authenticateApiKey(request: Request): Promise<{ accountId: string; userId: string; keyId: string } | null> {
  try {
    // 1. Check Authorization header
    const authHeader = request.headers.get('authorization');
    let token: string | null = null;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7);
    }

    // 2. Check query string key/token
    if (!token) {
      const { searchParams } = new URL(request.url);
      token = searchParams.get('key') || searchParams.get('token');
    }

    if (!token) return null;

    const keyHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('mcp_api_keys')
      .select('id, account_id, user_id, account:accounts!inner(subscription_plan)')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (error || !data) return null;

    const plan = (data as any)?.account?.subscription_plan || 'starter';
    if (plan !== 'scale') {
      console.warn(`[mcp] Key validation failed: Account ${data.account_id} is on plan ${plan}, not scale.`);
      return null;
    }

    // Update last_used_at in the background (fire and forget)
    void admin
      .from('mcp_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    return {
      accountId: data.account_id,
      userId: data.user_id,
      keyId: data.id,
    };
  } catch (err) {
    console.error('[mcp] Authentication exception:', err);
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('key') || searchParams.get('token') || '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send the connection SSE event mapping to the POST client endpoint
      const postUrl = `/api/mcp?key=${encodeURIComponent(token)}`;
      controller.enqueue(encoder.encode(`event: endpoint\ndata: ${postUrl}\n\n`));
      
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (e) {
          clearInterval(interval);
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let id: any = null;
  try {
    const body = await request.json();
    id = body.id !== undefined ? body.id : null;
    const { jsonrpc, method, params } = body;

    if (jsonrpc !== '2.0') {
      return NextResponse.json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id,
      });
    }

    switch (method) {
      case 'initialize': {
        return NextResponse.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'abbla-mcp-server',
              version: '1.0.0',
            },
          },
          id,
        });
      }

      case 'notifications/initialized': {
        return new Response(null, { status: 204 });
      }

      case 'tools/list': {
        return NextResponse.json({
          jsonrpc: '2.0',
          result: {
            tools: [
              {
                name: 'list_contacts',
                description: 'List contacts in the CRM. Optional query parameter to filter contacts by name or phone.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search term for name or phone number' }
                  }
                }
              },
              {
                name: 'create_contact',
                description: 'Create a new contact in the CRM.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    full_name: { type: 'string', description: 'Contact full name' },
                    phone: { type: 'string', description: 'Phone number in international E.164 format (e.g. +5511999999999)' },
                    email: { type: 'string', description: 'Optional email address' }
                  },
                  required: ['full_name', 'phone']
                }
              },
              {
                name: 'list_tasks',
                description: "List tasks. Supports optional status filter ('pending', 'in_progress', 'completed').",
                inputSchema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Filter tasks by status' }
                  }
                }
              },
              {
                name: 'create_task',
                description: 'Create a new task in the CRM, optionally associated with a contact.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Task title' },
                    description: { type: 'string', description: 'Detailed task description' },
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
                    contact_phone: { type: 'string', description: 'Associated contact phone number (international format)' },
                    due_days: { type: 'integer', description: 'Days from now until the task is due' }
                  },
                  required: ['title']
                }
              },
              {
                name: 'send_whatsapp_message',
                description: 'Send a WhatsApp text message to a phone number using your configured WhatsApp Business account.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string', description: 'Recipient phone number in international format (e.g. +5511999999999)' },
                    message: { type: 'string', description: 'Text message content to send' }
                  },
                  required: ['phone', 'message']
                }
              },
              {
                name: 'list_pipelines',
                description: 'List active sales funnels, stages, and deals.',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                name: 'search_store_products',
                description: 'Search active products in the store catalog.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search term for product name or description' }
                  }
                }
              },
              {
                name: 'create_direct_charge',
                description: 'Generate a Pix payment charge for a specific product and send it directly to the customer.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string', description: 'Recipient phone number (international format, e.g. +5511999999999)' },
                    product_id: { type: 'string', description: 'UUID of the product to sell' },
                    variation_id: { type: 'string', description: 'Optional UUID of the specific product variation. Defaults to first variation if omitted.' }
                  },
                  required: ['phone', 'product_id']
                }
              }
            ],
          },
          id,
        });
      }

      case 'tools/call': {
        const { name, arguments: args } = params;
        const result = await handleToolCall(name, args, auth.accountId, auth.userId);
        return NextResponse.json({
          jsonrpc: '2.0',
          result,
          id,
        });
      }

      default: {
        return NextResponse.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        });
      }
    }
  } catch (err: any) {
    console.error('[mcp] Error processing request:', err);
    const message = err?.message?.includes('violates') || err?.message?.includes('column')
      ? 'Erro de banco de dados ao processar a requisição.'
      : (err?.message || 'Internal error');
    return NextResponse.json({
      jsonrpc: '2.0',
      error: { code: -32603, message },
      id,
    });
  }
}

export async function handleToolCall(name: string, args: any, accountId: string, userId?: string) {
  const admin = supabaseAdmin();

  // ponytail: strict & deterministic resolution of creatorUserId
  let creatorUserId: string | null = null;

  // 1. Validate if provided userId is an active member of this account
  if (userId) {
    const { data: validUser } = await admin
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .maybeSingle();

    if (validUser) {
      creatorUserId = validUser.user_id;
    }
  }

  // 2. Deterministic fallback: Account Owner (account_role = 'owner')
  if (!creatorUserId) {
    const { data: owner } = await admin
      .from('profiles')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('account_role', 'owner')
      .limit(1)
      .maybeSingle();

    if (owner) {
      creatorUserId = owner.user_id;
    }
  }

  // 3. Reject write operations if no valid deterministic author exists
  const isWriteTool = name === 'create_contact' || name === 'send_whatsapp_message' || name === 'create_direct_charge';
  if (!creatorUserId && isWriteTool) {
    throw new Error('Operação recusada: Não foi possível determinar o autor responsável pela integração MCP nesta conta.');
  }

  console.log(`[mcp] Tool: ${name} | Account: ${accountId} | CreatorUserId: ${creatorUserId || 'N/A'}`);

  switch (name) {
    case 'list_contacts': {
      const query = args?.query || '';
      // ponytail: data minimization — select only essential business fields
      let builder = admin
        .from('contacts')
        .select('id, name, phone, email, company, created_at, updated_at')
        .eq('account_id', accountId)
        .order('name', { ascending: true })
        .limit(50);

      if (query) {
        builder = builder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      }

      const { data, error } = await builder;
      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    case 'create_contact': {
      const { full_name, name: argName, phone, email } = args;
      const contactName = (full_name || argName || '').trim();
      if (!contactName) {
        throw new Error('Contact name is required.');
      }

      const sanitizedPhone = sanitizePhoneForMeta(phone);
      if (!isValidE164(sanitizedPhone)) {
        throw new Error('Invalid phone format. Please use international E.164 format (e.g. +5511999999999)');
      }

      const { data: existing } = await admin
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', sanitizedPhone)
        .maybeSingle();

      if (existing) {
        return {
          content: [
            {
              type: 'text',
              text: `Contact already exists with this phone number. ID: ${existing.id}`,
            },
          ],
        };
      }

      // ponytail: insert into column name and user_id (MCP API key owner or account member fallback)
      const { data, error } = await admin
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: creatorUserId,
          name: contactName,
          phone: sanitizedPhone,
          email: email?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: `Contact created successfully:\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    }

    case 'list_tasks': {
      const status = args?.status;
      let builder = admin
        .from('tasks')
        .select('*, contact:contacts(name, phone)')
        .eq('account_id', accountId)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(50);

      if (status) {
        builder = builder.eq('status', status);
      }

      const { data, error } = await builder;
      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    case 'create_task': {
      const { title, description, status, contact_phone, due_days } = args;

      let contactId: string | null = null;
      let conversationId: string | null = null;

      if (contact_phone) {
        const sanitizedPhone = sanitizePhoneForMeta(contact_phone);
        const { data: contact } = await admin
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .eq('phone', sanitizedPhone)
          .maybeSingle();

        if (contact) {
          contactId = contact.id;
          
          const { data: conv } = await admin
            .from('conversations')
            .select('id')
            .eq('account_id', accountId)
            .eq('contact_id', contactId)
            .maybeSingle();

          if (conv) {
            conversationId = conv.id;
          }
        }
      }

      let dueAt: string | null = null;
      if (due_days != null) {
        const d = new Date();
        d.setDate(d.getDate() + Number(due_days));
        dueAt = d.toISOString();
      }

      const { data, error } = await admin
        .from('tasks')
        .insert({
          account_id: accountId,
          title: title.trim(),
          description: description?.trim() || null,
          status: status || 'pending',
          contact_id: contactId,
          conversation_id: conversationId,
          due_at: dueAt,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: `Task created successfully:\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    }

    case 'send_whatsapp_message': {
      const { phone, message } = args;
      const sanitizedPhone = sanitizePhoneForMeta(phone);
      if (!isValidE164(sanitizedPhone)) {
        throw new Error('Invalid phone format. Please use international E.164 format (e.g. +5511999999999)');
      }

      const { data: config, error: configError } = await admin
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();

      if (configError || !config) {
        throw new Error('WhatsApp not configured for this account. Please connect your WhatsApp API settings first.');
      }

      const accessToken = decrypt(config.access_token);

      const { data: contact } = await admin
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', sanitizedPhone)
        .maybeSingle();

      let contactId: string;
      if (!contact) {
        const res = await admin
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: creatorUserId,
            name: `Lead (${phone})`,
            phone: sanitizedPhone,
          })
          .select('id')
          .single();
        if (res.error) throw res.error;
        contactId = res.data.id;
      } else {
        contactId = contact.id;
      }

      let { data: conv } = await admin
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle();

      if (!conv) {
        const res = await admin
          .from('conversations')
          .insert({
            account_id: accountId,
            contact_id: contactId,
            status: 'open',
          })
          .select('id')
          .single();
        if (res.error) throw res.error;
        conv = res.data;
      }

      const metaResponse = await sendTextMessage({
        accessToken,
        phoneNumberId: config.phone_number_id,
        to: sanitizedPhone,
        text: message,
      });

      const { data: insertedMsg, error: insertError } = await admin
        .from('messages')
        .insert({
          account_id: accountId,
          conversation_id: conv.id,
          message_type: 'text',
          sender_type: 'agent',
          content_text: message,
          message_id: metaResponse.messageId || null,
          status: 'sent',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await admin
        .from('conversations')
        .update({
          last_message_text: message,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conv.id);

      return {
        content: [
          {
            type: 'text',
            text: `WhatsApp message sent successfully. Message ID: ${insertedMsg.id}`,
          },
        ],
      };
    }

    case 'list_pipelines': {
      const { data: pipelines, error: pError } = await admin
        .from('pipelines')
        .select('id, name')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true });

      if (pError) throw pError;

      // ponytail: filter stages via pipeline_id as pipeline_stages doesn't have account_id
      const pIds = (pipelines || []).map((p) => p.id);
      const { data: stages, error: sError } = pIds.length > 0
        ? await admin
            .from('pipeline_stages')
            .select('id, name, pipeline_id, position')
            .in('pipeline_id', pIds)
            .order('position', { ascending: true })
        : { data: [], error: null };

      if (sError) throw sError;

      // ponytail: deals table uses title (not name) and created_at (not position)
      const { data: deals, error: dError } = await admin
        .from('deals')
        .select('id, title, stage_id, value, currency, contact_id')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (dError) throw dError;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ pipelines, stages, deals }, null, 2),
          },
        ],
      };
    }

    case 'search_store_products': {
      const query = args?.query || '';
      let builder = admin
        .from('products')
        .select('*, category:product_categories(name), variations:product_variations(*)')
        .eq('account_id', accountId)
        .eq('active', true);
      
      if (query) {
        builder = builder.ilike('name', `%${query}%`);
      }

      const { data, error } = await builder;
      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data || [], null, 2),
          },
        ],
      };
    }

    case 'create_direct_charge': {
      const { phone, product_id, variation_id } = args;
      const sanitizedPhone = sanitizePhoneForMeta(phone);
      if (!isValidE164(sanitizedPhone)) {
        throw new Error('Invalid phone format. Please use international E.164 format (e.g. +5511999999999)');
      }

      // 1. Fetch Woovi Config
      const { data: wooviConfig, error: configError } = await admin
        .from('woovi_config')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();

      if (configError || !wooviConfig || !wooviConfig.app_id) {
        throw new Error('Loja ou credenciais Woovi do tenant não configuradas.');
      }

      // Fetch markup rates from accounts (Super Admin)
      const { data: account } = await admin
        .from('accounts')
        .select('woovi_markup_fixed, woovi_markup_percent, woovi_markup_pix_key')
        .eq('id', accountId)
        .maybeSingle();

      // 2. Fetch Product and Variation
      const { data: product, error: prodError } = await admin
        .from('products')
        .select('*')
        .eq('id', product_id)
        .eq('active', true)
        .maybeSingle();

      if (prodError || !product) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const { data: variations, error: varError } = await admin
        .from('product_variations')
        .select('*')
        .eq('product_id', product_id);

      if (varError || !variations || variations.length === 0) {
        throw new Error('Nenhuma variação de preço disponível para este produto.');
      }

      const selectedVar = variation_id
        ? variations.find((v: any) => v.id === variation_id)
        : variations[0];

      if (!selectedVar) {
        throw new Error('Variação de produto especificada não encontrada.');
      }

      // 3. Find or Create Contact in CRM
      const suffix = sanitizedPhone.length >= 8 ? sanitizedPhone.slice(-8) : sanitizedPhone;
      let contactId: string | null = null;
      let contactName = 'Cliente';
      let contactEmail = 'cliente@email.com';

      const { data: contacts } = await admin
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .like('phone', `%${suffix}`);

      if (contacts && contacts.length > 0) {
        const matched = contacts.find((c) => {
          const cNorm = normalizePhone(c.phone || '');
          return cNorm.slice(-8) === sanitizedPhone.slice(-8);
        });
        if (matched) {
          contactId = matched.id;
          contactName = matched.name || 'Cliente';
          contactEmail = matched.email || 'cliente@email.com';
        }
      }

      if (!contactId) {
        const { data: newContact, error: insertError } = await admin
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: creatorUserId,
            phone: sanitizedPhone,
            name: `Cliente (${phone})`,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        contactId = newContact.id;
        contactName = newContact.name;
      }

      // 4. Create Order
      const totalAmount = Number(selectedVar.price);
      const { data: order, error: orderError } = await admin
        .from('orders')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          status: 'pending',
          shipping_amount: 0.00,
          items_amount: totalAmount,
          total_amount: totalAmount,
          customer_info: {
            name: contactName,
            phone: sanitizedPhone,
            email: contactEmail,
          },
        })
        .select()
        .single();

      if (orderError || !order) {
        throw new Error(`Falha ao criar o pedido: ${orderError?.message}`);
      }

      // Create Order Item
      const { error: itemError } = await admin
        .from('order_items')
        .insert({
          order_id: order.id,
          product_variation_id: selectedVar.id,
          quantity: 1,
          unit_price: totalAmount,
        });

      if (itemError) {
        await admin.from('orders').delete().eq('id', order.id);
        throw new Error(`Falha ao criar item de pedido: ${itemError.message}`);
      }

      // 5. Call Woovi API
      const isSandbox =
        wooviConfig.app_id.includes('sandbox') ||
        wooviConfig.app_id.startsWith('plugin_sb') ||
        process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost');

      const wooviClient = new WooviClient(wooviConfig.app_id, isSandbox);
      const valueCents = Math.round(totalAmount * 100);

      const markupFixed = account?.woovi_markup_fixed !== undefined && account?.woovi_markup_fixed !== null 
        ? Number(account.woovi_markup_fixed) 
        : 0.50;
      const markupPercent = account?.woovi_markup_percent !== undefined && account?.woovi_markup_percent !== null 
        ? Number(account.woovi_markup_percent) 
        : 1.00;
      const markupPixKey = account?.woovi_markup_pix_key || process.env.WOOVI_MASTER_PIX_KEY;

      const splits = [];
      if (markupPixKey) {
        const fixedCents = Math.round(markupFixed * 100);
        const percentCents = Math.round(valueCents * (markupPercent / 100));
        const splitValue = fixedCents + percentCents;

        // ponytail: Only split if the calculated markup is valid and strictly less than total value
        if (splitValue > 0 && splitValue < valueCents) {
          splits.push({
            pixKey: markupPixKey,
            value: splitValue,
          });
        }
      }

      const chargeResponse = await wooviClient.createCharge({
        correlationID: order.id,
        value: valueCents,
        customer: {
          name: contactName,
          email: contactEmail,
          phone: sanitizedPhone,
        },
        ...(splits.length > 0 ? { splits } : {}),
      });

      // Update Order with Woovi response
      const { data: updatedOrder, error: updateError } = await admin
        .from('orders')
        .update({
          woovi_correlation_id: chargeResponse.correlationID,
          woovi_qrcode_image: chargeResponse.charge.qrCodeImage,
          woovi_brcode: chargeResponse.charge.brCode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedOrder, null, 2),
          },
        ],
      };
    }

    default: {
      throw new Error(`Tool not found: ${name}`);
    }
  }
}
