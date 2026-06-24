import { NextResponse } from 'next/server'
import { executePendingAITasks } from '@/lib/ai/task-worker'

/**
 * Endpoint to trigger background execution of pending AI tasks.
 * Requires a shared secret via the `x-cron-secret` header to match
 * `AUTOMATION_CRON_SECRET`.
 */
export async function POST(request: Request) {
  return handleRequest(request)
}

export async function GET(request: Request) {
  return handleRequest(request)
}

async function handleRequest(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret')
  if (supplied !== expected) {
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
