import { describe, it, expect } from 'vitest';
import { sortConversations } from './sort';

describe('sortConversations', () => {
  it('should sort conversations by last_message_at descending', () => {
    const input = [
      { id: '1', last_message_at: '2026-07-25T10:00:00Z' },
      { id: '2', last_message_at: '2026-07-25T11:00:00Z' },
      { id: '3', last_message_at: '2026-07-25T09:00:00Z' },
    ];

    const sorted = sortConversations(input);
    expect(sorted.map((c) => c.id)).toEqual(['2', '1', '3']);
  });

  it('should place conversations with last_message_at above conversations with no messages (null)', () => {
    const input = [
      { id: 'no-msg-1', last_message_at: null, created_at: '2026-07-25T11:30:00Z' },
      { id: 'msg-1', last_message_at: '2026-07-25T10:00:00Z' },
      { id: 'no-msg-2', last_message_at: null, created_at: '2026-07-25T11:45:00Z' },
    ];

    const sorted = sortConversations(input);
    expect(sorted[0].id).toBe('msg-1');
    expect(sorted.map((c) => c.id)).toEqual(['msg-1', 'no-msg-2', 'no-msg-1']);
  });

  it('should update position to top when a conversation receives a new message', () => {
    const prev = [
      { id: 'c1', last_message_at: '2026-07-25T10:00:00Z' },
      { id: 'c2', last_message_at: '2026-07-25T09:00:00Z' },
    ];

    // c2 receives a message at 11:00:00Z
    const updated = prev.map((c) =>
      c.id === 'c2' ? { ...c, last_message_at: '2026-07-25T11:00:00Z' } : c
    );

    const sorted = sortConversations(updated);
    expect(sorted.map((c) => c.id)).toEqual(['c2', 'c1']);
  });
});
