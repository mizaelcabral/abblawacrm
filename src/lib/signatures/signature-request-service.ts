import { supabaseAdmin } from '@/lib/automations/admin-client';
import { encryptText, decryptText } from '@/lib/security/crypto';
import { resolveSignatory } from './signatory-resolver';
import { resolveSystemValue } from './system-value-resolver';
import { formatInstructionMessage } from './instruction-message-formatter';
import { getContactWithCustomFields } from './contact-helper';
import { SignatureProviderAdapter, MockSignatureAdapter } from './provider-adapter';
import { SignatureTemplate, ALLOWED_CONTACT_PROPERTIES } from '@/types/signatures';

export interface CreateSignatureRequestParams {
  accountId: string;
  userId: string;
  contactId: string;
  dealId?: string | null;
  signatureTemplateId: string;
  idempotencyKey: string;
}

export interface SignatureRequestResult {
  requestId: string;
  status: string;
  signatoryType: 'contact' | 'guardian';
  signatoryName: string;
  isExisting: boolean;
}

/**
 * Core Signature Request Service (Phase 2A & 2B Architecture)
 */
export class SignatureRequestService {
  private adapter: SignatureProviderAdapter;

  constructor(adapter?: SignatureProviderAdapter) {
    this.adapter = adapter || new MockSignatureAdapter();
  }

  async createRequest(params: CreateSignatureRequestParams): Promise<SignatureRequestResult> {
    const admin = supabaseAdmin();
    const { accountId, userId, contactId, dealId, signatureTemplateId, idempotencyKey } = params;

    // 1. Idempotency Check: look for existing request with same account_id & idempotency_key
    const { data: existingReq } = await admin
      .from('zapsign_documents')
      .select('id, status, signatory_type, signatory_name')
      .eq('account_id', accountId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingReq) {
      return {
        requestId: existingReq.id,
        status: existingReq.status,
        signatoryType: existingReq.signatory_type as any,
        signatoryName: existingReq.signatory_name || '',
        isExisting: true,
      };
    }

    // 2. Fetch Active Template
    const { data: template, error: tplErr } = await admin
      .from('signature_templates')
      .select('*')
      .eq('id', signatureTemplateId)
      .eq('account_id', accountId)
      .eq('is_active', true)
      .maybeSingle();

    if (tplErr || !template) {
      throw new Error('Modelo de assinatura não encontrado ou inativo para esta conta.');
    }

    // 3. Fetch Contact & Relational Custom Fields
    const contact = await getContactWithCustomFields(accountId, contactId);

    if (!contact) {
      throw new Error('Contato não encontrado para esta conta.');
    }

    // 4. Resolve Signatory
    const signatoryRes = resolveSignatory(template.signatory_rule, contact);
    if (signatoryRes.is_blocked || !signatoryRes.signatory) {
      const missingList = signatoryRes.missing_fields?.join(', ') || 'dados pendentes';
      throw new Error(`Geração bloqueada: ${signatoryRes.block_reason} (Campos ausentes: ${missingList})`);
    }

    const { signatory } = signatoryRes;

    // 5. Evaluate Variable Mappings (DOCX de/para)
    const customFields = contact.custom_fields || {};
    const payloadVariables: Array<{ de: string; para: string }> = [];
    const missingRequiredVariables: string[] = [];

    for (const mapping of template.field_mappings || []) {
      let resolvedValue: string | undefined = undefined;

      if (mapping.source_type === 'contact_property') {
        if (ALLOWED_CONTACT_PROPERTIES.has(mapping.source_key)) {
          resolvedValue = (contact as any)[mapping.source_key] || undefined;
        }
      } else if (mapping.source_type === 'custom_field') {
        resolvedValue = customFields[mapping.source_key] !== undefined && customFields[mapping.source_key] !== null
          ? String(customFields[mapping.source_key])
          : undefined;
      } else if (mapping.source_type === 'fixed_value') {
        resolvedValue = mapping.default_value;
      } else if (mapping.source_type === 'system_value') {
        const sysRes = resolveSystemValue(mapping.source_key, customFields);
        if (sysRes.is_blocked || !sysRes.value) {
          missingRequiredVariables.push(mapping.source_key || mapping.zapsign_var);
        } else {
          resolvedValue = sysRes.value;
        }
      }

      if (!resolvedValue || !resolvedValue.trim()) {
        if (mapping.is_required) {
          missingRequiredVariables.push(mapping.source_key || mapping.zapsign_var);
        } else if (mapping.default_value) {
          resolvedValue = mapping.default_value;
        }
      }

      if (resolvedValue) {
        payloadVariables.push({
          de: mapping.zapsign_var,
          para: resolvedValue.trim(),
        });
      }
    }

    if (missingRequiredVariables.length > 0) {
      throw new Error(`Impossível gerar: variáveis obrigatórias não preenchidas: ${missingRequiredVariables.join(', ')}`);
    }

    // 6. Insert Internal Draft Record (Status: 'creating')
    const { data: newDoc, error: insErr } = await admin
      .from('zapsign_documents')
      .insert({
        account_id: accountId,
        contact_id: contactId,
        deal_id: dealId || null,
        signature_template_id: template.id,
        idempotency_key: idempotencyKey,
        signatory_type: signatory.signatory_type,
        signatory_name: signatory.name,
        status: 'creating',
        created_by: userId,
      })
      .select('id')
      .single();

    if (insErr || !newDoc) {
      console.error('[SignatureRequestService] DB Insert error:', insErr);
      throw new Error('Falha ao registrar a solicitação interna no banco de dados.');
    }

    const requestId = newDoc.id;

    try {
      // 7. Execute Adapter
      const providerRes = await this.adapter.createFromTemplate({
        templateId: template.template_id,
        documentName: `${template.template_name} - ${contact.name}`,
        signers: [
          {
            name: signatory.name,
            email: signatory.email,
            phone: signatory.phone,
            authMode: 'assinaturaTela',
          },
        ],
        variables: payloadVariables,
        externalId: requestId,
      });

      // 8. Encrypt Sensitive Sign URL and Token
      const encryptedSignUrl = encryptText(providerRes.signUrl);

      // 9. Update DB Record to Status: 'pending'
      await admin
        .from('zapsign_documents')
        .update({
          doc_token: providerRes.docToken,
          open_id: providerRes.openId,
          status: 'pending',
          sign_url: encryptedSignUrl,
          raw_response: providerRes.rawResponse,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      // 10. Audit Log
      await admin.from('audit_logs').insert({
        account_id: accountId,
        user_id: userId,
        action: 'zapsign.document_created',
        target_type: 'signature_request',
        target_id: requestId,
        details: {
          template_id: template.template_id,
          signatory_type: signatory.signatory_type,
          variables_count: payloadVariables.length,
        },
      });

      return {
        requestId,
        status: 'pending',
        signatoryType: signatory.signatory_type,
        signatoryName: signatory.name,
        isExisting: false,
      };
    } catch (adapterErr: any) {
      // Rollback status to 'error'
      await admin.from('zapsign_documents').update({ status: 'error' }).eq('id', requestId);
      throw adapterErr;
    }
  }

  /**
   * Protected signing link access with audit signature.link_accessed
   */
  async getAccessLink(params: {
    requestId: string;
    accountId: string;
    userId: string;
    userRole: string;
  }) {
    if (params.userRole === 'viewer') {
      throw new Error('Acesso negado: visualizadores não possuem permissão para obter o link de assinatura.');
    }

    const admin = supabaseAdmin();
    const { data: doc, error } = await admin
      .from('zapsign_documents')
      .select('id, account_id, sign_url, status, contact_id, signature_template_id')
      .eq('id', params.requestId)
      .eq('account_id', params.accountId)
      .maybeSingle();

    if (error || !doc || !doc.sign_url) {
      throw new Error('Solicitação de assinatura não encontrada.');
    }

    // Decrypt signUrl
    const signingLink = decryptText(doc.sign_url);

    // Fetch contact for instruction message formatting
    const { data: contact } = await admin
      .from('contacts')
      .select('name')
      .eq('id', doc.contact_id)
      .single();

    // Fetch template for instruction_message_template
    const { data: tpl } = await admin
      .from('signature_templates')
      .select('instruction_message_template, privacy_notice_url')
      .eq('id', doc.signature_template_id)
      .single();

    const firstName = contact?.name ? contact.name.split(' ')[0] : 'Cliente';
    const formattedMsg = formatInstructionMessage({
      templateText: tpl?.instruction_message_template,
      firstName,
      signingLink,
      privacyNoticeUrl: tpl?.privacy_notice_url,
    });

    // Audit signature.link_accessed WITHOUT recording the signingLink URL
    await admin.from('audit_logs').insert({
      account_id: params.accountId,
      user_id: params.userId,
      action: 'signature.link_accessed',
      target_type: 'signature_request',
      target_id: doc.id,
      details: {
        access_timestamp: new Date().toISOString(),
      },
    });

    return {
      requestId: doc.id,
      status: doc.status,
      signingLink,
      instructionMessage: formattedMsg.message,
    };
  }

  /**
   * Process Webhook Events (Idempotent state machine & PDF import)
   */
  async processWebhookEvent(params: {
    eventType: 'doc_signed' | 'doc_refused' | 'doc_expired' | 'doc_created';
    docToken: string;
    accountId: string;
  }) {
    const admin = supabaseAdmin();
    const { eventType, docToken, accountId } = params;

    // 1. Locate Document by doc_token & account_id
    const { data: doc, error } = await admin
      .from('zapsign_documents')
      .select('*')
      .eq('doc_token', docToken)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error || !doc) {
      throw new Error(`Solicitação de assinatura com doc_token '${docToken}' não encontrada nesta conta.`);
    }

    // 2. Idempotency & State Machine Guards
    if (doc.status === 'signed') {
      return { success: true, message: 'Evento ignorado: documento já está assinado.', status: 'signed', documentId: doc.document_id };
    }

    if (eventType === 'doc_signed') {
      // Import PDF from Adapter
      const fileRes = await this.adapter.getSignedFile(docToken);

      if (!fileRes.pdfBuffer || fileRes.pdfBuffer.length === 0 || fileRes.mimeType !== 'application/pdf') {
        throw new Error('Arquivo PDF retornado é inválido ou corrompido.');
      }

      const storagePath = `${accountId}/signatures/${doc.id}/v1/procuracao_assinada.pdf`;

      // Upload to protected-documents storage bucket
      const { error: storageErr } = await admin.storage
        .from('protected-documents')
        .upload(storagePath, fileRes.pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (storageErr) {
        console.error('[SignatureRequestService] Storage upload error:', storageErr);
        throw new Error('Falha ao armazenar o PDF assinado no bucket de documentos protegidos.');
      }

      // Check existing document
      const { data: existingDoc } = await admin
        .from('documents')
        .select('id, current_version_id')
        .eq('account_id', accountId)
        .eq('contact_id', doc.contact_id)
        .eq('file_path', storagePath)
        .maybeSingle();

      let documentId = existingDoc?.id;
      let versionId = existingDoc?.current_version_id;

      if (!documentId) {
        // Create Document row
        const { data: createdDoc, error: insErr } = await admin
          .from('documents')
          .insert({
            account_id: accountId,
            contact_id: doc.contact_id,
            document_type: 'procuracao',
            name: `Procuração Assinada - ${doc.signatory_name}`,
            file_path: storagePath,
            status: 'approved',
          })
          .select('id')
          .single();

        if (insErr || !createdDoc) {
          throw new Error('Falha ao registrar o documento no banco de dados.');
        }

        documentId = createdDoc.id;

        // Create Document Version row
        const { data: createdVer, error: verErr } = await admin
          .from('document_versions')
          .insert({
            document_id: documentId,
            version_number: 1,
            file_path: storagePath,
            file_size: fileRes.pdfBuffer.length,
            mime_type: 'application/pdf',
          })
          .select('id')
          .single();

        if (!verErr && createdVer) {
          versionId = createdVer.id;
          // Update documents.current_version_id
          await admin
            .from('documents')
            .update({ current_version_id: versionId })
            .eq('id', documentId);
        }

        // Link Deal if present
        if (doc.deal_id) {
          await admin.from('document_deals').insert({
            document_id: documentId,
            deal_id: doc.deal_id,
          });
        }
      }

      // Link zapsign_documents.document_id and set status = 'signed'
      await admin
        .from('zapsign_documents')
        .update({
          status: 'signed',
          document_id: documentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      // Audit logs
      await admin.from('audit_logs').insert([
        {
          account_id: accountId,
          action: 'document.upload',
          target_type: 'document',
          target_id: documentId,
          details: { document_type: 'procuracao', source: 'zapsign_webhook' },
        },
        {
          account_id: accountId,
          action: 'signature.completed',
          target_type: 'signature_request',
          target_id: doc.id,
          details: { document_id: documentId },
        },
      ]);

      return { success: true, message: 'Documento assinado e importado com sucesso.', status: 'signed', documentId };
    }

    if (eventType === 'doc_refused') {
      await admin.from('zapsign_documents').update({ status: 'refused' }).eq('id', doc.id);
      return { success: true, message: 'Assinatura recusada.', status: 'refused' };
    }

    if (eventType === 'doc_expired') {
      await admin.from('zapsign_documents').update({ status: 'expired' }).eq('id', doc.id);
      return { success: true, message: 'Solicitação expirada.', status: 'expired' };
    }

    return { success: true, message: 'Evento processado.', status: doc.status };
  }
}
