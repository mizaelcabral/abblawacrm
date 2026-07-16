import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock Supabase admin client
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(),
}));

describe('superadmin/ecommerce/onboardings route', () => {
  let mockSupabase: any;
  let mockAdmin: any;
  let supabaseQueryChain: any;
  let adminQueryChain: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    // Setup mock query chains for chaining builders
    supabaseQueryChain = {};
    supabaseQueryChain.select = vi.fn().mockReturnValue(supabaseQueryChain);
    supabaseQueryChain.eq = vi.fn().mockReturnValue(supabaseQueryChain);
    supabaseQueryChain.maybeSingle = vi.fn();

    adminQueryChain = {};
    adminQueryChain.select = vi.fn().mockReturnValue(adminQueryChain);
    adminQueryChain.eq = vi.fn().mockReturnValue(adminQueryChain);
    adminQueryChain.order = vi.fn().mockReturnValue(adminQueryChain);
    adminQueryChain.update = vi.fn().mockReturnValue(adminQueryChain);
    adminQueryChain.maybeSingle = vi.fn();

    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn().mockReturnValue(supabaseQueryChain),
    };

    // Default admin mock: returns null for super_admin_config (triggers env fallback in test mode)
    mockAdmin = {
      from: vi.fn().mockReturnValue(adminQueryChain),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
    vi.mocked(supabaseAdmin).mockReturnValue(mockAdmin as any);
  });

  describe('GET', () => {
    it('deve retornar 401 se nao autenticado', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('No user') });

      const response = await GET();
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('deve retornar 403 se o profile nao for super_admin', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      supabaseQueryChain.maybeSingle.mockResolvedValue({ data: { role: 'user' }, error: null });

      const response = await GET();
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('deve retornar lista de onboardings pendentes se super_admin', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      supabaseQueryChain.maybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });

      const mockOnboardings = [
        { id: '1', account_id: 'acc-1', onboarding_status: 'pending_approval', accounts: { name: 'Conta 1' } }
      ];
      adminQueryChain.order.mockResolvedValue({ data: mockOnboardings, error: null });

      const response = await GET();
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockOnboardings);
    });
  });

  describe('POST', () => {
    it('deve rejeitar e atualizar status para none', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      supabaseQueryChain.maybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });

      const reqBody = { accountId: 'acc-1', action: 'reject' };
      const req = new Request('http://localhost/api/superadmin/ecommerce/onboardings', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      });

      adminQueryChain.maybeSingle.mockResolvedValue({ data: { account_id: 'acc-1', onboarding_status: 'none' }, error: null });

      const response = await POST(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.onboarding_status).toBe('none');
    });

    it('deve aprovar no modo manual se appId for passado', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      supabaseQueryChain.maybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });

      const reqBody = { accountId: 'acc-1', action: 'approve', appId: 'app-manual-123', secretKey: 'secret-manual-123' };
      const req = new Request('http://localhost/api/superadmin/ecommerce/onboardings', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      });

      adminQueryChain.maybeSingle.mockResolvedValue({ data: { account_id: 'acc-1', onboarding_status: 'approved', app_id: 'app-manual-123', secret_key: 'secret-manual-123' }, error: null });

      const response = await POST(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.app_id).toBe('app-manual-123');
    });

    it('deve retornar erro 400 se master app id nao configurado no modo automatico', async () => {
      // In test mode, getWooviMasterAppId() reads from process.env
      const originalMasterAppId = process.env.WOOVI_MASTER_APP_ID;
      delete process.env.WOOVI_MASTER_APP_ID;

      // Also mock the DB to return null (no config in DB either)
      mockAdmin.from.mockImplementation((table: string) => {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        chain.update = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        return chain;
      });

      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      supabaseQueryChain.maybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });

      const reqBody = { accountId: 'acc-1', action: 'approve', pixKey: 'my-pix-key' };
      const req = new Request('http://localhost/api/superadmin/ecommerce/onboardings', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('Master App ID');

      if (originalMasterAppId) {
        process.env.WOOVI_MASTER_APP_ID = originalMasterAppId;
      }
    });

    it('deve aprovar no modo automatico chamando Woovi API', async () => {
      process.env.WOOVI_MASTER_APP_ID = 'master-sandbox-key-123';

      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      supabaseQueryChain.maybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });

      const reqBody = { accountId: 'acc-1', action: 'approve', pixKey: 'my-pix-key' };
      const req = new Request('http://localhost/api/superadmin/ecommerce/onboardings', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      });

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          const accountsChain: any = {};
          accountsChain.select = vi.fn().mockReturnValue(accountsChain);
          accountsChain.eq = vi.fn().mockReturnValue(accountsChain);
          accountsChain.maybeSingle = vi.fn().mockResolvedValue({ data: { name: 'Conta Automatica' }, error: null });
          return accountsChain;
        } else if (table === 'woovi_config') {
          const configChain: any = {};
          configChain.update = vi.fn().mockReturnValue(configChain);
          configChain.eq = vi.fn().mockReturnValue(configChain);
          configChain.select = vi.fn().mockReturnValue(configChain);
          configChain.maybeSingle = vi.fn().mockResolvedValue({
            data: { account_id: 'acc-1', onboarding_status: 'approved', app_id: 'master-sandbox-key-123', secret_key: 'my-pix-key' },
            error: null,
          });
          return configChain;
        }
        return adminQueryChain;
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ subAccount: { pixKey: 'my-pix-key' } }),
        status: 200,
      });
      vi.stubGlobal('fetch', fetchMock);

      const response = await POST(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.woovi-sandbox.com/api/v1/subaccount',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'master-sandbox-key-123',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Conta Automatica',
            pixKey: 'my-pix-key',
          }),
        })
      );
    });
  });
});
