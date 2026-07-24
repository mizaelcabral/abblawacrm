import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ponytail: Private document upload route verifying auth, contact tenancy, MIME/size bounds, and atomic storage + DB records
export async function POST(request: Request) {
  let uploadedStoragePath: string | null = null;
  const admin = supabaseAdmin();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // 1. Get user profile and server-enforced account_id
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, email')
      .eq('user_id', user.id)
      .single();

    if (!profile || !profile.account_id) {
      return NextResponse.json(
        { error: 'Acesso negado: Perfil sem conta ativa' },
        { status: 403 }
      );
    }

    const accountId = profile.account_id;

    // 2. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const contactId = formData.get('contact_id') as string | null;
    const documentType = (formData.get('document_type') as string | null) || 'outros';
    const displayNameInput = formData.get('display_name') as string | null;
    const validUntilInput = formData.get('valid_until') as string | null;
    const dealIdInput = formData.get('deal_id') as string | null;
    const rejectionReason = formData.get('notes') as string | null;

    if (!file || !contactId) {
      return NextResponse.json(
        { error: 'Arquivo e contact_id são obrigatórios' },
        { status: 400 }
      );
    }

    // 3. Validate contact ownership
    const { data: contact } = await admin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json(
        { error: 'Contato não encontrado ou pertence a outra conta' },
        { status: 404 }
      );
    }

    // 4. Validate deal ownership if deal_id is provided
    let dealId: string | null = null;
    if (dealIdInput) {
      const { data: deal } = await admin
        .from('deals')
        .select('id')
        .eq('id', dealIdInput)
        .eq('account_id', accountId)
        .maybeSingle();

      if (!deal) {
        return NextResponse.json(
          { error: 'Negócio não encontrado ou pertence a outra conta' },
          { status: 404 }
        );
      }
      dealId = deal.id;
    }

    // 5. Validate file size and MIME type
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo excede o limite máximo de 50 MB' },
        { status: 400 }
      );
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não suportado (${mimeType})` },
        { status: 400 }
      );
    }

    // 6. Generate random storage path
    const fileExt = file.name.split('.').pop() || 'bin';
    const storagePath = `account-${accountId}/contacts/${contactId}/${crypto.randomUUID()}.${fileExt}`;
    uploadedStoragePath = storagePath;

    // Convert file to ArrayBuffer/Buffer for Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload file to protected-documents bucket
    const { error: storageError } = await admin.storage
      .from('protected-documents')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (storageError) {
      console.error('[documents/upload] Error uploading to storage:', storageError);
      return NextResponse.json(
        { error: 'Falha ao salvar arquivo no armazenamento seguro' },
        { status: 500 }
      );
    }

    const displayName = (displayNameInput || file.name).trim();
    const validUntil = validUntilInput ? new Date(validUntilInput).toISOString() : null;

    // 7. Create logical document record
    const { data: doc, error: docError } = await admin
      .from('documents')
      .insert({
        account_id: accountId,
        contact_id: contactId,
        deal_id: dealId,
        document_type: documentType,
        display_name: displayName,
        status: 'recebido',
        received_at: new Date().toISOString(),
        valid_until: validUntil,
        rejection_reason: rejectionReason || null,
        uploaded_by_user_id: user.id,
        version: 1,
      })
      .select('id, document_type, display_name, status, version, created_at')
      .single();

    if (docError || !doc) {
      console.error('[documents/upload] DB insert document error:', docError);
      // Clean up uploaded file
      await admin.storage.from('protected-documents').remove([storagePath]);
      return NextResponse.json(
        { error: 'Falha ao registrar documento no banco de dados' },
        { status: 500 }
      );
    }

    // 8. Create physical version record
    const { data: version, error: versionError } = await admin
      .from('document_versions')
      .insert({
        account_id: accountId,
        document_id: doc.id,
        version_number: 1,
        file_path: storagePath,
        file_size: file.size,
        mime_type: mimeType,
        uploaded_by_user_id: user.id,
      })
      .select('id')
      .single();

    if (versionError || !version) {
      console.error('[documents/upload] DB insert version error:', versionError);
      // Cleanup document and storage file
      await admin.from('documents').delete().eq('id', doc.id);
      await admin.storage.from('protected-documents').remove([storagePath]);
      return NextResponse.json(
        { error: 'Falha ao registrar versão do documento' },
        { status: 500 }
      );
    }

    // Update document's current_version_id
    await admin
      .from('documents')
      .update({ current_version_id: version.id })
      .eq('id', doc.id);

    // If deal_id provided, also add to document_deals junction table
    if (dealId) {
      await admin.from('document_deals').insert({
        account_id: accountId,
        document_id: doc.id,
        deal_id: dealId,
      });
    }

    // 9. Log audit event
    void admin.from('audit_logs').insert({
      account_id: accountId,
      user_id: user.id,
      user_email: profile.email,
      action: 'document.upload',
      target_type: 'documents',
      target_id: doc.id,
      details: {
        display_name: doc.display_name,
        document_type: doc.document_type,
        contact_id: contactId,
        deal_id: dealId,
        file_size: file.size,
        mime_type: mimeType,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err: any) {
    console.error('[documents/upload] Unexpected error:', err);
    if (uploadedStoragePath) {
      await admin.storage
        .from('protected-documents')
        .remove([uploadedStoragePath])
        .catch(() => null);
    }
    return NextResponse.json(
      { error: 'Erro interno ao processar upload' },
      { status: 500 }
    );
  }
}
