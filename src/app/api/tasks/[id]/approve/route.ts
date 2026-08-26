import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'
import { spawnNextRecurrentTask } from '@/lib/tasks/recurrence'

// POST /api/tasks/[id]/approve
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  if (!taskId) return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })

  const db = supabaseAdmin()

  // Fetch task with account verification
  const { data: task, error: fetchErr } = await db
    .from('tasks')
    .select('*, contact:contacts(id, name, phone)')
    .eq('id', taskId)
    .single()

  if (fetchErr || !task) {
    console.error(`[Task Approve Error] Failed to fetch task ${taskId}:`, fetchErr)
    return NextResponse.json({ error: fetchErr?.message || 'Task not found' }, { status: 404 })
  }

  // Verify that user profile belongs to task's account
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.account_id !== task.account_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let messageSent = false
  let sendError: string | null = null
  const rawPhone = task.contact?.phone || ''
  const sanitizedPhone = sanitizePhoneForMeta(rawPhone)

  const cleanMessage = task.ai_draft ? task.ai_draft.replace(/^\[.*?\]\s*/, '').trim() : ''

  if (cleanMessage && sanitizedPhone) {
    // 1. Try WhatsApp Web Config (Evolution API) first
    const { data: webConfig } = await db
      .from('whatsapp_web_config')
      .select('*')
      .eq('account_id', task.account_id)
      .eq('is_active', true)
      .maybeSingle()

    if (webConfig) {
      try {
        const token = decrypt(webConfig.api_token)
        const res = await fetch(`${webConfig.api_url}/message/sendText/${webConfig.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: token,
          },
          body: JSON.stringify({
            number: sanitizedPhone,
            text: cleanMessage,
          }),
        })

        if (res.ok) {
          messageSent = true
        } else {
          const errText = await res.text()
          sendError = `Evolution API error: ${errText}`
        }
      } catch (err: any) {
        console.error('[Task Approve] WhatsApp Web send error:', err)
        sendError = err.message || 'Error connecting to WhatsApp Web'
      }
    }

    // 2. Fallback to Official Meta API if not sent via Web
    if (!messageSent) {
      const { data: waConfig } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', task.account_id)
        .maybeSingle()

      if (waConfig && waConfig.access_token && waConfig.phone_number_id) {
        try {
          const accessToken = decrypt(waConfig.access_token)
          await sendTextMessage({
            phoneNumberId: waConfig.phone_number_id,
            accessToken,
            to: sanitizedPhone,
            text: cleanMessage,
          })
          messageSent = true
        } catch (metaErr: any) {
          console.error('[Task Approve] Meta WhatsApp send error:', metaErr)
          sendError = metaErr.message || 'Error sending via Meta API'
        }
      } else if (!webConfig) {
        sendError = 'Nenhuma conexão do WhatsApp (Web ou Meta) foi configurada nesta conta.'
      }
    }

    // 3. If message was sent and contact exists, log message to chat history
    if (messageSent && task.contact?.id) {
      try {
        let conversationId = task.conversation_id
        if (!conversationId) {
          const { data: existingConv } = await db
            .from('conversations')
            .select('id')
            .eq('account_id', task.account_id)
            .eq('contact_id', task.contact.id)
            .limit(1)
            .maybeSingle()

          if (existingConv) {
            conversationId = existingConv.id
          } else {
            const { data: newConv } = await db
              .from('conversations')
              .insert({
                account_id: task.account_id,
                contact_id: task.contact.id,
                channel: 'whatsapp',
                status: 'open',
                last_message_text: cleanMessage,
                last_message_at: new Date().toISOString(),
              })
              .select('id')
              .single()
            if (newConv) conversationId = newConv.id
          }
        }

        if (conversationId) {
          await db.from('messages').insert({
            conversation_id: conversationId,
            sender_type: 'agent',
            content_type: 'text',
            content_text: cleanMessage,
            status: 'sent',
            channel: 'whatsapp',
          })
          await db.from('conversations').update({
            last_message_text: cleanMessage,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', conversationId)
        }
      } catch (logErr) {
        console.error('[Task Approve] Failed to log sent message in conversation history:', logErr)
      }
    }
  } else if (!cleanMessage) {
    sendError = 'A tarefa não possui rascunho de mensagem para envio.'
  } else if (!sanitizedPhone) {
    sendError = 'O contato associado não possui número de telefone válido.'
  }

  // Update task status to completed
  const { data: updatedTask, error: updateErr } = await db
    .from('tasks')
    .update({
      status: 'completed',
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select('*, assigned_agent:profiles(full_name), contact:contacts(name, phone)')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Spawn next recurrent task if configured
  try {
    await spawnNextRecurrentTask(db, updatedTask)
  } catch (recErr) {
    console.error('[Task Approve Recurrence Error]:', recErr)
  }

  return NextResponse.json({
    success: true,
    messageSent,
    sendError,
    task: updatedTask,
  })
}
