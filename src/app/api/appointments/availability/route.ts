import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse, addMinutes, format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns'

// GET /api/appointments/availability?profile_id=...&date=YYYY-MM-DD&service_id=...
export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const profileId = searchParams.get('profile_id')
  const dateStr = searchParams.get('date') // YYYY-MM-DD
  const serviceId = searchParams.get('service_id')

  if (!profileId || !dateStr || !serviceId) {
    return NextResponse.json({ error: 'profile_id, date, and service_id are required' }, { status: 400 })
  }

  // Get service duration
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('duration_minutes')
    .eq('id', serviceId)
    .single()

  if (serviceError || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const duration = service.duration_minutes

  // Calculate day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const date = parse(dateStr, 'yyyy-MM-dd', new Date())
  const dayOfWeek = date.getDay()

  // Fetch staff availability for this day of the week
  const { data: availability, error: availError } = await supabase
    .from('service_availability')
    .select('*')
    .eq('profile_id', profileId)
    .eq('day_of_week', dayOfWeek)

  if (availError) {
    return NextResponse.json({ error: availError.message }, { status: 500 })
  }

  // Fetch existing appointments on this date
  const startOfSelectedDay = startOfDay(date).toISOString()
  const endOfSelectedDay = endOfDay(date).toISOString()

  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select('start_time, end_time')
    .eq('profile_id', profileId)
    .eq('status', 'confirmed')
    .gte('start_time', startOfSelectedDay)
    .lte('start_time', endOfSelectedDay)

  if (apptError) {
    return NextResponse.json({ error: apptError.message }, { status: 500 })
  }

  const availableSlots: string[] = []

  // Generate slots for each availability window
  for (const window of availability ?? []) {
    const startTimeStr = window.start_time // HH:MM:SS
    const endTimeStr = window.end_time // HH:MM:SS

    const startTime = parse(startTimeStr, 'HH:mm:ss', date)
    const endTime = parse(endTimeStr, 'HH:mm:ss', date)

    let currentSlot = startTime
    while (addMinutes(currentSlot, duration) <= endTime) {
      const slotStart = currentSlot
      const slotEnd = addMinutes(currentSlot, duration)

      // Check if slot overlaps with any existing appointment
      const hasOverlap = (appointments ?? []).some(appt => {
        const apptStart = parseISO(appt.start_time)
        const apptEnd = parseISO(appt.end_time)

        // Overlap logic: (StartA < EndB) and (EndA > StartB)
        return slotStart < apptEnd && slotEnd > apptStart
      })

      if (!hasOverlap) {
        availableSlots.push(format(currentSlot, 'HH:mm'))
      }

      currentSlot = addMinutes(currentSlot, 30) // Slots start every 30 minutes
    }
  }

  return NextResponse.json({ slots: availableSlots })
}

// POST /api/appointments/availability - Manage user's availability
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, account_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.availability)) {
    return NextResponse.json({ error: 'Invalid JSON body. Expected availability array.' }, { status: 400 })
  }

  // Delete current availability configuration
  await supabase
    .from('service_availability')
    .delete()
    .eq('profile_id', profile.id)

  // Insert new availability configurations
  const recordsToInsert = body.availability.map((item: any) => ({
    account_id: profile.account_id,
    profile_id: profile.id,
    day_of_week: item.day_of_week,
    start_time: item.start_time,
    end_time: item.end_time
  }))

  const { data, error } = await supabase
    .from('service_availability')
    .insert(recordsToInsert)
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
