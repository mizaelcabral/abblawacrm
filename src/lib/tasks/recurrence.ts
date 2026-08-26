import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Calculates the next due date based on the current due date and recurrence interval.
 */
export function calculateNextDueDate(currentDueDate: string | null, interval: string): string {
  const baseDate = currentDueDate ? new Date(currentDueDate) : new Date()
  const nextDate = new Date(baseDate)

  if (interval === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7)
  } else if (interval === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1)
  } else {
    // Default to monthly (+1 month)
    nextDate.setMonth(nextDate.getMonth() + 1)
  }

  return nextDate.toISOString()
}

/**
 * Spawns the next cycle task when a recurring task is completed.
 */
export async function spawnNextRecurrentTask(db: SupabaseClient, task: any) {
  if (!task || !task.is_recurring || !task.recurrence_interval || task.recurrence_interval === 'none') {
    return null
  }

  const nextDueAt = calculateNextDueDate(task.due_at, task.recurrence_interval)

  // Check if a pending task for the same contact and title already exists to prevent duplicate generation
  const { data: existing } = await db
    .from('tasks')
    .select('id')
    .eq('account_id', task.account_id)
    .eq('title', task.title)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    console.log(`[Recurrence] Task "${task.title}" already has a pending cycle (id: ${existing.id})`)
    return existing
  }

  const { data: newTask, error } = await db
    .from('tasks')
    .insert({
      account_id: task.account_id,
      contact_id: task.contact_id || null,
      conversation_id: task.conversation_id || null,
      deal_id: task.deal_id || null,
      assigned_agent_id: task.assigned_agent_id || null,
      title: task.title,
      description: task.description || null,
      status: 'pending',
      due_at: nextDueAt,
      is_ai_task: task.is_ai_task || false,
      ai_agent_type: task.ai_agent_type || null,
      execution_mode: task.execution_mode || null,
      billing_config: task.billing_config || null,
      is_recurring: true,
      recurrence_interval: task.recurrence_interval,
    })
    .select()
    .single()

  if (error) {
    console.error('[Recurrence Error] Failed to spawn next task:', error)
    return null
  }

  console.log(`[Recurrence] Spawned next cycle task for "${task.title}" due at ${nextDueAt}`)
  return newTask
}
