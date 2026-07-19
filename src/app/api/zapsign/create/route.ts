import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { ZapSignClient } from '@/lib/zapsign/client';

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return data.account_id as string;
}

function parsePhone(rawPhone: string) {
  const clean = rawPhone.replace(/\D/g, '');
  if (clean.startsWith('55')) {
    return { country: '55', number: clean.substring(2) };
  }
  if (clean.length === 10 || clean.length === 11) {
    return { country: '55', number: clean };
  }
  return { country: '55', number: clean };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ error: 'Conta não vinculada.' }, { status: 400 });
    }

    const { data: config } = await supabase
      .from('zapsign_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!config || !config.api_key) {
      return NextResponse.json(
        { error: 'Integração ZapSign não configurada para esta conta.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      mode, // 'pdf' or 'template'
      name,
      contactId,
      conversationId,
      
      // PDF Mode
      base64Pdf,
      signerName,
      signerEmail,
      signerPhone,
      authMode,

      // Template Mode
      templateId,
      variables, // array of { de, para }
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nome do documento é obrigatório.' }, { status: 400 });
    }

    const decryptedKey = decrypt(config.api_key);
    const client = new ZapSignClient(decryptedKey, config.environment === 'sandbox');

    let docToken = '';
    let signUrl = '';
    let resolvedSignerName = '';
    let resolvedSignerEmail = '';
    let resolvedSignerPhone = '';

    if (mode === 'template') {
      if (!templateId || !signerName) {
        return NextResponse.json(
          { error: 'ID do modelo e nome do signatário são obrigatórios.' },
          { status: 400 }
        );
      }

      resolvedSignerName = signerName;
      resolvedSignerEmail = signerEmail || '';
      resolvedSignerPhone = signerPhone || '';
      const phoneDetails = parsePhone(resolvedSignerPhone);

      const payload = {
        template_id: templateId,
        signer_name: resolvedSignerName,
        signer_email: resolvedSignerEmail || undefined,
        signer_phone_country: phoneDetails.country,
        signer_phone_number: phoneDetails.number || undefined,
        data: variables || [],
      };

      const res = await client.createDocumentFromTemplate(payload);
      docToken = res.token;
      
      // template document has one signer in our simplified model
      const firstSigner = res.signers?.[0];
      signUrl = firstSigner?.sign_url || '';
    } else {
      // PDF Mode
      if (!base64Pdf || !signerName) {
        return NextResponse.json(
          { error: 'PDF e nome do signatário são obrigatórios.' },
          { status: 400 }
        );
      }

      // ponytail: strip data URI prefix (e.g. "data:application/pdf;base64,") if present
      const rawBase64 = base64Pdf.includes(';base64,')
        ? base64Pdf.split(';base64,')[1]
        : base64Pdf;

      resolvedSignerName = signerName;
      resolvedSignerEmail = signerEmail || '';
      resolvedSignerPhone = signerPhone || '';
      const phoneDetails = parsePhone(resolvedSignerPhone);

      const payload = {
        name,
        base64_pdf: rawBase64,
        disable_signer_emails: true, // We send manually via CRM WhatsApp
        signers: [
          {
            name: resolvedSignerName,
            email: resolvedSignerEmail || undefined,
            phone_country: phoneDetails.country,
            phone_number: phoneDetails.number || undefined,
            auth_mode: authMode || 'assinaturaTela',
          },
        ],
      };

      const res = await client.createDocument(payload);
      docToken = res.token;
      const firstSigner = res.signers?.[0];
      signUrl = firstSigner?.sign_url || '';
    }

    if (!docToken || !signUrl) {
      throw new Error('Falha ao obter token do documento ou link de assinatura da ZapSign.');
    }

    // Save document to Database
    const { error: insertError } = await supabase.from('zapsign_documents').insert({
      account_id: accountId,
      contact_id: contactId || null,
      conversation_id: conversationId || null,
      doc_token: docToken,
      doc_name: name,
      status: 'pending',
      signer_name: resolvedSignerName,
      signer_email: resolvedSignerEmail || null,
      signer_phone: resolvedSignerPhone || null,
      sign_url: signUrl,
    });

    if (insertError) {
      console.error('Error saving zapsign document in database:', insertError);
      // We don't fail the request since the document is already created in ZapSign, but we log the error
    }

    return NextResponse.json({
      success: true,
      docToken,
      signUrl,
    });
  } catch (error) {
    console.error('Error creating ZapSign document:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar documento.' },
      { status: 500 }
    );
  }
}
