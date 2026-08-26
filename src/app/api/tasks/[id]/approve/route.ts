import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

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
    .select('*, contact:contacts(full_name, name, phone)')
    .eq('id', taskId)
    .single()

  if (fetchErr || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
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

  // If task is a billing task or has an ai_draft with contact phone, attempt to dispatch WhatsApp message if draft contains text
  let messageSent = false
  const customerPhone = normalizePhone(task.contact?.phone || '')

  if (task.ai_draft && customerPhone) {
    try {
      const { data: waConfig } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', task.account_id)
        .maybeSingle()

      if (waConfig && waConfig.access_token && waConfig.phone_number_id) {
        const accessToken = decrypt(waConfig.access_token)
        // Clean draft message if it contains Markdown/agent markers for clean customer delivery
        const cleanMessage = task.ai_draft.replace(/^\[.*?\]\s*/, '').trim()

        if (cleanMessage) {
          await sendTextMessage({
            phoneNumberId: waConfig.phone_number_id,
            accessToken,
            to: customerPhone,
            text: cleanMessage,
          })
          messageSent = true
        }
      }
    } catch (waErr) {
      console.error(`[Task Approve] Error sending WhatsApp message for task ${task.id}:`, waErr)
    }
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

  return NextResponse.json({
    success: true,
    messageSent,
    task: updatedTask,
  })
}
