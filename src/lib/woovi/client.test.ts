import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WooviClient } from './client';

describe('WooviClient', () => {
  const appId = 'test-app-id-12345';
  let client: WooviClient;

  beforeEach(() => {
    client = new WooviClient(appId, true); // sandbox true
    vi.restoreAllMocks();
  });

  it('deve inicializar corretamente com o appId e sandbox', () => {
    expect(client).toBeDefined();
    // @ts-expect-error - acessando propriedade privada para testes
    expect(client.appId).toBe(appId);
    // @ts-expect-error - acessando propriedade privada para testes
    expect(client.isSandbox).toBe(true);
  });

  it('deve lançar erro se appId for vazio', () => {
    expect(() => new WooviClient('')).toThrow('Woovi App ID (Authorization) é obrigatório.');
  });

  it('deve gerar uma cobrança Pix com sucesso', async () => {
    const mockResponse = {
      charge: {
        value: 1000,
        status: 'ACTIVE',
        correlationID: 'order-123',
        brCode: '00020101021226...',
        qrCodeImage: 'https://api.woovi.com/image.png',
        paymentLinkUrl: 'https://woovi.com/pay/123',
      },
      correlationID: 'order-123',
      brCode: '00020101021226...',
    };

    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    vi.stubGlobal('fetch', globalFetchMock);

    const payload = {
      correlationID: 'order-123',
      value: 1000,
      customer: {
        name: 'Mizael Cabral',
        email: 'mizael@abbla.com',
        phone: '+5511999999999',
      },
    };

    const result = await client.createCharge(payload);

    expect(globalFetchMock).toHaveBeenCalledWith(
      'https://api.woovi-sandbox.com/api/v1/charge',
      {
        method: 'POST',
        headers: {
          'Authorization': appId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    expect(result).toEqual(mockResponse);
  });

  it('deve lançar erro se o fetch retornar status inválido', async () => {
    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'CorrelationID já existe',
    });
    vi.stubGlobal('fetch', globalFetchMock);

    const payload = {
      correlationID: 'order-123',
      value: 1000,
      customer: {
        name: 'Mizael Cabral',
        email: 'mizael@abbla.com',
        phone: '+5511999999999',
      },
    };

    await expect(client.createCharge(payload)).rejects.toThrow(
      'Erro na criação da cobrança Woovi: 400 - CorrelationID já existe'
    );
  });

  it('deve buscar uma cobrança pelo correlationID', async () => {
    const mockCharge = {
      value: 1000,
      status: 'PAID',
      correlationID: 'order-123',
      brCode: '00020101021226...',
      qrCodeImage: 'https://api.woovi.com/image.png',
      paymentLinkUrl: 'https://woovi.com/pay/123',
    };

    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charge: mockCharge }),
    });
    vi.stubGlobal('fetch', globalFetchMock);

    const result = await client.getCharge('order-123');

    expect(globalFetchMock).toHaveBeenCalledWith(
      'https://api.woovi-sandbox.com/api/v1/charge/order-123',
      {
        method: 'GET',
        headers: {
          'Authorization': appId,
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toEqual(mockCharge);
  });
});
