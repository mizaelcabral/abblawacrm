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
 * MockSignatureAdapter for Phase 2A local testing without external HTTP calls.
 */
export class MockSignatureAdapter implements SignatureProviderAdapter {
  async createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult> {
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
    // Generates a mock valid PDF buffer for testing storage import
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
 * ZapSignAdapter - Real ZapSign API Client (Blocked in Phase 2A)
 */
export class ZapSignAdapter implements SignatureProviderAdapter {
  private apiKey: string;
  private isPhase2A: boolean = true;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult> {
    if (this.isPhase2A) {
      throw new Error('As chamadas externas reais para a ZapSign estão bloqueadas na Fase 2A. Utilize o MockSignatureAdapter.');
    }
    throw new Error('Não implementado na Fase 2A');
  }

  async getSignedFile(docToken: string): Promise<ProviderFileResult> {
    if (this.isPhase2A) {
      throw new Error('As chamadas externas reais para a ZapSign estão bloqueadas na Fase 2A. Utilize o MockSignatureAdapter.');
    }
    throw new Error('Não implementado na Fase 2A');
  }
}
