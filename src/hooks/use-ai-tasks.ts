"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AiTask {
  id: string;
  account_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "review_required" | "completed";
  due_at: string | null;
  assigned_agent_id: string | null;
  is_ai_task: boolean;
  ai_draft: string | null;
  created_at: string;
  updated_at: string;
  contact?: {
    name: string | null;
    phone: string | null;
  } | null;
}

export function useAiTasks(accountId: string | null) {
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!accountId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("tasks")
      .select("*, contact:contacts(name, phone)")
      .eq("account_id", accountId)
      .eq("is_ai_task", true)
      .eq("status", "review_required")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTasks(data as AiTask[]);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;

    fetchTasks();

    const supabase = createClient();
    const channel = supabase
      .channel("ai-tasks-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          // Re-fetch all matching tasks to ensure relations (contacts) are resolved properly
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, fetchTasks]);

  return { tasks, loading, refetch: fetchTasks };
}
