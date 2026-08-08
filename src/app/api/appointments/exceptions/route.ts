import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/appointments/exceptions - List exceptions for logged-in profile
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { data: exceptions, error } = await supabase
    .from('availability_exceptions')
    .select('*')
    .eq('profile_id', profile.id)
    .order('exception_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exceptions })
}

// POST /api/appointments/exceptions - Add or update a date exception
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body || !body.exception_date) {
    return NextResponse.json({ error: 'exception_date is required (YYYY-MM-DD)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('availability_exceptions')
    .upsert({
      profile_id: profile.id,
      exception_date: body.exception_date,
      reason: body.reason || null,
      is_blocked: body.is_blocked ?? true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'profile_id, exception_date' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exception: data[0] }, { status: 201 })
}

// DELETE /api/appointments/exceptions?id=...
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const exceptionId = searchParams.get('id')

  if (!exceptionId) return NextResponse.json({ error: 'id param is required' }, { status: 400 })

  const { error } = await supabase
    .from('availability_exceptions')
    .delete()
    .eq('id', exceptionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
