import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/appointments/status?id=...
// Public route to poll payment status of a pending appointment
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Missing appointment ID' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('appointments')
    .select('status, service:services(name), start_time')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  const serviceObj = data.service as any
  const serviceName = Array.isArray(serviceObj) ? serviceObj[0]?.name : serviceObj?.name

  return NextResponse.json({
    status: data.status,
    serviceName,
    startTime: data.start_time
  })
}
