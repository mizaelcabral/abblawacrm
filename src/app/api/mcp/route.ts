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
                description: "List tasks. Supports optional status filter ('pending', 'in_progress', 'completed', 'review_required').",
                inputSchema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'review_required'], description: 'Filter tasks by status' }
                  }
                }
              },
              {
                name: 'create_task',
                description: 'Create a new task in the CRM, optionally associated with a contact or deal.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Task title' },
                    description: { type: 'string', description: 'Detailed task description' },
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'review_required'], default: 'pending' },
                    contact_phone: { type: 'string', description: 'Associated contact phone number (international format)' },
                    deal_id: { type: 'string', description: 'UUID of an associated deal/order' },
                    due_days: { type: 'integer', description: 'Days from now until the task is due' }
                  },
                  required: ['title']
                }
              },
              {
                name: 'update_task',
                description: 'Update an existing task in the CRM (change status, title, description, due date, deal, or assigned agent).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string', description: 'UUID of the task to update' },
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'review_required'], description: 'New status for the task' },
                    title: { type: 'string', description: 'Updated task title' },
                    description: { type: 'string', description: 'Updated detailed description' },
                    due_days: { type: 'integer', description: 'Reschedule task due date (days from now)' },
                    due_at: { type: 'string', description: 'Reschedule task due date in ISO 8601 format' },
                    deal_id: { type: 'string', description: 'UUID of an associated deal/order (or null to unbind)' },
                    assigned_agent_id: { type: 'string', description: 'UUID of the assigned agent profile' }
                  },
                  required: ['task_id']
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
                name: 'create_pipeline',
                description: 'Create a new sales pipeline with custom or default stages.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Pipeline name (e.g. Vendas B2B, Atendimento RDC 660)' },
                    stages: { type: 'array', items: { type: 'string' }, description: 'Optional list of initial stage names in sequence order' }
                  },
                  required: ['name']
                }
              },
              {
                name: 'create_pipeline_stage',
                description: 'Add a new stage to an existing sales pipeline.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    pipeline_id: { type: 'string', description: 'UUID of the target pipeline' },
                    name: { type: 'string', description: 'Stage name' },
                    color: { type: 'string', description: 'Hex color code (e.g. #3b82f6)' },
                    position: { type: 'integer', description: 'Optional numerical sequence position' }
                  },
                  required: ['pipeline_id', 'name']
                }
              },
              {
                name: 'create_deal',
                description: 'Create a new deal inside a pipeline and stage.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    pipeline_id: { type: 'string', description: 'UUID of the target pipeline' },
                    stage_id: { type: 'string', description: 'UUID of the target stage' },
                    title: { type: 'string', description: 'Deal title or lead name' },
                    value: { type: 'number', description: 'Monetary value of the deal' },
                    contact_phone: { type: 'string', description: 'Associated contact phone number (international format)' },
                    assigned_to: { type: 'string', description: 'UUID of assigned agent profile' },
                    notes: { type: 'string', description: 'Additional deal notes' },
                    expected_close_date: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' }
                  },
                  required: ['pipeline_id', 'stage_id', 'title']
                }
              },
              {
                name: 'update_deal',
                description: 'Update deal details (title, value, status, notes, assigned agent, expected close date).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deal_id: { type: 'string', description: 'UUID of the deal to update' },
                    title: { type: 'string', description: 'Updated title' },
                    value: { type: 'number', description: 'Updated monetary value' },
                    status: { type: 'string', enum: ['open', 'won', 'lost'], description: 'Deal status' },
                    notes: { type: 'string', description: 'Updated notes' },
                    assigned_to: { type: 'string', description: 'UUID of assigned agent profile' },
                    expected_close_date: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' }
                  },
                  required: ['deal_id']
                }
              },
              {
                name: 'move_deal',
                description: 'Move a deal to a new stage within the pipeline and log movement history.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deal_id: { type: 'string', description: 'UUID of the deal to move' },
                    stage_id: { type: 'string', description: 'UUID of the destination stage' }
                  },
                  required: ['deal_id', 'stage_id']
                }
              },
              {
                name: 'list_deal_history',
                description: 'List stage movement timeline and time-in-stage history for a deal.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deal_id: { type: 'string', description: 'UUID of the deal' }
                  },
                  required: ['deal_id']
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
              },
              {
                name: 'create_document_metadata',
                description: 'Registra metadados de um novo documento no CRM (sem upload de binário).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    display_name: { type: 'string', description: 'Nome de exibição do documento' },
                    document_type: { type: 'string', description: 'Tipo do documento (ex: receita_medica, laudo, comprovante)' },
                    contact_id: { type: 'string', description: 'UUID do contato associado' },
                    deal_id: { type: 'string', description: 'UUID do negócio associado' },
                    valid_until: { type: 'string', description: 'Data limite de validade (ISO8601)' },
                    notes: { type: 'string', description: 'Observações do documento' }
                  },
                  required: ['display_name', 'document_type']
                }
              },
              {
                name: 'update_document_metadata',
                description: 'Atualiza o status ou metadados de um documento existente.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'UUID do documento' },
                    status: { type: 'string', enum: ['solicitado', 'recebido', 'em_analise', 'aprovado', 'recusado', 'vencido'], description: 'Novo status' },
                    rejection_reason: { type: 'string', description: 'Motivo da recusa (obrigatório se status=recusado)' },
                    valid_until: { type: 'string', description: 'Data limite de validade (ISO8601)' },
                    display_name: { type: 'string', description: 'Nome de exibição do documento' }
                  },
                  required: ['id']
                }
              },
              {
                name: 'list_document_metadata',
                description: 'Lista os metadados dos documentos da conta. Não expõe dados binários ou URLs públicas.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    contact_id: { type: 'string', description: 'Filtrar por UUID do contato' },
                    deal_id: { type: 'string', description: 'Filtrar por UUID do negócio' },
                    document_type: { type: 'string', description: 'Filtrar por tipo de documento' },
                    status: { type: 'string', enum: ['solicitado', 'recebido', 'em_analise', 'aprovado', 'recusado', 'vencido'] }
                  }
                }
              },
              {
                name: 'create_checklist_item',
                description: 'Cria um novo item de checklist de requisitos para um Negócio (Deal).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deal_id: { type: 'string', description: 'UUID do negócio' },
                    title: { type: 'string', description: 'Título/Requisito do checklist' },
                    requirement_type: { type: 'string', description: 'Tipo do requisito (ex: receita_medica, laudo)' },
                    is_required: { type: 'boolean', default: true },
                    due_date: { type: 'string', description: 'Data limite do requisito (ISO8601)' },
                    assigned_user_id: { type: 'string', description: 'UUID do usuário responsável' },
                    notes: { type: 'string', description: 'Observações adicionais' }
                  },
                  required: ['deal_id', 'title', 'requirement_type']
                }
              },
              {
                name: 'update_checklist_item',
                description: 'Atualiza o status, observaçoes ou vincula um documento a um item de checklist.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'UUID do item de checklist' },
                    status: { type: 'string', enum: ['pending', 'in_review', 'approved', 'rejected', 'waived'] },
                    document_id: { type: 'string', description: 'UUID do documento a vincular' },
                    notes: { type: 'string', description: 'Observações ou justificativa' },
                    due_date: { type: 'string', description: 'Data limite do requisito (ISO8601)' }
                  },
                  required: ['id']
                }
              },
              {
                name: 'list_checklist_items',
                description: 'Lista os itens de checklist da conta com filtros opcionais por negócio (deal_id) e status.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deal_id: { type: 'string', description: 'Filtrar por UUID do negócio' },
                    status: { type: 'string', enum: ['pending', 'in_review', 'approved', 'rejected', 'waived'], description: 'Filtrar por status' }
                  }
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
    const raw = String(err?.message || err?.details || err?.hint || '');
    const isDbError =
      raw.includes('violates') ||
      raw.includes('column') ||
      raw.includes('relation') ||
      raw.includes('table') ||
      raw.includes('does not exist') ||
      raw.includes('syntax error') ||
      raw.includes('PGRST') ||
      raw.includes('PostgREST');

    const message = isDbError
      ? 'Erro interno de banco de dados ao processar a requisição.'
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
  const isWriteTool =
    name === 'create_contact' ||
    name === 'send_whatsapp_message' ||
    name === 'create_direct_charge' ||
    name === 'create_document_metadata' ||
    name === 'update_document_metadata' ||
    name === 'create_checklist_item' ||
    name === 'update_checklist_item';
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
      // ponytail: data minimization — select essential task fields & minimal relations (contact, deal, agent)
      let builder = admin
        .from('tasks')
        .select('id, title, description, status, due_at, completed_at, created_at, updated_at, contact:contacts(name, phone), deal:deals(id, title), assigned_agent:profiles!assigned_agent_id(full_name, email)')
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
      const { title, description, status, contact_phone, deal_id, due_days } = args;

      let contactId: string | null = null;
      let conversationId: string | null = null;
      let targetDealId: string | null = null;

      if (deal_id) {
        const { data: deal } = await admin
          .from('deals')
          .select('id, contact_id')
          .eq('id', deal_id)
          .eq('account_id', accountId)
          .maybeSingle();

        if (!deal) {
          throw new Error('Deal not found or access denied.');
        }
        targetDealId = deal.id;
        if (deal.contact_id) {
          contactId = deal.contact_id;
        }
      }

      if (contact_phone) {
        const sanitizedPhone = sanitizePhoneForMeta(contact_phone);
        const { data: contact } = await admin
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .eq('phone', sanitizedPhone)
          .maybeSingle();

        if (contact) {
          if (contactId && contactId !== contact.id) {
            throw new Error('Specified deal does not belong to the contact associated with contact_phone.');
          }
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

      const initialStatus = status || 'pending';
      const completedAt = initialStatus === 'completed' ? new Date().toISOString() : null;

      // ponytail: insert task and select minimized fields
      const { data: insertedTask, error } = await admin
        .from('tasks')
        .insert({
          account_id: accountId,
          title: title.trim(),
          description: description?.trim() || null,
          status: initialStatus,
          contact_id: contactId,
          deal_id: targetDealId,
          conversation_id: conversationId,
          due_at: dueAt,
          completed_at: completedAt,
        })
        .select('id, title, description, status, due_at, completed_at, created_at, updated_at, contact:contacts(name, phone), deal:deals(id, title), assigned_agent:profiles!assigned_agent_id(full_name, email)')
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: `Task created successfully:\n${JSON.stringify(insertedTask, null, 2)}`,
          },
        ],
      };
    }

    case 'update_task': {
      const { task_id, status, title, description, due_days, due_at, deal_id, assigned_agent_id } = args;

      if (!task_id) {
        throw new Error('task_id is required.');
      }

      // Verify task exists and belongs to this account
      const { data: existingTask, error: fetchErr } = await admin
        .from('tasks')
        .select('id, contact_id')
        .eq('id', task_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (fetchErr || !existingTask) {
        throw new Error('Task not found or access denied.');
      }

      const updates: Record<string, any> = {};

      if (status) {
        if (!['pending', 'in_progress', 'completed', 'review_required'].includes(status)) {
          throw new Error('Invalid status. Allowed values: pending, in_progress, completed, review_required.');
        }
        updates.status = status;
        if (status === 'completed') {
          updates.completed_at = new Date().toISOString();
        } else {
          updates.completed_at = null;
        }
      }

      if (title !== undefined) {
        if (!title.trim()) throw new Error('Title cannot be empty.');
        updates.title = title.trim();
      }

      if (description !== undefined) {
        updates.description = description?.trim() || null;
      }

      if (due_days !== undefined) {
        const d = new Date();
        d.setDate(d.getDate() + Number(due_days));
        updates.due_at = d.toISOString();
      } else if (due_at !== undefined) {
        updates.due_at = due_at ? new Date(due_at).toISOString() : null;
      }

      if (deal_id !== undefined) {
        if (deal_id) {
          const { data: validDeal } = await admin
            .from('deals')
            .select('id, contact_id')
            .eq('id', deal_id)
            .eq('account_id', accountId)
            .maybeSingle();

          if (!validDeal) {
            throw new Error('Deal not found or access denied.');
          }
          if (existingTask.contact_id && validDeal.contact_id && existingTask.contact_id !== validDeal.contact_id) {
            throw new Error('Specified deal does not belong to the task contact.');
          }
          updates.deal_id = validDeal.id;
        } else {
          updates.deal_id = null;
        }
      }

      if (assigned_agent_id !== undefined) {
        if (assigned_agent_id) {
          const { data: validAgent } = await admin
            .from('profiles')
            .select('user_id')
            .eq('account_id', accountId)
            .eq('user_id', assigned_agent_id)
            .maybeSingle();

          if (!validAgent) {
            throw new Error('Assigned agent does not belong to this account.');
          }
          updates.assigned_agent_id = assigned_agent_id;
        } else {
          updates.assigned_agent_id = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        throw new Error('No valid fields provided for update.');
      }

      // ponytail: update task filtered by account_id and select minimized fields
      const { data: updatedTask, error: updateError } = await admin
        .from('tasks')
        .update(updates)
        .eq('id', task_id)
        .eq('account_id', accountId)
        .select('id, title, description, status, due_at, completed_at, updated_at, contact:contacts(name, phone), deal:deals(id, title), assigned_agent:profiles!assigned_agent_id(full_name, email)')
        .single();

      if (updateError) throw updateError;

      return {
        content: [
          {
            type: 'text',
            text: `Task updated successfully:\n${JSON.stringify(updatedTask, null, 2)}`,
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

    case 'create_pipeline': {
      const { name, stages: customStages } = args;
      if (!name?.trim()) throw new Error('Pipeline name is required.');

      // ponytail: insert pipeline filtered by account_id and select minimized fields
      const { data: pipeline, error: pErr } = await admin
        .from('pipelines')
        .insert({
          account_id: accountId,
          user_id: creatorUserId,
          name: name.trim(),
        })
        .select('id, name, created_at')
        .single();

      if (pErr) throw pErr;

      const stageNames = Array.isArray(customStages) && customStages.length > 0
        ? customStages
        : ['Novo Lead', 'Qualificado', 'Proposta Enviada', 'Negociação', 'Ganho'];

      const stageRows = stageNames.map((sName: string, idx: number) => ({
        pipeline_id: pipeline.id,
        name: String(sName).trim(),
        position: idx,
        color: ['#3b82f6', '#eab308', '#f97316', '#8b5cf6', '#22c55e'][idx % 5] || '#3b82f6',
      }));

      const { data: stages, error: sErr } = await admin
        .from('pipeline_stages')
        .insert(stageRows)
        .select('id, name, position, color')
        .order('position', { ascending: true });

      if (sErr) throw sErr;

      return {
        content: [
          {
            type: 'text',
            text: `Pipeline created successfully:\n${JSON.stringify({ ...pipeline, stages }, null, 2)}`,
          },
        ],
      };
    }

    case 'create_pipeline_stage': {
      const { pipeline_id, name, color, position } = args;
      if (!pipeline_id || !name?.trim()) throw new Error('pipeline_id and name are required.');

      // Verify pipeline belongs to account
      const { data: pipeline } = await admin
        .from('pipelines')
        .select('id')
        .eq('id', pipeline_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!pipeline) throw new Error('Pipeline not found or access denied.');

      let pos = position;
      if (pos == null) {
        const { data: existingStages } = await admin
          .from('pipeline_stages')
          .select('position')
          .eq('pipeline_id', pipeline_id)
          .order('position', { ascending: false })
          .limit(1);
        pos = existingStages && existingStages.length > 0 ? existingStages[0].position + 1 : 0;
      }

      const { data: stage, error: stgErr } = await admin
        .from('pipeline_stages')
        .insert({
          pipeline_id,
          name: name.trim(),
          color: color || '#3b82f6',
          position: pos,
        })
        .select('id, pipeline_id, name, color, position, created_at')
        .single();

      if (stgErr) throw stgErr;

      return {
        content: [
          {
            type: 'text',
            text: `Pipeline stage created successfully:\n${JSON.stringify(stage, null, 2)}`,
          },
        ],
      };
    }

    case 'create_deal': {
      const { pipeline_id, stage_id, title, value, contact_phone, assigned_to, notes, expected_close_date } = args;
      if (!pipeline_id || !stage_id || !title?.trim()) {
        throw new Error('pipeline_id, stage_id, and title are required.');
      }

      // Verify pipeline belongs to account
      const { data: pipeline } = await admin
        .from('pipelines')
        .select('id')
        .eq('id', pipeline_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!pipeline) throw new Error('Pipeline not found or access denied.');

      // Verify stage belongs to pipeline
      const { data: stage } = await admin
        .from('pipeline_stages')
        .select('id')
        .eq('id', stage_id)
        .eq('pipeline_id', pipeline_id)
        .maybeSingle();

      if (!stage) throw new Error('Stage not found in specified pipeline.');

      let contactId: string | null = null;
      if (contact_phone) {
        const sanitizedPhone = sanitizePhoneForMeta(contact_phone);
        const { data: contact } = await admin
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .eq('phone', sanitizedPhone)
          .maybeSingle();
        if (contact) contactId = contact.id;
      }

      if (assigned_to) {
        const { data: agent } = await admin
          .from('profiles')
          .select('user_id')
          .eq('account_id', accountId)
          .eq('user_id', assigned_to)
          .maybeSingle();
        if (!agent) throw new Error('Assigned agent does not belong to this account.');
      }

      // ponytail: fetch account default_currency with BRL fallback
      const { data: acc } = await admin
        .from('accounts')
        .select('default_currency')
        .eq('id', accountId)
        .maybeSingle();

      const accountCurrency = acc?.default_currency || 'BRL';

      // ponytail: insert deal with account default currency and select minimized fields
      const { data: deal, error: dErr } = await admin
        .from('deals')
        .insert({
          account_id: accountId,
          user_id: creatorUserId,
          pipeline_id,
          stage_id,
          title: title.trim(),
          value: value != null ? Number(value) : 0,
          currency: accountCurrency,
          contact_id: contactId,
          assigned_to: assigned_to || null,
          notes: notes?.trim() || null,
          expected_close_date: expected_close_date || null,
          status: 'open',
        })
        .select('id, title, value, currency, status, pipeline_id, stage_id, expected_close_date, notes, created_at, updated_at')
        .single();

      if (dErr) throw dErr;

      // Log initial stage entry in history
      await admin.from('deal_stage_history').insert({
        account_id: accountId,
        deal_id: deal.id,
        from_stage_id: null,
        to_stage_id: stage_id,
        user_id: creatorUserId,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Deal created successfully:\n${JSON.stringify(deal, null, 2)}`,
          },
        ],
      };
    }

    case 'update_deal': {
      const { deal_id, title, value, status, notes, assigned_to, expected_close_date } = args;
      if (!deal_id) throw new Error('deal_id is required.');

      const { data: existingDeal } = await admin
        .from('deals')
        .select('id')
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!existingDeal) throw new Error('Deal not found or access denied.');

      const updates: Record<string, any> = {};
      if (title !== undefined) {
        if (!title.trim()) throw new Error('Title cannot be empty.');
        updates.title = title.trim();
      }
      if (value !== undefined) updates.value = Number(value);
      if (status !== undefined) {
        if (!['open', 'won', 'lost'].includes(status)) throw new Error('Invalid status. Allowed: open, won, lost.');
        updates.status = status;
      }
      if (notes !== undefined) updates.notes = notes?.trim() || null;
      if (expected_close_date !== undefined) updates.expected_close_date = expected_close_date || null;

      if (assigned_to !== undefined) {
        if (assigned_to) {
          const { data: agent } = await admin
            .from('profiles')
            .select('user_id')
            .eq('account_id', accountId)
            .eq('user_id', assigned_to)
            .maybeSingle();
          if (!agent) throw new Error('Assigned agent does not belong to this account.');
          updates.assigned_to = assigned_to;
        } else {
          updates.assigned_to = null;
        }
      }

      if (Object.keys(updates).length === 0) throw new Error('No valid fields provided for update.');

      const { data: updatedDeal, error: uErr } = await admin
        .from('deals')
        .update(updates)
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .select('id, title, value, currency, status, pipeline_id, stage_id, expected_close_date, notes, created_at, updated_at')
        .single();

      if (uErr) throw uErr;

      return {
        content: [
          {
            type: 'text',
            text: `Deal updated successfully:\n${JSON.stringify(updatedDeal, null, 2)}`,
          },
        ],
      };
    }

    case 'move_deal': {
      const { deal_id, stage_id } = args;
      if (!deal_id || !stage_id) throw new Error('deal_id and stage_id are required.');

      const { data: existingDeal } = await admin
        .from('deals')
        .select('id, pipeline_id, stage_id')
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!existingDeal) throw new Error('Deal not found or access denied.');

      // ponytail: prevent redundant move if deal is already in requested stage
      if (existingDeal.stage_id === stage_id) {
        return {
          content: [
            {
              type: 'text',
              text: 'Deal is already in this stage. No changes were made.',
            },
          ],
        };
      }

      // Verify destination stage belongs to the same pipeline
      const { data: targetStage } = await admin
        .from('pipeline_stages')
        .select('id')
        .eq('id', stage_id)
        .eq('pipeline_id', existingDeal.pipeline_id)
        .maybeSingle();

      if (!targetStage) throw new Error('Target stage does not belong to the deal pipeline.');

      const oldStageId = existingDeal.stage_id;

      // ponytail: atomic update with neq(stage_id) for concurrency safety
      const { data: movedDeal, error: mErr } = await admin
        .from('deals')
        .update({ stage_id, updated_at: new Date().toISOString() })
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .neq('stage_id', stage_id)
        .select('id, title, value, currency, status, pipeline_id, stage_id, expected_close_date, notes, created_at, updated_at')
        .maybeSingle();

      if (mErr) throw mErr;
      if (!movedDeal) {
        return {
          content: [
            {
              type: 'text',
              text: 'Deal is already in this stage. No changes were made.',
            },
          ],
        };
      }

      // ponytail: log stage movement history
      await admin.from('deal_stage_history').insert({
        account_id: accountId,
        deal_id,
        from_stage_id: oldStageId,
        to_stage_id: stage_id,
        user_id: creatorUserId,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Deal moved successfully:\n${JSON.stringify(movedDeal, null, 2)}`,
          },
        ],
      };
    }

    case 'list_deal_history': {
      const { deal_id } = args;
      if (!deal_id) throw new Error('deal_id is required.');

      const { data: existingDeal } = await admin
        .from('deals')
        .select('id, title')
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!existingDeal) throw new Error('Deal not found or access denied.');

      const { data: history, error: hErr } = await admin
        .from('deal_stage_history')
        .select('id, from_stage:pipeline_stages!from_stage_id(name), to_stage:pipeline_stages!to_stage_id(name), user:profiles!user_id(full_name), entered_at')
        .eq('deal_id', deal_id)
        .eq('account_id', accountId)
        .order('entered_at', { ascending: true });

      if (hErr) throw hErr;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ deal: existingDeal, history }, null, 2),
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

    case 'create_document_metadata': {
      const { display_name, document_type, contact_id, deal_id, valid_until } = args;

      if (contact_id) {
        const { data: contact } = await admin
          .from('contacts')
          .select('id')
          .eq('id', contact_id)
          .eq('account_id', accountId)
          .maybeSingle();
        if (!contact) throw new Error('Contato especificado não pertence a esta conta.');
      }

      if (deal_id) {
        const { data: deal } = await admin
          .from('deals')
          .select('id')
          .eq('id', deal_id)
          .eq('account_id', accountId)
          .maybeSingle();
        if (!deal) throw new Error('Negócio especificado não pertence a esta conta.');
      }

      const { data: doc, error } = await admin
        .from('documents')
        .insert({
          account_id: accountId,
          display_name,
          document_type,
          contact_id: contact_id || null,
          deal_id: deal_id || null,
          valid_until: valid_until || null,
          status: 'solicitado',
          version: 1,
          uploaded_by_user_id: creatorUserId,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(doc, null, 2),
          },
        ],
      };
    }

    case 'update_document_metadata': {
      const { id: docId, status, rejection_reason, valid_until, display_name } = args;

      const { data: existingDoc } = await admin
        .from('documents')
        .select('id, status')
        .eq('id', docId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!existingDoc) throw new Error('Documento não encontrado ou não pertence a esta conta.');

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (display_name) updateData.display_name = display_name;
      if (valid_until !== undefined) updateData.valid_until = valid_until;

      if (status) {
        if (status === 'recusado') {
          if (!rejection_reason || rejection_reason.trim().length < 5) {
            throw new Error('Recusa exige um motivo (rejection_reason) detalhado com pelo menos 5 caracteres.');
          }
          updateData.rejection_reason = rejection_reason.trim();
        }

        if (status === 'aprovado' || status === 'recusado') {
          // ponytail: reviewer identity is strictly derived from MCP session user, not client input
          updateData.reviewed_by_user_id = creatorUserId;
          updateData.reviewed_at = new Date().toISOString();
        }

        updateData.status = status;
      }

      const { data: updatedDoc, error } = await admin
        .from('documents')
        .update(updateData)
        .eq('id', docId)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedDoc, null, 2),
          },
        ],
      };
    }

    case 'list_document_metadata': {
      const { contact_id, deal_id, document_type, status } = args;

      // ponytail: data minimization — select only essential document metadata fields, no raw file paths
      let query = admin
        .from('documents')
        .select('id, account_id, contact_id, deal_id, document_type, display_name, status, received_at, valid_until, rejection_reason, version, current_version_id, uploaded_by_user_id, reviewed_by_user_id, reviewed_at, created_at, updated_at')
        .eq('account_id', accountId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (contact_id) query = query.eq('contact_id', contact_id);
      if (deal_id) query = query.eq('deal_id', deal_id);
      if (document_type) query = query.eq('document_type', document_type);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
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

    case 'create_checklist_item': {
      const { deal_id, title, requirement_type, is_required, due_date, assigned_user_id, notes } = args;

      const { data: deal } = await admin
        .from('deals')
        .select('id, contact_id')
        .eq('id', deal_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!deal) throw new Error('Negócio especificado não pertence a esta conta.');

      if (assigned_user_id) {
        const { data: assignedProfile } = await admin
          .from('profiles')
          .select('user_id')
          .eq('user_id', assigned_user_id)
          .eq('account_id', accountId)
          .maybeSingle();
        if (!assignedProfile) throw new Error('Usuário responsável especificado não pertence a esta conta.');
      }

      const { data: checklistItem, error } = await admin
        .from('checklist_items')
        .insert({
          account_id: accountId,
          deal_id,
          contact_id: deal.contact_id || null,
          title,
          requirement_type,
          is_required: is_required !== undefined ? is_required : true,
          due_date: due_date || null,
          assigned_user_id: assigned_user_id || null,
          notes: notes || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(checklistItem, null, 2),
          },
        ],
      };
    }

    case 'update_checklist_item': {
      const { id: itemId, status, document_id, notes, due_date } = args;

      const { data: existingItem } = await admin
        .from('checklist_items')
        .select('id')
        .eq('id', itemId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!existingItem) throw new Error('Item de checklist não encontrado ou não pertence a esta conta.');

      if (document_id) {
        const { data: doc } = await admin
          .from('documents')
          .select('id')
          .eq('id', document_id)
          .eq('account_id', accountId)
          .maybeSingle();
        if (!doc) throw new Error('Documento especificado não pertence a esta conta.');
      }

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (status) updateData.status = status;
      if (document_id !== undefined) updateData.document_id = document_id;
      if (notes !== undefined) updateData.notes = notes;
      if (due_date !== undefined) updateData.due_date = due_date;

      const { data: updatedItem, error } = await admin
        .from('checklist_items')
        .update(updateData)
        .eq('id', itemId)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedItem, null, 2),
          },
        ],
      };
    }

    case 'list_checklist_items': {
      const { deal_id, status } = args;

      let query = admin
        .from('checklist_items')
        .select('id, account_id, deal_id, contact_id, title, requirement_type, is_required, status, due_date, assigned_user_id, document_id, notes, created_at, updated_at')
        .eq('account_id', accountId)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });

      if (deal_id) query = query.eq('deal_id', deal_id);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
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

    default: {
      throw new Error(`Tool not found: ${name}`);
    }
  }
}
