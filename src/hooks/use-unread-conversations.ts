"use client";

import { useEffect, useRef, useState, useCallback, startTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types";

const MAX_UNREAD = 5;

/** Derive the top-N unread conversations from the local map, newest first. */
function topUnread(map: Map<string, Conversation>): Conversation[] {
  return [...map.values()]
    .filter((c) => (c.unread_count ?? 0) > 0)
    .sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, MAX_UNREAD);
}

export function useUnreadConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Live mirror of all conversations — lets realtime events update state
  // in O(1) without re-querying the database.
  const mapRef = useRef<Map<string, Conversation>>(new Map());

  const fetchUnread = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .gt("unread_count", 0)
      .order("last_message_at", { ascending: false })
      .limit(MAX_UNREAD);

    if (!error && data) {
      // Seed the mirror with the initial fetch results
      for (const row of data as Conversation[]) {
        mapRef.current.set(row.id, row);
      }
      startTransition(() => {
        setConversations(data as Conversation[]);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnread();

    const supabase = createClient();
    const channelId = `unread-conversations-realtime-${Math.random().toString(36).substring(2, 11)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          const map = mapRef.current;

          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Conversation>;
            if (old.id) map.delete(old.id);
          } else {
            const row = payload.new as Conversation;
            if ((row.unread_count ?? 0) > 0) {
              // Merge with existing entry to preserve joined contact data
              const existing = map.get(row.id);
              map.set(row.id, { ...existing, ...row });
            } else {
              // No longer unread — remove from the visible list
              map.delete(row.id);
            }
          }

          startTransition(() => {
            setConversations(topUnread(map));
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnread]);

  return { conversations, loading, refetch: fetchUnread };
}
