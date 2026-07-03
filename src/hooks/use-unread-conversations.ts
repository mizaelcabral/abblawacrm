"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types";

export function useUnreadConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUnread = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contact:contacts(name, phone)")
      .gt("unread_count", 0)
      .order("last_message_at", { ascending: false })
      .limit(5);

    if (!error && data) {
      setConversations(data as Conversation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUnread();

    const supabase = createClient();
    const channel = supabase
      .channel("unread-conversations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnread]);

  return { conversations, loading, refetch: fetchUnread };
}
