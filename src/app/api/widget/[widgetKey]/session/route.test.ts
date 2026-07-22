import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => {
  const mockFrom = vi.fn();
  const mockAdminClient = {
    from: mockFrom,
  };

  return {
    createAdminClient: vi.fn(() => mockAdminClient),
  };
});

import { createAdminClient } from '@/lib/supabase/admin';
import { POST } from './route';

describe('Public Widget Session API (/api/widget/[widgetKey]/session)', () => {
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminClient = createAdminClient();
  });

  it('should return 400 if visitorToken is missing', async () => {
    const req = new Request('http://localhost/api/widget/key-123/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ widgetKey: 'key-123' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('visitorToken é obrigatório');
  });

  it('should return 404 if widget key is invalid or inactive', async () => {
    const mockChainConfig = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };

    mockAdminClient.from.mockReturnValue(mockChainConfig);

    const req = new Request('http://localhost/api/widget/invalid-key/session', {
      method: 'POST',
      body: JSON.stringify({ visitorToken: 'vtoken-123' }),
    });

    const res = await POST(req, { params: Promise.resolve({ widgetKey: 'invalid-key' }) });
    expect(res.status).toBe(404);
  });

  it('should register visitor session and link contact/conversation', async () => {
    const mockConfigChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'w-1', account_id: 'acc-1' }, error: null }),
    };

    const mockProfileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'owner-1' }, error: null }),
    };

    const mockSessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sess-1', visitor_token: 'vtoken-123', contact_id: 'c-1', conversation_id: 'conv-1' },
      }),
    };

    const mockContactChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'c-1' } }),
    };

    const mockConvChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'conv-1' } }),
    };

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'chat_widget_configs') return mockConfigChain;
      if (table === 'profiles') return mockProfileChain;
      if (table === 'chat_widget_sessions') return mockSessionChain;
      if (table === 'contacts') return mockContactChain;
      if (table === 'conversations') return mockConvChain;
      return {};
    });

    const req = new Request('http://localhost/api/widget/valid-key/session', {
      method: 'POST',
      body: JSON.stringify({
        visitorToken: 'vtoken-123',
        name: 'Maria Silva',
        email: 'maria@example.com',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ widgetKey: 'valid-key' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contactId).toBe('c-1');
    expect(body.conversationId).toBe('conv-1');
  });
});
