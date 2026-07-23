import { handleToolCall } from '@/app/api/mcp/route'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'


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
  contact?: {
    full_name: string
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
        description: 'Update an existing task in the CRM (change status, title, description, due date, or assigned agent).',
        parameters: {
          type: 'OBJECT',
          properties: {
            task_id: { type: 'STRING', description: 'UUID of the task to update' },
            status: { type: 'STRING', description: 'New status for the task (pending, in_progress, completed, review_required)' },
            title: { type: 'STRING', description: 'Updated task title' },
            description: { type: 'STRING', description: 'Updated detailed description' },
            due_days: { type: 'INTEGER', description: 'Reschedule task due date (days from now)' },
            due_at: { type: 'STRING', description: 'Reschedule task due date in ISO 8601 format' },
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
        description: 'Generate a Pix payment charge for a specific product and send it directly to the customer in the WhatsApp chat.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'Recipient phone number (international format, e.g. +5511999999999)' },
            product_id: { type: 'STRING', description: 'UUID of the product to sell' },
            variation_id: { type: 'STRING', description: 'Optional UUID of the specific product variation.' }
          },
          required: ['phone', 'product_id']
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
    .select('*, contact:contacts(full_name, phone)')
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

      // Save the draft and request review
      await db.from('tasks').update({
        status: 'review_required',
        ai_draft: resultText
      }).eq('id', task.id)

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
  const contactName = task.contact?.full_name || 'Desconhecido'
  const contactPhone = task.contact?.phone || 'Não informado'
  
  return `
Nova tarefa atribuída a você:
- Título da tarefa: "${task.title}"
- Descrição da tarefa: "${task.description || 'Sem descrição.'}"
- ID da Conversação: ${task.conversation_id || 'Nenhuma conversação vinculada.'}
- Contato Associado: Name: "${contactName}", Phone: "${contactPhone}"

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

  const systemInstruction = `
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

