import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/services
export async function GET() {
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
    return NextResponse.json({ error: 'No account linked to your profile' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

// POST /api/services
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
    return NextResponse.json({ error: 'No account linked to your profile' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  if (!body.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('services')
    .insert({
      account_id: accountId,
      name: body.name,
      description: body.description || null,
      duration_minutes: body.duration_minutes || 30,
      price: body.price || 0.00,
      is_active: body.is_active !== undefined ? body.is_active : true,
      payment_required: body.payment_required !== undefined ? body.payment_required : false,
      location_type: body.location_type || 'online',
      online_meeting_url: body.online_meeting_url || null,
      physical_address: body.physical_address || null,
      buffer_minutes: body.buffer_minutes || 0,
      provider_name: body.provider_name || null,
      provider_avatar_url: body.provider_avatar_url || null,
      show_provider_avatar: body.show_provider_avatar !== undefined ? body.show_provider_avatar : false,
      clinic_name: body.clinic_name || null,
      clinic_logo_url: body.clinic_logo_url || null,
      show_clinic_logo: body.show_clinic_logo !== undefined ? body.show_clinic_logo : false,
      custom_questions: body.custom_questions || []
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// PUT /api/services
export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || !body.id) return NextResponse.json({ error: 'Service ID is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('services')
    .update({
      name: body.name,
      description: body.description,
      duration_minutes: body.duration_minutes,
      price: body.price,
      is_active: body.is_active,
      payment_required: body.payment_required,
      location_type: body.location_type || 'online',
      online_meeting_url: body.online_meeting_url || null,
      physical_address: body.physical_address || null,
      buffer_minutes: body.buffer_minutes || 0,
      provider_name: body.provider_name || null,
      provider_avatar_url: body.provider_avatar_url || null,
      show_provider_avatar: body.show_provider_avatar !== undefined ? body.show_provider_avatar : false,
      clinic_name: body.clinic_name || null,
      clinic_logo_url: body.clinic_logo_url || null,
      show_clinic_logo: body.show_clinic_logo !== undefined ? body.show_clinic_logo : false,
      custom_questions: body.custom_questions || []
    })
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
