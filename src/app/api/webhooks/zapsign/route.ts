import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

/**
 * POST /api/webhooks/zapsign
 * Public webhook receiver for ZapSign document status updates.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('Webhook ZapSign recebido:', JSON.stringify(payload));

    const { token, status, signer_name, name: docName } = payload;

    if (!token) {
      return NextResponse.json({ error: 'Token do documento não fornecido.' }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // 1. Fetch the corresponding document from database
    const { data: document, error: fetchError } = await admin
      .from('zapsign_documents')
      .select('*')
      .eq('doc_token', token)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching document from db:', fetchError);
      return NextResponse.json({ error: 'Erro ao buscar documento.' }, { status: 500 });
    }

    if (!document) {
      console.warn(`Document with token ${token} not found in database.`);
      return NextResponse.json({ message: 'Documento não encontrado no CRM.' }, { status: 200 });
    }

    // 2. Map ZapSign status to CRM status
    // ZapSign status options: 'pending', 'signed', 'refused', 'expired', 'cancelled'
    let resolvedStatus = 'pending';
    if (status === 'signed') resolvedStatus = 'signed';
    else if (status === 'refused') resolvedStatus = 'refused';
    else if (status === 'expired') resolvedStatus = 'expired';
    else if (status === 'cancelled') resolvedStatus = 'cancelled';

    const updatePayload: any = {
      status: resolvedStatus,
      updated_at: new Date().toISOString(),
    };

    if (resolvedStatus === 'signed') {
      updatePayload.signed_at = new Date().toISOString();
    }

    // 3. Update status in database
    const { error: updateError } = await admin
      .from('zapsign_documents')
      .update(updatePayload)
      .eq('doc_token', token);

    if (updateError) {
      console.error('Error updating document status in db:', updateError);
      return NextResponse.json({ error: 'Erro ao atualizar status do documento.' }, { status: 500 });
    }

    // 4. Send automatic confirmation message via WhatsApp if document was signed
    if (resolvedStatus === 'signed' && document.signer_phone) {
      try {
        const { data: waConfig } = await admin
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', document.account_id)
          .maybeSingle();

        if (waConfig && waConfig.access_token && waConfig.phone_number_id) {
          const clientPhone = normalizePhone(document.signer_phone);

          if (clientPhone) {
            const accessToken = decrypt(waConfig.access_token);
            const signerNameStr = signer_name || document.signer_name || 'Signatário';

            const messageText = `Olá, *${signerNameStr}*! O documento *${docName || document.doc_name}* foi assinado com sucesso. Obrigado! 🎉`;

            await sendTextMessage({
              phoneNumberId: waConfig.phone_number_id,
              accessToken,
              to: clientPhone,
              text: messageText,
            });
            console.log('Mensagem de confirmação de assinatura enviada com sucesso para:', clientPhone);
          }
        }
      } catch (waErr) {
        console.error('Erro ao enviar mensagem de confirmação WhatsApp:', waErr);
      }
    }

    return NextResponse.json({ message: 'Webhook processado com sucesso!' }, { status: 200 });
  } catch (error) {
    console.error('Error processing ZapSign webhook:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar webhook.' },
      { status: 500 }
    );
  }
}
