import { handleToolCall } from '@/app/api/mcp/route'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { normalizePhone, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'
import { spawnNextRecurrentTask } from '@/lib/tasks/recurrence'


interface GeminiMessagePart {
  text?: string
  functionCall?: {
    name: string
    args: Record<string, unknown>
  }
  functionResponse?: {
    name: string
    response: Record<string, unknown>
  }
}

interface GeminiMessage {
  role: 'user' | 'model' | 'function'
  parts: GeminiMessagePart[]
}

interface AITask {
  id: string
  title: string
  description?: string | null
  conversation_id?: string | null
  status: string
  account_id: string
  is_ai_task?: boolean
  ai_agent_type?: 'billing' | 'followup' | 'onboarding' | 'general' | null
  execution_mode?: 'approval' | 'autonomous' | null
  billing_config?: {
    product_id?: string
    amount?: number
    tone?: string
    send_pix?: boolean
    notes?: string
  } | null
  contact?: {
    id?: string
    name: string
    phone: string
  } | null
}

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'list_contacts',
        description: 'List contacts in the CRM. Optional query parameter to filter contacts by name or phone.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Search term for name or phone number' }
          }
        }
      },
      {
        name: 'create_contact',
        description: 'Create a new contact in the CRM.',
        parameters: {
          type: 'OBJECT',
          properties: {
            full_name: { type: 'STRING', description: 'Contact full name' },
            phone: { type: 'STRING', description: 'Phone number in international E.164 format (e.g. +5511999999999)' },
            email: { type: 'STRING', description: 'Optional email address' }
          },
          required: ['full_name', 'phone']
        }
      },
      {
        name: 'create_task',
        description: 'Create a new task in the CRM, optionally associated with a contact or deal.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Task title' },
            description: { type: 'STRING', description: 'Detailed task description' },
            status: { type: 'STRING', description: 'Task status (pending, in_progress, completed, review_required)' },
            contact_phone: { type: 'STRING', description: 'Associated contact phone number' },
            deal_id: { type: 'STRING', description: 'UUID of an associated deal/order' },
            due_days: { type: 'INTEGER', description: 'Days from now until the task is due' }
          },
          required: ['title']
        }
      },
      {
        name: 'list_tasks',
        description: "List tasks. Supports optional status filter ('pending', 'in_progress', 'completed', 'review_required').",
        parameters: {
          type: 'OBJECT',
          properties: {
            status: { type: 'STRING', description: 'Filter tasks by status (pending, in_progress, completed, review_required)' }
          }
        }
      },
      {
        name: 'update_task',
        description: 'Update an existing task in the CRM (change status, title, description, due date, deal, or assigned agent).',
        parameters: {
          type: 'OBJECT',
          properties: {
            task_id: { type: 'STRING', description: 'UUID of the task to update' },
            status: { type: 'STRING', description: 'New status for the task (pending, in_progress, completed, review_required)' },
            title: { type: 'STRING', description: 'Updated task title' },
            description: { type: 'STRING', description: 'Updated detailed description' },
            due_days: { type: 'INTEGER', description: 'Reschedule task due date (days from now)' },
            due_at: { type: 'STRING', description: 'Reschedule task due date in ISO 8601 format' },
            deal_id: { type: 'STRING', description: 'UUID of an associated deal/order (or null to unbind)' },
            assigned_agent_id: { type: 'STRING', description: 'UUID of the assigned agent profile' }
          },
          required: ['task_id']
        }
      },
      {
        name: 'send_whatsapp_message',
        description: 'Send a WhatsApp text message to a phone number using your configured WhatsApp Business account.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'Recipient phone number in international format (e.g. +5511999999999)' },
            message: { type: 'STRING', description: 'Text message content to send' }
          },
          required: ['phone', 'message']
        }
      },
      {
        name: 'list_pipelines',
        description: 'List active sales funnels, stages, and deals.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'create_pipeline',
        description: 'Create a new sales pipeline with custom or default stages.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Pipeline name' },
            stages: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Optional initial stage names in order' }
          },
          required: ['name']
        }
      },
      {
        name: 'create_pipeline_stage',
        description: 'Add a new stage to an existing sales pipeline.',
        parameters: {
          type: 'OBJECT',
          properties: {
            pipeline_id: { type: 'STRING', description: 'UUID of the target pipeline' },
            name: { type: 'STRING', description: 'Stage name' },
            color: { type: 'STRING', description: 'Hex color code' },
            position: { type: 'INTEGER', description: 'Optional numerical position' }
          },
          required: ['pipeline_id', 'name']
        }
      },
      {
        name: 'create_deal',
        description: 'Create a new deal inside a pipeline and stage.',
        parameters: {
          type: 'OBJECT',
          properties: {
            pipeline_id: { type: 'STRING', description: 'UUID of the target pipeline' },
            stage_id: { type: 'STRING', description: 'UUID of the target stage' },
            title: { type: 'STRING', description: 'Deal title or lead name' },
            value: { type: 'NUMBER', description: 'Monetary value of the deal' },
            contact_phone: { type: 'STRING', description: 'Associated contact phone number' },
            assigned_to: { type: 'STRING', description: 'UUID of assigned agent profile' },
            notes: { type: 'STRING', description: 'Additional deal notes' },
            expected_close_date: { type: 'STRING', description: 'Expected close date (YYYY-MM-DD)' }
          },
          required: ['pipeline_id', 'stage_id', 'title']
        }
      },
      {
        name: 'update_deal',
        description: 'Update deal details (title, value, status, notes, assigned agent, expected close date).',
        parameters: {
          type: 'OBJECT',
          properties: {
            deal_id: { type: 'STRING', description: 'UUID of the deal to update' },
            title: { type: 'STRING', description: 'Updated title' },
            value: { type: 'NUMBER', description: 'Updated monetary value' },
            status: { type: 'STRING', description: 'Deal status (open, won, lost)' },
            notes: { type: 'STRING', description: 'Updated notes' },
            assigned_to: { type: 'STRING', description: 'UUID of assigned agent profile' },
            expected_close_date: { type: 'STRING', description: 'Expected close date (YYYY-MM-DD)' }
          },
          required: ['deal_id']
        }
      },
      {
        name: 'move_deal',
        description: 'Move a deal to a new stage within the pipeline and log movement history.',
        parameters: {
          type: 'OBJECT',
          properties: {
            deal_id: { type: 'STRING', description: 'UUID of the deal to move' },
            stage_id: { type: 'STRING', description: 'UUID of the destination stage' }
          },
          required: ['deal_id', 'stage_id']
        }
      },
      {
        name: 'list_deal_history',
        description: 'List stage movement timeline and time-in-stage history for a deal.',
        parameters: {
          type: 'OBJECT',
          properties: {
            deal_id: { type: 'STRING', description: 'UUID of the deal' }
          },
          required: ['deal_id']
        }
      },
      {
        name: 'search_store_products',
        description: 'Search active products in the store catalog. Optional query parameter to filter by name or description.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Filter products by keyword in name or description' }
          }
        }
      },
      {
        name: 'create_direct_charge',
        description: 'Generate a Pix payment charge for a specific product or custom debt amount and send it directly to the customer in the WhatsApp chat.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'Recipient phone number (international format, e.g. +5511999999999)' },
            amount: { type: 'NUMBER', description: 'Monetary debit amount in BRL (e.g. 150.00)' },
            product_id: { type: 'STRING', description: 'Optional UUID of the product to sell' },
            variation_id: { type: 'STRING', description: 'Optional UUID of the specific product variation.' }
          },
          required: ['phone']
        }
      }
    ]
  }
]

export async function executePendingAITasks(): Promise<{ processed: number; errors: number }> {
  const db = supabaseAdmin()
  
  // Executar varredura de lembretes de recompra
  try {
    await sendRepurchaseReminders()
  } catch (cronErr) {
    console.error('[AI Task Worker] Erro na varredura de lembretes de recompra:', cronErr)
  }

  // 1. Fetch pending tasks flagged as AI tasks
  const { data: tasks, error } = await db
    .from('tasks')
    .select('*, contact:contacts(id, name, phone)')
    .eq('is_ai_task', true)
    .eq('status', 'pending')
    .limit(10) // process in batches of 10

  if (error) {
    console.error('[AI Task Worker] Failed to fetch pending tasks:', error)
    return { processed: 0, errors: 1 }
  }

  if (!tasks || tasks.length === 0) {
    return { processed: 0, errors: 0 }
  }

  let processedCount = 0
  let errorCount = 0

  for (const task of tasks) {
    try {
      // Transition status to in_progress first to lock it
      await db.from('tasks').update({ status: 'in_progress' }).eq('id', task.id)

      const resultText = await runTaskAgent(task)

      // Check execution mode: if autonomous, complete directly; if approval, set review_required
      const isAutonomous = task.execution_mode === 'autonomous'
      const newStatus = isAutonomous ? 'completed' : 'review_required'

      await db.from('tasks').update({
        status: newStatus,
        ai_draft: resultText,
        executed_at: isAutonomous ? new Date().toISOString() : null
      }).eq('id', task.id)

      if (isAutonomous) {
        try {
          await spawnNextRecurrentTask(db, { ...task, status: 'completed' })
        } catch (recErr) {
          console.error('[AI Task Worker Recurrence Error]:', recErr)
        }
      }

      processedCount++
    } catch (err) {
      console.error(`[AI Task Worker] Error processing task ${task.id}:`, err)
      errorCount++
      // Reset status to pending so it can be retried
      await db.from('tasks').update({ status: 'pending' }).eq('id', task.id)
    }
  }

  return { processed: processedCount, errors: errorCount }
}

function getTaskPrompt(task: AITask): string {
  const contactName = task.contact?.name || 'Desconhecido'
  const contactPhone = task.contact?.phone || 'Não informado'
  const agentType = task.ai_agent_type || 'general'
  const executionMode = task.execution_mode || 'approval'
  const billingConfig = task.billing_config || {}

  if (agentType === 'billing') {
    return `
TAREFA DE COBRANÇA VIA WHATSAPP (Agente de Cobrança AGI):
- Título: "${task.title}"
- Descrição/Instrução: "${task.description || 'Enviar cobrança para o cliente.'}"
- Modo de Execução: ${executionMode === 'autonomous' ? 'AUTÔNOMO (Você DEVE enviar a mensagem de cobrança diretamente no WhatsApp do cliente agora chamando create_direct_charge ou send_whatsapp_message!)' : 'RASCUNHO / APROVAÇÃO HUMANA (Gere a mensagem proposta no seu texto final, mas NÃO chame ferramentas de envio)'}
- Contato do Cliente: Nome: "${contactName}", Telefone: "${contactPhone}"
- Configurações de Cobrança:
  * ID do Produto: "${billingConfig.product_id || 'Não especificado'}"
  * Valor do Débito: "${billingConfig.amount ? `R$ ${billingConfig.amount}` : 'Consultar produto/negócio'}"
  * Tom de Voz: "${billingConfig.tone || 'Amigável, cortês e profissional'}"
  * Gerar Pix Nativo: ${billingConfig.send_pix !== false ? 'Sim' : 'Não'}
  * Observações: "${billingConfig.notes || 'Nenhuma'}"

IMPORTANTE: Se o modo for AUTÔNOMO, chame IMEDIATAMENTE a ferramenta 'create_direct_charge' informando 'phone: "${contactPhone}"' e 'amount: ${billingConfig.amount || 0}' para gerar a cobrança Pix nativa e enviar a chave Pix copia e cola diretamente no WhatsApp do cliente e registrar no Inbox do CRM!
`
  }

  return `
Nova tarefa atribuída a você (${agentType.toUpperCase()} AGENT):
- Título da tarefa: "${task.title}"
- Descrição da tarefa: "${task.description || 'Sem descrição.'}"
- Modo de Execução: ${executionMode}
- ID da Conversação: ${task.conversation_id || 'Nenhuma conversação vinculada.'}
- Contato Associado: Nome: "${contactName}", Telefone: "${contactPhone}"

Por favor, execute as ações necessárias para completar ou preparar esta tarefa. Se precisar de mais informações, faça buscas de contatos ou pipelines. Se precisar interagir com o cliente, utilize send_whatsapp_message.
`
}

async function runTaskAgent(task: AITask): Promise<string> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined')
  }

  const history: GeminiMessage[] = [
    {
      role: 'user',
      parts: [{ text: getTaskPrompt(task) }]
    }
  ]

  const maxTurns = 6
  let turn = 0
  let finalResponseText = ''

  const isBilling = task.ai_agent_type === 'billing'

  const systemInstruction = isBilling
    ? `
Você é o Agente Especializado em Cobranças Inteligentes da plataforma ABBLAWA (CRM Gravity).
Seu objetivo é gerenciar e realizar cobranças via WhatsApp de forma cortês, altamente profissional e alinhada com as melhores práticas de recuperação e atendimento ao cliente.

Instruções específicas para Cobrança:
- Mantenha sempre um tom de respeito, clareza e empatia.
- Se o modo for "autonomous", você DEVE obrigatoriamente chamar a ferramenta "create_direct_charge" informando "phone" e o valor do débito ("amount") para emitir a cobrança Pix nativa Woovi e enviar no WhatsApp do cliente.
- Se o modo for "approval" ou faltar telefone do cliente, NÃO envie diretamente; estruture o texto completo da cobrança com saudações, valor, forma de pagamento e chave Pix no seu relatório final para aprovação do atendente humano.
- Sempre relate detalhadamente o resultado: mensagem gerada, status do envio, produto cobrado e próximos passos sugeridos.
`
    : `
Você é o Agente Executor de Tarefas da plataforma Gravity (CRM).
Seu objetivo é analisar e realizar a tarefa descrita pelo usuário/atendente, utilizando as ferramentas disponíveis.

Instruções importantes:
- Utilize as ferramentas de listagem e criação de contatos para verificar se um cliente já existe antes de interagir ou criar um novo.
- Ao enviar mensagens de WhatsApp, utilize a ferramenta "send_whatsapp_message".
- Sempre que realizar uma ação, explique claramente o que foi feito no seu relatório final.
- Quando terminar de realizar todas as ações necessárias para concluir a tarefa, dê sua resposta final explicando o que foi feito.
- Nunca alucine dados. Se faltarem informações essenciais (como telefone do cliente ou nome), relate na resposta final para o humano decidir o que fazer.
- Você opera no modo "Rascunho / Proposta de Ação" se a ação exigir aprovação, mas pode realizar leituras (listagens) livremente.
`

  while (turn < maxTurns) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: history,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          tools: GEMINI_TOOLS
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini task execution failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const candidate = data.candidates?.[0]
    const content = candidate?.content
    
    if (!content) {
      throw new Error('Empty content from Gemini during task execution')
    }

    // Append model response to history
    history.push({
      role: 'model',
      parts: content.parts
    })

    const functionCall = content.parts?.[0]?.functionCall
    const textResponse = content.parts?.[0]?.text

    if (functionCall) {
      // Execute function
      console.log(`[AI Task Agent] Executing tool: ${functionCall.name} with args:`, functionCall.args)
      let toolResult: Record<string, unknown>
      try {
        const result = await handleToolCall(functionCall.name, functionCall.args, task.account_id)
        // Extract the text content from tool response
        const textResult = result?.content?.[0]?.text || JSON.stringify(result)
        toolResult = { status: 'success', data: textResult }
      } catch (err: unknown) {
        console.error(`[AI Task Agent] Tool execution error for ${functionCall.name}:`, err)
        const message = err instanceof Error ? err.message : String(err)
        toolResult = { status: 'error', message }
      }

      // Append function response to history
      history.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: functionCall.name,
              response: toolResult
            }
          }
        ]
      })
    } else if (textResponse) {
      finalResponseText = textResponse
      break
    } else {
      break
    }

    turn++
  }

  return finalResponseText || 'A tarefa foi analisada, mas nenhuma resposta de texto foi gerada.'
}

/**
 * Varre todos os pedidos pagos buscando itens com repurchase_reminder_at atingido,
 * e envia lembrete automático no WhatsApp.
 */
export async function sendRepurchaseReminders(): Promise<{ sent: number; errors: number }> {
  const db = supabaseAdmin()
  let sentCount = 0
  let errorCount = 0

  try {
    const { data: orders, error } = await db
      .from('orders')
      .select(`
        *,
        order_items(
          *,
          variation:product_variations(
            *,
            product:products(*)
          )
        )
      `)
      .eq('status', 'paid')
      .eq('repurchase_reminder_sent', false)
      .lte('repurchase_reminder_at', new Date().toISOString());

    if (error) {
      console.error('[Repurchase Scheduler] Failed to fetch reminders:', error)
      return { sent: 0, errors: 1 }
    }

    if (!orders || orders.length === 0) {
      return { sent: 0, errors: 0 }
    }

    for (const order of orders as any[]) {
      try {
        const accountId = order.account_id
        const customerPhone = normalizePhone(order.customer_info?.phone || '')

        if (!customerPhone) {
          await db.from('orders').update({ repurchase_reminder_sent: true }).eq('id', order.id)
          continue
        }

        const { data: waConfig } = await db
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', accountId)
          .maybeSingle()

        if (waConfig && waConfig.access_token && waConfig.phone_number_id) {
          const accessToken = decrypt(waConfig.access_token)
          const customerName = order.customer_info?.name || 'Cliente'

          const itemNames = order.order_items
            .map((item: any) => item.variation?.product?.name)
            .filter((name: string) => !!name)
            .join(', ')

          const messageText = `Olá, *${customerName}*! Tudo bem?\n\nFaz algum tempo desde sua última compra de *${itemNames || 'nossos produtos'}*.\nQue tal repor seu estoque ou renovar seus serviços conosco?\n\nPara fazer um novo pedido, visite nossa vitrine online:\n👉 https://${process.env.NEXT_PUBLIC_APP_URL || 'abbla.chat'}/shop/${accountId}`

          await sendTextMessage({
            phoneNumberId: waConfig.phone_number_id,
            accessToken,
            to: customerPhone,
            text: messageText,
          })

          sentCount++
        }

        await db
          .from('orders')
          .update({ repurchase_reminder_sent: true, updated_at: new Date().toISOString() })
          .eq('id', order.id)

      } catch (err) {
        console.error(`[Repurchase Scheduler] Failed to process order ${order.id}:`, err)
        errorCount++
      }
    }

  } catch (err) {
    console.error('[Repurchase Scheduler] Error during run:', err)
    errorCount++
  }

  return { sent: sentCount, errors: errorCount }
}

