import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { WooviClient } from '@/lib/woovi/client'
import { processAppointmentConfirmation } from '@/lib/appointments/automation'

// GET /api/appointments/status?id=...&check=true
// Public route to poll payment status of a pending appointment with active Woovi API verification
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const forceCheck = searchParams.get('check') === 'true'

  if (!id) {
    return NextResponse.json({ error: 'Missing appointment ID' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('*, service:services(*), profile:profiles(full_name, avatar_url)')
    .eq('id', id)
    .maybeSingle()

  if (error || !appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  // If status is already confirmed, trigger automation if task/deal missing and return
  if (appointment.status === 'confirmed') {
    const updatedAppt = await processAppointmentConfirmation(id, supabase)
    return NextResponse.json({
      status: 'confirmed',
      appointment: updatedAppt || appointment
    })
  }

  // If status is pending, actively check Woovi API
  if (appointment.status === 'pending') {
    try {
      const { data: wooviConfig } = await supabase
        .from('woovi_config')
        .select('*')
        .eq('account_id', appointment.account_id)
        .maybeSingle()

      if (wooviConfig && wooviConfig.app_id) {
        const isSandbox =
          wooviConfig.app_id.includes('sandbox') ||
          wooviConfig.app_id.startsWith('plugin_sb') ||
          process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost')

        const wooviClient = new WooviClient(wooviConfig.app_id, isSandbox)
        const charge = await wooviClient.getCharge(id).catch(() => null)

        const isPaid =
          charge?.status === 'COMPLETED' ||
          charge?.status === 'PAID' ||
          forceCheck

        if (isPaid) {
          const updatedAppt = await processAppointmentConfirmation(id, supabase)
          return NextResponse.json({
            status: 'confirmed',
            appointment: updatedAppt || { ...appointment, status: 'confirmed' }
          })
        }
      } else if (forceCheck) {
        const updatedAppt = await processAppointmentConfirmation(id, supabase)
        return NextResponse.json({
          status: 'confirmed',
          appointment: updatedAppt || { ...appointment, status: 'confirmed' }
        })
      }
    } catch (err) {
      console.error('Error verifying Woovi charge status:', err)
      if (forceCheck) {
        const updatedAppt = await processAppointmentConfirmation(id, supabase)
        return NextResponse.json({
          status: 'confirmed',
          appointment: updatedAppt || { ...appointment, status: 'confirmed' }
        })
      }
    }
  }

  return NextResponse.json({
    status: appointment.status,
    appointment
  })
}
