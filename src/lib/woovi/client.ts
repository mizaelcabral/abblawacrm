export interface WooviSplitRule {
  pixKey: string;
  value: number; // in cents
}

export interface WooviChargePayload {
  correlationID: string;
  value: number; // in cents
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  splits?: WooviSplitRule[];
  subaccount?: string; // Pix key of the subaccount
}

export interface WooviChargeResponse {
  charge: {
    value: number;
    status: string;
    correlationID: string;
    brCode: string;
    qrCodeImage: string;
    paymentLinkUrl: string;
  };
  correlationID: string;
  brCode: string;
}

/**
 * Módulo cliente para integração com a API da Woovi (OpenPix).
 * ponytail: Mapeamento direto das APIs necessárias sem dependências externas adicionais.
 */
export class WooviClient {
  private appId: string;
  private isSandbox: boolean;

  constructor(appId: string, isSandbox = false) {
    if (!appId) {
      throw new Error('Woovi App ID (Authorization) é obrigatório.');
    }
    this.appId = appId;
    this.isSandbox = isSandbox;
  }

  private getBaseUrl(): string {
    return this.isSandbox
      ? 'https://api.woovi-sandbox.com'
      : 'https://api.woovi.com';
  }

  /**
   * Cria uma cobrança Pix (Charge) na Woovi.
   * Documentação: POST /api/v1/charge
   */
  async createCharge(payload: WooviChargePayload): Promise<WooviChargeResponse> {
    const url = `${this.getBaseUrl()}/api/v1/charge`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na criação da cobrança Woovi: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as WooviChargeResponse;
  }

  /**
   * Consulta o status de uma cobrança específica pelo seu correlationID.
   * Documentação: GET /api/v1/charge/{id}
   */
  async getCharge(correlationID: string): Promise<WooviChargeResponse['charge']> {
    const url = `${this.getBaseUrl()}/api/v1/charge/${correlationID}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.appId,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao buscar cobrança Woovi: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // A consulta retorna o objeto da cobrança diretamente ou encapsulado em { charge }
    return (data.charge || data) as WooviChargeResponse['charge'];
  }
}
