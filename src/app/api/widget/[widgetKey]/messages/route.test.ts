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

vi.mock('@/lib/ai/service', () => ({
  generateAIResponse: vi.fn().mockResolvedValue({
    text: 'Olá! Sou a IA do atendimento. Como posso te ajudar?',
    action: 'reply',
  }),
}));

vi.mock('@/lib/billing/guard', () => ({
  verifyBillingAndUsage: vi.fn().mockResolvedValue({ allowed: true }),
  incrementAIConsumption: vi.fn().mockResolvedValue(undefined),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { generateAIResponse } from '@/lib/ai/service';
import { GET, POST } from './route';

describe('Public Widget Messages API (/api/widget/[widgetKey]/messages)', () => {
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminClient = createAdminClient();
  });

  it('should return empty messages array if visitor has no active conversation', async () => {
    const mockSessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };

    mockAdminClient.from.mockReturnValue(mockSessionChain);

    const req = new Request('http://localhost/api/widget/key-1/messages?visitorToken=vtoken-none');
    const res = await GET(req, { params: Promise.resolve({ widgetKey: 'key-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });

  it('should post a visitor message and update conversation', async () => {
    const mockConfigChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'w-1', account_id: 'acc-1', ai_auto_respond: false } }),
    };

    const mockProfileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'owner-1' } }),
    };

    const mockSessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'sess-1', contact_id: 'c-1', conversation_id: 'conv-1' },
      }),
      update: vi.fn().mockReturnThis(),
    };

    const mockMsgChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'msg-1',
          content_text: 'Olá, preciso de ajuda com um produto!',
          sender_type: 'customer',
          created_at: '2026-07-22T14:00:00Z',
        },
        error: null,
      }),
    };

    const mockConvChain = {
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ai_enabled: false, ai_system_prompt: null } }),
    };

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'chat_widget_configs') return mockConfigChain;
      if (table === 'profiles') return mockProfileChain;
      if (table === 'chat_widget_sessions') return mockSessionChain;
      if (table === 'messages') return mockMsgChain;
      if (table === 'conversations') return mockConvChain;
      return {};
    });

    const req = new Request('http://localhost/api/widget/key-1/messages', {
      method: 'POST',
      body: JSON.stringify({
        visitorToken: 'vtoken-123',
        content: 'Olá, preciso de ajuda com um produto!',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ widgetKey: 'key-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.content).toBe('Olá, preciso de ajuda com um produto!');
    expect(body.message.direction).toBe('inbound');
  });

  it('should trigger AI Autopilot response when ai_enabled is true', async () => {
    const mockConfigChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'w-1', account_id: 'acc-1', ai_auto_respond: false } }),
    };

    const mockProfileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'owner-1' } }),
    };

    const mockSessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'sess-1', contact_id: 'c-1', conversation_id: 'conv-1' },
      }),
    };

    const mockMsgChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'msg-1',
          content_text: 'Quais os horários de atendimento?',
          sender_type: 'customer',
          created_at: '2026-07-22T14:00:00Z',
        },
        error: null,
      }),
    };

    const mockConvChain = {
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ai_enabled: true, ai_system_prompt: 'Responda com atenção' } }),
    };

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'chat_widget_configs') return mockConfigChain;
      if (table === 'profiles') return mockProfileChain;
      if (table === 'chat_widget_sessions') return mockSessionChain;
      if (table === 'messages') return mockMsgChain;
      if (table === 'conversations') return mockConvChain;
      return {};
    });

    const req = new Request('http://localhost/api/widget/key-1/messages', {
      method: 'POST',
      body: JSON.stringify({
        visitorToken: 'vtoken-123',
        content: 'Quais os horários de atendimento?',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ widgetKey: 'key-1' }) });
    expect(res.status).toBe(200);
    expect(generateAIResponse).toHaveBeenCalledWith(
      'Quais os horários de atendimento?',
      'conv-1',
      'acc-1',
      'Responda com atenção',
      true
    );
  });
});
