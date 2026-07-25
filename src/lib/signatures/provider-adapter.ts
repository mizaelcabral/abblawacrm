export interface CreateFromTemplateParams {
  templateId: string;
  documentName: string;
  signers: Array<{
    name: string;
    email?: string;
    phone?: string;
    authMode?: string;
  }>;
  variables: Array<{
    de: string;
    para: string;
  }>;
  externalId?: string;
  sandbox?: boolean;
}

export interface ProviderCreateDocumentResult {
  docToken: string;
  openId: number;
  status: string;
  signUrl: string;
  rawResponse: Record<string, any>;
}

export interface ProviderFileResult {
  pdfBuffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface SignatureProviderAdapter {
  createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult>;
  getSignedFile(docToken: string): Promise<ProviderFileResult>;
}

/**
 * MockSignatureAdapter for Phase 2A local testing ONLY.
 * STRICTION: Strictly unavailable in production environment.
 */
export class MockSignatureAdapter implements SignatureProviderAdapter {
  private isAllowedInCurrentEnv(): boolean {
    if (process.env.NODE_ENV === 'production' && process.env.SIGNATURE_MOCK_ENABLED !== 'true') {
      return false;
    }
    return true;
  }

  async createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult> {
    if (!this.isAllowedInCurrentEnv()) {
      throw new Error('O Provedor Mock de assinatura está desativado no ambiente de produção.');
    }

    const mockToken = `doc_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mockSignUrl = `https://app.zapsign.com.br/verificar/${mockToken}`;

    return {
      docToken: mockToken,
      openId: 100001,
      status: 'pending',
      signUrl: mockSignUrl,
      rawResponse: {
        token: mockToken,
        name: params.documentName,
        status: 'pending',
        signers: params.signers.map((s, idx) => ({
          token: `signer_${mockToken}_${idx}`,
          name: s.name,
          email: s.email,
          sign_url: mockSignUrl,
        })),
        is_mock: true,
      },
    };
  }

  async getSignedFile(docToken: string): Promise<ProviderFileResult> {
    if (!this.isAllowedInCurrentEnv()) {
      throw new Error('O Provedor Mock de assinatura está desativado no ambiente de produção.');
    }

    const mockPdfHeader = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    const pdfBuffer = Buffer.from(mockPdfHeader, 'utf-8');

    return {
      pdfBuffer,
      mimeType: 'application/pdf',
      fileName: `procuracao_assinada_${docToken}.pdf`,
    };
  }
}

/**
 * ZapSignAdapter - Real ZapSign API Client (Blocked until Phase 2B configuration)
 */
export class ZapSignAdapter implements SignatureProviderAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult> {
    if (!this.apiKey || this.apiKey === 'mock' || this.apiKey.includes('••••')) {
      throw new Error('Credenciais da ZapSign não configuradas ou inválidas. Configure a chave de API em Configurações > ZapSign.');
    }
    throw new Error('Integração com ZapSign real aguardando autorização da Fase 2B.');
  }

  async getSignedFile(docToken: string): Promise<ProviderFileResult> {
    if (!this.apiKey || this.apiKey === 'mock' || this.apiKey.includes('••••')) {
      throw new Error('Credenciais da ZapSign não configuradas ou inválidas.');
    }
    throw new Error('Integração com ZapSign real aguardando autorização da Fase 2B.');
  }
}
