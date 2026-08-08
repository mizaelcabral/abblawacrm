import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Automates CRM actions when an appointment is confirmed:
 * 1. Ensures appointment status is updated to 'confirmed'
 * 2. Creates a Deal in the Sales Pipeline (Funil de Vendas) for the contact
 * 3. Creates a Task (Tarefa) for the staff member/agent
 */
export async function processAppointmentConfirmation(appointmentId: string, supabase: SupabaseClient) {
  try {
    // 1. Fetch complete appointment details
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('*, service:services(*), profile:profiles(*), contact:contacts(*)')
      .eq('id', appointmentId)
      .single()

    if (error || !appt) {
      console.error('Failed to fetch appointment for confirmation automation:', error)
      return null
    }

    // 2. Update status to confirmed if not already
    if (appt.status !== 'confirmed') {
      await supabase
        .from('appointments')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
      appt.status = 'confirmed'
    }

    const serviceName = appt.service?.name || 'Consulta / Atendimento'
    const servicePrice = Number(appt.service?.price) || 0
    const clientName = appt.contact?.name || 'Cliente'
    const clientPhone = appt.contact?.phone || ''

    // 3. Automatically create/advance Deal in Sales Pipeline (Funil de Vendas)
    try {
      const { data: firstPipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('account_id', appt.account_id)
        .limit(1)
        .maybeSingle()

      if (firstPipeline) {
        const { data: firstStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', firstPipeline.id)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (firstStage) {
          const { data: existingDeal } = await supabase
            .from('deals')
            .select('id')
            .eq('account_id', appt.account_id)
            .eq('contact_id', appt.contact_id)
            .eq('title', `Agendamento: ${serviceName}`)
            .limit(1)
            .maybeSingle()

          if (!existingDeal) {
            await supabase
              .from('deals')
              .insert({
                account_id: appt.account_id,
                user_id: appt.profile?.user_id || null,
                pipeline_id: firstPipeline.id,
                stage_id: firstStage.id,
                contact_id: appt.contact_id,
                title: `Agendamento: ${serviceName}`,
                value: servicePrice,
                status: 'active'
              })
            console.log('Automated Deal created in sales pipeline for appointment:', appointmentId)
          }
        }
      }
    } catch (dealErr) {
      console.error('Error creating automated deal for appointment:', dealErr)
    }

    // 4. Automatically create Task (Tarefa) for staff member
    try {
      const taskTitle = `Consulta: ${serviceName} - ${clientName}`
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('account_id', appt.account_id)
        .eq('title', taskTitle)
        .limit(1)
        .maybeSingle()

      if (!existingTask) {
        await supabase
          .from('tasks')
          .insert({
            account_id: appt.account_id,
            contact_id: appt.contact_id,
            title: taskTitle,
            description: `Atendimento agendado para ${new Date(appt.start_time).toLocaleString('pt-BR')}.\nCliente: ${clientName} (${clientPhone})\nServiço: ${serviceName}`,
            due_at: appt.start_time,
            assigned_agent_id: appt.profile_id || null,
            status: 'pending'
          })
        console.log('Automated Task created for appointment:', appointmentId)
      }
    } catch (taskErr) {
      console.error('Error creating automated task for appointment:', taskErr)
    }

    return appt
  } catch (err) {
    console.error('General error in processAppointmentConfirmation:', err)
    return null
  }
}
