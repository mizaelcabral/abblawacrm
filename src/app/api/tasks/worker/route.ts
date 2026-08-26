import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executePendingAITasks } from '@/lib/ai/task-worker'

/**
 * Endpoint to trigger background execution of pending AI tasks.
 * Authorized via `x-cron-secret` header or an active user session.
 */
export async function POST(request: Request) {
  return handleRequest(request)
}

export async function GET(request: Request) {
  return handleRequest(request)
}

async function handleRequest(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  const supplied = request.headers.get('x-cron-secret')
  let authorized = Boolean(expected && supplied === expected)

  if (!authorized) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await executePendingAITasks()
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[Tasks API Worker] Failed to run AI task worker:', err)
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
