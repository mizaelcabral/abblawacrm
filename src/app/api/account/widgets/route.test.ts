import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => {
  const mockFrom = vi.fn();
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: mockFrom,
  };

  return {
    createClient: vi.fn(() => Promise.resolve(mockSupabase)),
  };
});

import { createClient } from '@/lib/supabase/server';
import { GET, POST, PATCH } from './route';

describe('Account Widgets API (/api/account/widgets)', () => {
  let mockSupabase: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSupabase = await createClient();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should return widgets list for authorized user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const mockChainProfile = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { account_id: 'acc-123' }, error: null }),
    };

    const mockChainWidgets = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'w-1', name: 'Widget 1', widget_key: 'key-1' }],
        error: null,
      }),
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChainProfile;
      if (table === 'chat_widget_configs') return mockChainWidgets;
      return {};
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.widgets).toHaveLength(1);
    expect(body.widgets[0].name).toBe('Widget 1');
  });

  it('should create a new widget via POST', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const mockChainProfile = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { account_id: 'acc-123' }, error: null }),
    };

    const mockChainInsert = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'w-new',
          account_id: 'acc-123',
          name: 'Novo Widget',
          widget_key: 'key-new',
        },
        error: null,
      }),
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') return mockChainProfile;
      if (table === 'chat_widget_configs') return mockChainInsert;
      return {};
    });

    const req = new Request('http://localhost/api/account/widgets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Novo Widget', primary_color: '#25D366' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.widget.name).toBe('Novo Widget');
    expect(body.widget.widget_key).toBe('key-new');
  });
});
