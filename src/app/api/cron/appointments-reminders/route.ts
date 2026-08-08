import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { addMinutes, addHours, format, parseISO } from 'date-fns'

// GET /api/cron/appointments-reminders
// Triggered periodically (e.g., every 15 minutes) to dispatch 24h and 1h WhatsApp reminders
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized CRON secret' }, { status: 401 })
  }

  const supabase = supabaseAdmin()
  const now = new Date()

  // 1. Fetch 24-hour reminders: appointments start between (now + 23h30m) and (now + 24h30m)
  const window24hStart = addMinutes(addHours(now, 24), -30).toISOString()
  const window24hEnd = addMinutes(addHours(now, 24), 30).toISOString()

  const { data: appts24h, error: err24h } = await supabase
    .from('appointments')
    .select('*, service:services(name), contact:contacts(name, phone), profile:profiles(full_name)')
    .eq('status', 'confirmed')
    .eq('reminder_24h_sent', false)
    .gte('start_time', window24hStart)
    .lte('start_time', window24hEnd)

  const sent24h: string[] = []

  for (const appt of appts24h || []) {
    if (!appt.contact?.phone) continue
    const dateFormatted = format(parseISO(appt.start_time), 'dd/MM/yyyy às HH:mm')
    const serviceName = appt.service?.name || 'Consulta'

    let message = `Olá, ${appt.contact.name}! Lembramos da sua consulta de *${serviceName}* agendada para amanhã, *${dateFormatted}*.`

    if (appt.meeting_url) {
      message += `\n\nLink da sala online: ${appt.meeting_url}`
    } else if (appt.location_address) {
      message += `\n\nEndereço do atendimento: ${appt.location_address}`
    }

    message += `\n\nPor favor, confirme sua presença respondendo com *SIM* ou informe se precisa reagendar.`

    // Try sending via WhatsApp API / Evolution API if configured
    try {
      const { data: waConfig } = await supabase
        .from('whatsapp_configs')
        .select('*')
        .eq('account_id', appt.account_id)
        .eq('status', 'connected')
        .maybeSingle()

      if (waConfig && waConfig.instance_name && process.env.EVOLUTION_API_URL) {
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${waConfig.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EVOLUTION_API_KEY || ''
          },
          body: JSON.stringify({
            number: appt.contact.phone,
            text: message
          })
        })
      }
    } catch (sendErr) {
      console.error('Failed to send 24h WhatsApp reminder:', sendErr)
    }

    // Mark 24h reminder as sent
    await supabase
      .from('appointments')
      .update({ reminder_24h_sent: true })
      .eq('id', appt.id)

    sent24h.push(appt.id)
  }

  // 2. Fetch 1-hour reminders: appointments start between (now + 30m) and (now + 1h30m)
  const window1hStart = addMinutes(now, 30).toISOString()
  const window1hEnd = addMinutes(now, 90).toISOString()

  const { data: appts1h, error: err1h } = await supabase
    .from('appointments')
    .select('*, service:services(name), contact:contacts(name, phone), profile:profiles(full_name)')
    .eq('status', 'confirmed')
    .eq('reminder_1h_sent', false)
    .gte('start_time', window1hStart)
    .lte('start_time', window1hEnd)

  const sent1h: string[] = []

  for (const appt of appts1h || []) {
    if (!appt.contact?.phone) continue
    const dateFormatted = format(parseISO(appt.start_time), 'HH:mm')
    const serviceName = appt.service?.name || 'Consulta'

    let message = `Olá, ${appt.contact.name}! Sua consulta de *${serviceName}* começará em cerca de 1 hora (às *${dateFormatted}*).`

    if (appt.meeting_url) {
      message += `\n\n🎥 *Link da Sala Online:* ${appt.meeting_url}`
    } else if (appt.location_address) {
      message += `\n\n📍 *Endereço:* ${appt.location_address}`
    }

    try {
      const { data: waConfig } = await supabase
        .from('whatsapp_configs')
        .select('*')
        .eq('account_id', appt.account_id)
        .eq('status', 'connected')
        .maybeSingle()

      if (waConfig && waConfig.instance_name && process.env.EVOLUTION_API_URL) {
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${waConfig.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EVOLUTION_API_KEY || ''
          },
          body: JSON.stringify({
            number: appt.contact.phone,
            text: message
          })
        })
      }
    } catch (sendErr) {
      console.error('Failed to send 1h WhatsApp reminder:', sendErr)
    }

    // Mark 1h reminder as sent
    await supabase
      .from('appointments')
      .update({ reminder_1h_sent: true })
      .eq('id', appt.id)

    sent1h.push(appt.id)
  }

  return NextResponse.json({
    success: true,
    processed_24h: sent24h.length,
    processed_1h: sent1h.length
  })
}
