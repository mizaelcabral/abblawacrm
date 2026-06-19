import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/tasks?contact_id=...&status=...
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contactId = searchParams.get('contact_id')
  const status = searchParams.get('status')
  
  let query = supabase
    .from('tasks')
    .select('*, assigned_agent:profiles(full_name, avatar_url)')
  
  if (contactId) {
    query = query.eq('contact_id', contactId)
  }
  if (status) {
    query = query.eq('status', status)
  }
  
  const { data, error } = await query.order('due_at', { ascending: true, nullsFirst: false })
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

// POST /api/tasks
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  const accountId = profile?.account_id
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  if (!body.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      account_id: accountId,
      conversation_id: body.conversation_id || null,
      contact_id: body.contact_id || null,
      title: body.title,
      description: body.description || null,
      due_at: body.due_at || null,
      assigned_agent_id: body.assigned_agent_id || null,
      status: 'pending'
    })
    .select('*, assigned_agent:profiles(full_name, avatar_url)')
    .single()
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
