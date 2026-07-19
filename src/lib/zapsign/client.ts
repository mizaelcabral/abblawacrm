export interface ZapSignSigner {
  name: string;
  email?: string;
  phone_country?: string;
  phone_number?: string;
  auth_mode?: string; // 'assinaturaTela', 'tokenEmail', 'tokenWhatsapp', etc.
}

export interface ZapSignCreateDocPayload {
  name: string;
  base64_pdf: string;
  signers: ZapSignSigner[];
  disable_signer_emails?: boolean;
}

export interface ZapSignCreateDocFromTemplatePayload {
  template_id: string;
  signer_name: string;
  signer_email?: string;
  signer_phone_country?: string;
  signer_phone_number?: string;
  data: Array<{ de: string; para: string }>;
}

export interface ZapSignDocResponse {
  token: string;
  name: string;
  status: string; // 'pending', 'signed', etc.
  signers: Array<{
    token: string;
    name: string;
    email: string;
    sign_url: string;
    status: string;
  }>;
}

export interface ZapSignTemplate {
  token: string;
  name: string;
  template_type: string;
  active: boolean;
}

export interface ZapSignTemplatesResponse {
  results: ZapSignTemplate[];
}

/**
 * ZapSign API Client.
 * ponytail: Minimalist wrapper for ZapSign REST API using native fetch.
 */
export class ZapSignClient {
  private apiToken: string;
  private isSandbox: boolean;

  constructor(apiToken: string, isSandbox = false) {
    if (!apiToken) {
      throw new Error('API Token da ZapSign é obrigatório.');
    }
    this.apiToken = apiToken;
    this.isSandbox = isSandbox;
  }

  private getBaseUrl(): string {
    return this.isSandbox
      ? 'https://sandbox.api.zapsign.com.br'
      : 'https://api.zapsign.com.br';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const headers = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API ZapSign: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Cria um documento a partir de PDF Base64.
   * POST /api/v1/docs/
   */
  async createDocument(payload: ZapSignCreateDocPayload): Promise<ZapSignDocResponse> {
    return this.request<ZapSignDocResponse>('/api/v1/docs/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Cria um documento a partir de um Modelo/Template.
   * POST /api/v1/models/create-doc/
   */
  async createDocumentFromTemplate(payload: ZapSignCreateDocFromTemplatePayload): Promise<ZapSignDocResponse> {
    return this.request<ZapSignDocResponse>('/api/v1/models/create-doc/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Lista os templates disponíveis no workspace.
   * GET /api/v1/templates/
   */
  async listTemplates(): Promise<ZapSignTemplatesResponse> {
    return this.request<ZapSignTemplatesResponse>('/api/v1/templates/');
  }

  /**
   * Consulta os detalhes e signatários de um documento específico.
   * GET /api/v1/docs/{token}/
   */
  async getDocument(token: string): Promise<ZapSignDocResponse> {
    return this.request<ZapSignDocResponse>(`/api/v1/docs/${token}/`);
  }
}
