import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => {
  const mockQueryChain = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };

  const client = {
    from: vi.fn().mockReturnValue(mockQueryChain),
  };

  // Expose to global scope during module resolution
  (globalThis as any)._supabaseMockClientVerify = client;
  (globalThis as any)._supabaseMockQueryChainVerify = mockQueryChain;

  return {
    createClient: vi.fn(() => client),
  };
});

// Import POST after the mock setup
import { POST } from './route';

describe('POST /api/shop/verify-password', () => {
  let mockQueryChain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryChain = (globalThis as any)._supabaseMockQueryChainVerify;
    // Re-bind method chaining just in case
    mockQueryChain.select.mockReturnThis();
    mockQueryChain.or.mockReturnThis();
    mockQueryChain.eq.mockReturnThis();
  });

  it('should return 400 if tenantSlug or password is missing', async () => {
    const req = new Request('http://localhost/api/shop/verify-password', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug: 'test' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('tenantSlug and password are required');
  });

  it('should return success: true if password matches', async () => {
    const req = new Request('http://localhost/api/shop/verify-password', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug: 'myslug', password: 'correct-password' }),
    });
    mockQueryChain.maybeSingle.mockResolvedValue({
      data: { store_password: 'correct-password' },
      error: null,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockQueryChain.eq).toHaveBeenCalledWith('store_slug', 'myslug');
  });

  it('should return success: false and 401 if password does not match', async () => {
    const req = new Request('http://localhost/api/shop/verify-password', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug: 'myslug', password: 'wrong-password' }),
    });
    mockQueryChain.maybeSingle.mockResolvedValue({
      data: { store_password: 'correct-password' },
      error: null,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Senha incorreta');
  });

  it('should return 404 if store is not found', async () => {
    const req = new Request('http://localhost/api/shop/verify-password', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug: 'nonexistent', password: 'pass' }),
    });
    mockQueryChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Store not found');
  });

  it('should return 500 on db error', async () => {
    const req = new Request('http://localhost/api/shop/verify-password', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug: 'test', password: 'pass' }),
    });
    mockQueryChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB Failure' } });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB Failure');
  });
});
