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
    const createGenericChain = (defaultSingleData: any = null) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: defaultSingleData, error: null }),
      single: vi.fn().mockResolvedValue({ data: defaultSingleData, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    });

    const mockConfigChain = createGenericChain({ id: 'w-1', account_id: 'acc-1' });
    const mockProfileChain = createGenericChain({ user_id: 'owner-1' });
    const mockSessionChain = createGenericChain({ id: 'sess-1', visitor_token: 'vtoken-123', contact_id: 'c-1', conversation_id: 'conv-1' });
    const mockContactChain = createGenericChain({ id: 'c-1' });
    const mockConvChain = createGenericChain({ id: 'conv-1' });
    const mockPipelineChain = createGenericChain([{ id: 'pipe-1' }]);
    const mockStageChain = createGenericChain([{ id: 'stage-1' }]);
    const mockDealChain = createGenericChain({ id: 'deal-1' });

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'chat_widget_configs') return mockConfigChain;
      if (table === 'profiles') return mockProfileChain;
      if (table === 'chat_widget_sessions') return mockSessionChain;
      if (table === 'contacts') return mockContactChain;
      if (table === 'conversations') return mockConvChain;
      if (table === 'pipelines') return mockPipelineChain;
      if (table === 'pipeline_stages') return mockStageChain;
      if (table === 'deals') return mockDealChain;
      return createGenericChain();
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
