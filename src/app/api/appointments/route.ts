import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseISO, addMinutes } from 'date-fns'

// GET /api/appointments - List appointments for the logged-in user's account
export async function GET(request: Request) {
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
    .from('appointments')
    .select('*, service:services(name, duration_minutes), profile:profiles(full_name, avatar_url), contact:contacts(name, phone, email)')
    .eq('account_id', accountId)
    .order('start_time', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

// POST /api/appointments - Book an appointment (Can be public or admin-created)
export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { service_id, profile_id, start_time, notes, client } = body
  if (!service_id || !profile_id || !start_time || !client?.name || !client?.phone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Retrieve account_id from the profile
  const { data: staffProfile, error: profileError } = await supabase
    .from('profiles')
    .select('account_id, user_id')
    .eq('id', profile_id)
    .single()

  if (profileError || !staffProfile) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  const accountId = staffProfile.account_id

  // Retrieve service duration
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('duration_minutes')
    .eq('id', service_id)
    .single()

  if (serviceError || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const duration = service.duration_minutes
  const startTime = parseISO(start_time)
  const endTime = addMinutes(startTime, duration)

  // 1. Find or create contact
  // Check if contact already exists by phone under this user/account
  let contactId = null
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', client.phone)
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
  } else {
    // Create new contact
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: staffProfile.user_id, // Assign to the staff member's user_id
        name: client.name,
        phone: client.phone,
        email: client.email || null
      })
      .select('id')
      .single()

    if (contactError) {
      return NextResponse.json({ error: `Failed to create contact: ${contactError.message}` }, { status: 500 })
    }
    contactId = newContact.id
  }

  // 2. Double-check overlap just before booking (concurrency protection)
  const { data: overlaps } = await supabase
    .from('appointments')
    .select('id')
    .eq('profile_id', profile_id)
    .eq('status', 'confirmed')
    .lt('start_time', endTime.toISOString())
    .gt('end_time', startTime.toISOString())

  if (overlaps && overlaps.length > 0) {
    return NextResponse.json({ error: 'This slot was already booked by someone else.' }, { status: 409 })
  }

  // 3. Insert appointment
  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .insert({
      account_id: accountId,
      service_id,
      profile_id,
      contact_id: contactId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: 'confirmed',
      notes: notes || null
    })
    .select('*, service:services(name), profile:profiles(full_name), contact:contacts(name)')
    .single()

  if (apptError) {
    return NextResponse.json({ error: apptError.message }, { status: 500 })
  }

  return NextResponse.json(appointment, { status: 201 })
}

// PUT /api/appointments - Cancel or modify appointment status (for admin/client)
export async function PUT(request: Request) {
  const supabase = await createClient()
  const body = await request.json().catch(() => null)
  if (!body || !body.id || !body.status) {
    return NextResponse.json({ error: 'Appointment ID and status are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({ status: body.status })
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
