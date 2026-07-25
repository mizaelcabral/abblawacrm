export function sortConversations<
  T extends {
    last_message_at?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  }
>(conversations: T[]): T[] {
  return [...conversations].sort((a, b) => {
    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;

    // 1. Both have last_message_at -> newest message first
    if (timeA > 0 && timeB > 0) {
      return timeB - timeA;
    }
    // 2. Only A has last_message_at -> A ranks above B
    if (timeA > 0) return -1;
    // 3. Only B has last_message_at -> B ranks above A
    if (timeB > 0) return 1;

    // 4. Neither has last_message_at -> fallback to updated_at / created_at descending
    const fallbackA = new Date(a.updated_at || a.created_at || 0).getTime();
    const fallbackB = new Date(b.updated_at || b.created_at || 0).getTime();
    return fallbackB - fallbackA;
  });
}
