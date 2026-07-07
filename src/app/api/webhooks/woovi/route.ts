import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

/**
 * POST /api/webhooks/woovi
 * Webhook público para receber notificações de pagamentos Pix concluídos da Woovi (OpenPix).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Webhook Woovi recebido:', JSON.stringify(body));

    const event = body.event || '';
    // Aceita tanto OPENPIX:CHARGE_COMPLETED quanto variações de caixa
    if (event.toUpperCase() !== 'OPENPIX:CHARGE_COMPLETED') {
      return NextResponse.json({ message: 'Evento ignorado.' }, { status: 200 });
    }

    const correlationID = body.charge?.correlationID || body.correlationID;
    if (!correlationID) {
      return NextResponse.json({ error: 'correlationID não encontrado no payload.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Buscar o pedido pelo correlationID
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', correlationID)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    // Se o pedido já estiver marcado como pago, retorna sucesso antecipadamente (Idempotência)
    if (order.status === 'paid') {
      return NextResponse.json({ message: 'Pedido já processado anteriormente.' }, { status: 200 });
    }

    // 2. Buscar itens do pedido e produtos/variações associados
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        *,
        variation:product_variations(
          *,
          product:products(*)
        )
      `)
      .eq('order_id', order.id);

    if (itemsError || !orderItems || orderItems.length === 0) {
      return NextResponse.json({ error: 'Itens do pedido não encontrados.' }, { status: 400 });
    }

    // 3. Atualizar status do pedido para 'paid'
    // E calcular a data do lembrete de recompra (repurchase_reminder_at)
    let maxRepurchaseDays = 0;
    for (const item of orderItems as any[]) {
      const prod = item.variation?.product;
      if (prod?.repurchase_reminder_days && prod.repurchase_reminder_days > maxRepurchaseDays) {
        maxRepurchaseDays = prod.repurchase_reminder_days;
      }
    }

    let repurchaseReminderAt: string | null = null;
    if (maxRepurchaseDays > 0) {
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + maxRepurchaseDays);
      repurchaseReminderAt = reminderDate.toISOString();
    }

    const { error: updateOrderError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        repurchase_reminder_at: repurchaseReminderAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateOrderError) {
      throw new Error(`Falha ao atualizar status do pedido: ${updateOrderError.message}`);
    }

    // 4. Decrementar estoque de produtos físicos
    for (const item of orderItems as any[]) {
      const matchedVar = item.variation;
      const prod = matchedVar?.product;

      if (prod && prod.product_type === 'physical') {
        const currentStock = Number(matchedVar.stock || 0);
        const newStock = Math.max(0, currentStock - Number(item.quantity));

        await supabase
          .from('product_variations')
          .update({ stock: newStock })
          .eq('id', item.product_variation_id);
      }
    }

    // 5. Vincular ou Criar Negócio (Deal) no Funil de Vendas do CRM
    try {
      if (order.contact_id) {
        // Encontrar as etapas de funil disponíveis para o tenant
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('id, pipeline_id, name')
          .eq('account_id', order.account_id);

        if (stages && stages.length > 0) {
          // Procurar etapa correspondente a "Pago", "Ganho" ou "Concluído"
          let targetStage = stages.find((s) =>
            s.name.toLowerCase().includes('pago') ||
            s.name.toLowerCase().includes('conclu') ||
            s.name.toLowerCase().includes('ganho')
          );

          if (!targetStage) {
            // Fallback: usar o último estágio cadastrado
            targetStage = stages[stages.length - 1];
          }

          // Verificar se existe um negócio em aberto para o contato
          const { data: activeDeal } = await supabase
            .from('deals')
            .select('*')
            .eq('contact_id', order.contact_id)
            .eq('status', 'open')
            .maybeSingle();

          if (activeDeal) {
            // Mover negócio para etapa "Pago" e marcar como ganho
            await supabase
              .from('deals')
              .update({
                stage_id: targetStage.id,
                value: Number(order.total_amount),
                status: 'won',
                updated_at: new Date().toISOString(),
              })
              .eq('id', activeDeal.id);
          } else {
            // Criar um novo negócio ganho no funil
            await supabase
              .from('deals')
              .insert({
                account_id: order.account_id,
                contact_id: order.contact_id,
                pipeline_id: targetStage.pipeline_id,
                stage_id: targetStage.id,
                title: `Pedido #${order.id.slice(0, 8)}`,
                value: Number(order.total_amount),
                status: 'won',
              });
          }
        }
      }
    } catch (crmErr) {
      console.error('Erro ao progredir negócio no CRM:', crmErr);
      // Não interrompe o fluxo de webhook por erro no CRM
    }

    // 6. Enviar confirmação de pagamento por WhatsApp
    try {
      const { data: waConfig } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', order.account_id)
        .maybeSingle();

      if (waConfig && waConfig.access_token && waConfig.phone_number_id) {
        const clientPhone = normalizePhone(order.customer_info?.phone || '');

        if (clientPhone) {
          const accessToken = decrypt(waConfig.access_token);
          const customerName = order.customer_info?.name || 'Cliente';

          // Montar mensagem customizada dependendo dos itens físicos/digitais
          let messageText = `Olá, *${customerName}*! Seu pagamento Pix foi confirmado com sucesso. 🎉\n\n`;
          messageText += `*Pedido:* #${order.id.slice(0, 8)}\n`;
          messageText += `*Total:* R$ ${Number(order.total_amount).toFixed(2)}\n\n`;

          let digitalLinksText = '';
          let physicalAddressText = '';

          for (const item of orderItems as any[]) {
            const prod = item.variation?.product;
            if (prod) {
              if (prod.product_type === 'digital' && prod.digital_content) {
                digitalLinksText += `- *${prod.name}:* Acesso: ${prod.digital_content}\n`;
              }
            }
          }

          if (order.shipping_amount > 0 || order.customer_info?.address) {
            const addr = order.customer_info?.address;
            if (addr) {
              physicalAddressText = `*Endereço de envio:*\n${addr.street}, ${addr.number}\n${addr.neighborhood} - ${addr.city}/${addr.state}\n\n`;
            }
          }

          if (digitalLinksText) {
            messageText += `*Seus acessos digitais:*\n${digitalLinksText}\n`;
          }

          if (physicalAddressText) {
            messageText += physicalAddressText;
            messageText += `Já estamos preparando seu pedido físico e notificaremos sobre o envio.`;
          } else {
            messageText += `Obrigado por comprar conosco!`;
          }

          await sendTextMessage({
            phoneNumberId: waConfig.phone_number_id,
            accessToken,
            to: clientPhone,
            text: messageText,
          });
          console.log('Mensagem de WhatsApp enviada com sucesso para:', clientPhone);
        }
      } else {
        console.warn('WhatsApp não configurado ou credenciais inválidas para o tenant:', order.account_id);
      }
    } catch (waErr) {
      console.error('Erro ao enviar mensagem WhatsApp do webhook:', waErr);
      // Não interrompe o fluxo de webhook
    }

    return NextResponse.json({ message: 'Webhook processado com sucesso!' }, { status: 200 });
  } catch (err: any) {
    console.error('Erro geral no processamento do webhook:', err);
    return NextResponse.json({ error: 'Erro interno no processamento do webhook.' }, { status: 500 });
  }
}
