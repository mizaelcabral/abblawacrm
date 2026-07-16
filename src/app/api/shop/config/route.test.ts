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
  (globalThis as any)._supabaseMockClient = client;
  (globalThis as any)._supabaseMockQueryChain = mockQueryChain;

  return {
    createClient: vi.fn(() => client),
  };
});

// Import GET after the mock setup
import { GET } from './route';

describe('GET /api/shop/config', () => {
  let mockQueryChain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryChain = (globalThis as any)._supabaseMockQueryChain;
    // Re-bind method chaining just in case
    mockQueryChain.select.mockReturnThis();
    mockQueryChain.or.mockReturnThis();
    mockQueryChain.eq.mockReturnThis();
  });

  it('should return 400 if tenantSlug is missing', async () => {
    const req = new Request('http://localhost/api/shop/config');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('tenantSlug is required');
  });

  it('should retrieve by UUID if tenantSlug is a UUID', async () => {
    const uuid = '12345678-1234-1234-1234-1234567890ab';
    const req = new Request(`http://localhost/api/shop/config?tenantSlug=${uuid}`);
    mockQueryChain.maybeSingle.mockResolvedValue({
      data: {
        account_id: uuid,
        onboarding_status: 'completed',
        default_shipping_fee: 10,
        store_name: 'My Store',
        store_slug: 'my-store',
        store_description: 'Desc',
        store_logo_url: 'logo.png',
        password_protected: false,
        app_id: 'app123',
        secret_key: 'secret123',
        store_password: 'pass',
      },
      error: null,
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account_id).toBe(uuid);
    expect(body.store_name).toBe('My Store');
    expect(body.app_id).toBeUndefined(); // should be omitted
    expect(body.secret_key).toBeUndefined(); // should be omitted
    expect(body.store_password).toBeUndefined(); // should be omitted
    expect(body.has_app_id).toBe(true);
    expect(mockQueryChain.or).toHaveBeenCalledWith(`account_id.eq.${uuid},store_slug.eq.${uuid}`);
  });

  it('should retrieve by slug if tenantSlug is not a UUID', async () => {
    const slug = 'my-custom-slug';
    const req = new Request(`http://localhost/api/shop/config?tenantSlug=${slug}`);
    mockQueryChain.maybeSingle.mockResolvedValue({
      data: {
        account_id: 'some-uuid',
        onboarding_status: 'completed',
        default_shipping_fee: 10,
        store_name: 'My Store',
        store_slug: slug,
        store_description: 'Desc',
        store_logo_url: 'logo.png',
        password_protected: false,
        app_id: null,
        secret_key: null,
        store_password: null,
      },
      error: null,
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.store_slug).toBe(slug);
    expect(body.has_app_id).toBe(false);
    expect(mockQueryChain.eq).toHaveBeenCalledWith('store_slug', slug);
  });

  it('should return 404 if store not found', async () => {
    const req = new Request('http://localhost/api/shop/config?tenantSlug=nonexistent');
    mockQueryChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Store not found');
  });

  it('should return 500 on db error', async () => {
    const req = new Request('http://localhost/api/shop/config?tenantSlug=test');
    mockQueryChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB Failure' } });

    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB Failure');
  });
});
