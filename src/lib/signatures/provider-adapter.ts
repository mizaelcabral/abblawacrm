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
 * MockSignatureAdapter for local development and unit tests ONLY.
 * ABSOLUTE RULE: Unconditionally BLOCKED in production environment (NODE_ENV === 'production').
 * No environment variable, query parameter, header, or account setting can enable this in production.
 */
export class MockSignatureAdapter implements SignatureProviderAdapter {
  private assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('O Provedor Mock de assinatura está estritamente bloqueado no ambiente de produção.');
    }
  }

  async createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult> {
    this.assertNotProduction();

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
    this.assertNotProduction();

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
 * ZapSignAdapter - Real ZapSign API Client (Requires explicit Phase 2B activation & valid credentials)
 */
export class ZapSignAdapter implements SignatureProviderAdapter {
  private apiKey: string;
  private isIntegrationActive: boolean;

  constructor(apiKey: string, isIntegrationActive: boolean = false) {
    this.apiKey = apiKey;
    this.isIntegrationActive = isIntegrationActive;
  }

  async createFromTemplate(params: CreateFromTemplateParams): Promise<ProviderCreateDocumentResult> {
    if (!this.isIntegrationActive || !this.apiKey || this.apiKey === 'mock' || this.apiKey.includes('••••')) {
      throw new Error('Integração com ZapSign não está ativada ou credenciais não foram configuradas. Fase 2B pendente.');
    }
    throw new Error('Integração com ZapSign real aguardando ativação explícita da Fase 2B.');
  }

  async getSignedFile(docToken: string): Promise<ProviderFileResult> {
    if (!this.isIntegrationActive || !this.apiKey || this.apiKey === 'mock' || this.apiKey.includes('••••')) {
      throw new Error('Integração com ZapSign não está ativada ou credenciais não foram configuradas.');
    }
    throw new Error('Integração com ZapSign real aguardando ativação explícita da Fase 2B.');
  }
}
