"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadConversations } from "@/hooks/use-unread-conversations";
import { useAiTasks } from "@/hooks/use-ai-tasks";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  CreditCard,
  Check,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return formatDistanceToNow(d, {
      addSuffix: true,
      locale: ptBR,
    });
  } catch (e) {
    return "";
  }
}

export function NotificationMenu() {
  const { account } = useAuth();
  const totalUnread = useTotalUnread();
  const { conversations, refetch: refetchConversations } = useUnreadConversations();
  const { tasks: aiTasks, refetch: refetchTasks } = useAiTasks(account?.id ?? null);
  const [activeTab, setActiveTab] = useState<string>("messages");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalNotifications = totalUnread + aiTasks.length;

  // Calculo do Trial
  let trialDaysLeft: number | null = null;
  if (account?.subscription_status === "trial" && account.subscription_expires_at) {
    const expiresAt = new Date(account.subscription_expires_at);
    if (!isNaN(expiresAt.getTime())) {
      const diffTime = expiresAt.getTime() - new Date().getTime();
      trialDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (trialDaysLeft < 0) trialDaysLeft = 0;
    }
  }

  // Cotas de IA
  const aiCount = account?.ai_message_count ?? 0;
  const aiLimit = account?.ai_message_limit ?? 0;
  const aiUsagePercent = aiLimit > 0 ? Math.min((aiCount / aiLimit) * 100, 100) : 0;
  const isHighUsage = aiUsagePercent >= 80;

  // Avisos de Pagamento
  const isPastDue = account?.subscription_status === "past_due" || account?.subscription_status === "unpaid";

  if (!mounted) {
    return (
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
      </button>
    );
  }

  const handleApproveTask = async (taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setApprovingId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
      if (response.ok) {
        toast.success("Tarefa aprovada com sucesso!");
        refetchTasks();
      } else {
        toast.error("Falha ao aprovar tarefa.");
      }
    } catch (err) {
      toast.error("Erro de conexão ao aprovar tarefa.");
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Abrir notificações"
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
      >
        <Bell className="h-5 w-5" />
        {totalNotifications > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-pulse">
            {totalNotifications}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0 overflow-hidden bg-popover border border-border rounded-lg shadow-lg">
        <PopoverHeader className="px-4 py-3 border-b border-border">
          <PopoverTitle className="text-base font-semibold flex items-center justify-between">
            <span>Notificações</span>
            {totalNotifications > 0 && (
              <Badge variant="destructive" className="h-5 text-[11px]">
                {totalNotifications} novas
              </Badge>
            )}
          </PopoverTitle>
        </PopoverHeader>

        <div className="p-3 border-b border-border bg-muted/20">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="messages" className="text-xs">
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Mensagens ({totalUnread})
              </TabsTrigger>
              <TabsTrigger value="ai-tasks" className="text-xs">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                IA Sugestões ({aiTasks.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="messages" className="mt-3">
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {conversations.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma mensagem não lida
                  </div>
                ) : (
                  conversations.map((c) => (
                    <Link
                      key={c.id}
                      href={`/inbox?conversation_id=${c.id}`}
                      className="block p-2 rounded-md hover:bg-muted/70 transition-colors border border-transparent hover:border-border"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-foreground truncate max-w-[180px]">
                          {c.contact?.name || "Contato Desconhecido"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(c.last_message_at)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.last_message_text || "Sem mensagens"}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="ai-tasks" className="mt-3">
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {aiTasks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma sugestão da IA pendente
                  </div>
                ) : (
                  aiTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-2 rounded-md border border-border bg-card hover:bg-muted/20 transition-all"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div>
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wider mb-0.5">
                            <Sparkles className="h-2.5 w-2.5" /> IA Sugeriu
                          </span>
                          <h4 className="font-semibold text-xs text-foreground leading-tight">
                            {t.title}
                          </h4>
                        </div>
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {formatTimeAgo(t.created_at)}
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">
                          {t.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleApproveTask(t.id, e)}
                          disabled={approvingId === t.id}
                          className="flex items-center justify-center gap-1 h-6 px-2 text-[10px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          Aprovar
                        </button>
                        <Link
                          href="/tasks"
                          className="flex items-center justify-center gap-1 h-6 px-2 text-[10px] font-medium border border-input rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          Ver
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Rodapé - Faturamento e Cotas */}
        <div className="p-3 bg-muted/30 space-y-2.5 border-t border-border text-xs">
          {/* Cota de IA */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" /> Uso de Créditos IA
              </span>
              <span className="font-semibold">
                {aiCount} / {aiLimit}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isHighUsage ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${aiUsagePercent}%` }}
              />
            </div>
          </div>

          {/* Avisos Importantes / Trial / Pagamento */}
          {isPastDue && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[11px] leading-tight">Pagamento Pendente</p>
                <p className="text-[10px] leading-snug">
                  Identificamos uma pendência financeira na sua conta. Evite interrupções.
                </p>
                <Link
                  href="/settings?tab=billing"
                  className="inline-flex items-center gap-1 text-[10px] font-bold underline hover:text-destructive/80 mt-0.5"
                >
                  <CreditCard className="h-3 w-3" /> Regularizar Assinatura
                </Link>
              </div>
            </div>
          )}

          {!isPastDue && trialDaysLeft !== null && (
            <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 rounded-md">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[11px] leading-tight">Período de Testes</p>
                <p className="text-[10px] leading-snug">
                  Seu período grátis de 7 dias expira em {trialDaysLeft === 0 ? "hoje" : `${trialDaysLeft} ${trialDaysLeft === 1 ? "dia" : "dias"}`}.
                </p>
                <Link
                  href="/settings?tab=billing"
                  className="inline-flex items-center gap-1 text-[10px] font-bold underline hover:opacity-90 mt-0.5"
                >
                  Assinar Plano <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
