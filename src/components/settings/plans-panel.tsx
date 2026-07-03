"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, CreditCard, Loader2, Sparkles, AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PLANS } from "@/config/plans";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

interface AccountBillingDetails {
  subscription_status: "trial" | "active" | "past_due" | "canceled" | "unpaid";
  subscription_plan: "starter" | "pro" | "scale";
  subscription_expires_at: string | null;
  ai_message_count: number;
  ai_message_limit: number;
  stripe_customer_id: string | null;
  is_lifetime?: boolean;
  lifetime_has_ai?: boolean;
}

export function PlansPanel() {
  const supabase = createClient();
  const { accountId, canEditSettings, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<AccountBillingDetails | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);

  // Fetch the latest account billing details dynamically
  const fetchBillingDetails = async () => {
    if (!accountId) return;
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("subscription_status, subscription_plan, subscription_expires_at, ai_message_count, ai_message_limit, stripe_customer_id, is_lifetime, lifetime_has_ai")
        .eq("id", accountId)
        .single();

      if (error) throw error;
      setBilling(data as unknown as AccountBillingDetails);
    } catch (err) {
      console.error("Failed to load billing:", err);
      toast.error("Erro ao carregar detalhes de faturamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) {
      void fetchBillingDetails();
    }
  }, [accountId]);

  const handleSubscribe = async (planKey: "starter" | "pro" | "scale") => {
    if (!accountId) return;
    if (!canEditSettings) {
      toast.error("Apenas proprietários e administradores podem alterar planos.");
      return;
    }

    if (planKey === "starter" && billing?.stripe_customer_id) {
      toast.info(
        "Para cancelar ou retornar ao plano Starter, gerencie sua assinatura pelo portal de faturamento."
      );
      return;
    }

    setUpgradingPlan(planKey);
    
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Ocorreu um erro ao processar a assinatura.");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error("Error subscribing:", err);
      toast.error(err.message || "Ocorreu um erro ao processar a assinatura.");
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    if (!canEditSettings) {
      toast.error("Apenas proprietários e administradores podem gerenciar o faturamento.");
      return;
    }

    setManagingBilling(true);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Não foi possível carregar o portal do cliente.");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error("Error redirecting to portal:", err);
      toast.error(err.message || "Ocorreu um erro ao abrir o portal de faturamento.");
    } finally {
      setManagingBilling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentPlanKey = billing?.subscription_plan || "starter";
  const currentPlan = PLANS[currentPlanKey];
  const isDelinquent = !billing?.is_lifetime && (billing?.subscription_status === "past_due" || billing?.subscription_status === "unpaid");
  
  // Calculate AI Usage Progress
  const usageCount = billing?.ai_message_count || 0;
  const usageLimit = billing?.ai_message_limit || currentPlan.aiMessageLimit;
  const usagePercent = usageLimit > 0 ? Math.min((usageCount / usageLimit) * 100, 100) : 0;

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Planos e Faturamento"
        description="Gerencie a assinatura do seu workspace, acompanhe o consumo da cota de IA e faça upgrades."
      />

      {/* Lifetime account banner */}
      {billing?.is_lifetime && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary animate-in fade-in-50 duration-300">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Assinatura Vitalícia Ativa (Lifetime)</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Este workspace está configurado com uma conta vitalícia cortesia da administração. Você possui acesso completo à plataforma sem cobranças recorrentes.
              {billing.lifetime_has_ai ? (
                <span className="text-primary font-medium block mt-1">✓ Recursos de Inteligência Artificial estão ativos nesta conta.</span>
              ) : (
                <span className="text-destructive font-medium block mt-1">✗ Recursos de Inteligência Artificial estão desativados para esta assinatura vitalícia.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Subscription Status & Billing Alerts */}
      {isDelinquent && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Pagamento Pendente ou Atrasado</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Identificamos uma pendência na sua última fatura do Stripe. Os recursos de Inteligência Artificial foram temporariamente desativados até que o pagamento seja regularizado.
            </p>
          </div>
        </div>
      )}

      {/* Usage Progress Bar Card */}
      {currentPlanKey !== "starter" && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> Consumo Mensal de IA
              </CardTitle>
              <span className="text-xs text-muted-foreground font-medium">
                {usageCount.toLocaleString()} / {usageLimit.toLocaleString()} mensagens
              </span>
            </div>
            <CardDescription className="text-xs">
              Sua franquia é renovada mensalmente com base no ciclo de faturamento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  usagePercent >= 90
                    ? "bg-destructive"
                    : usagePercent >= 75
                    ? "bg-amber-500"
                    : "bg-primary"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{Math.round(usagePercent)}% utilizado</span>
              {usageCount >= usageLimit && (
                <span className="text-destructive font-semibold">Limite atingido</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans Pricing Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key) => {
          const plan = PLANS[key];
          const isCurrent = key === currentPlanKey;
          const isUpgrading = upgradingPlan === key;

          return (
            <Card
              key={key}
              className={`flex flex-col relative overflow-hidden ${
                isCurrent ? "border-primary/50 shadow-md shadow-primary/5" : "border-border"
              }`}
            >
              {isCurrent && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                  Atual
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-lg font-bold">{plan.name}</CardTitle>
                <div className="mt-2 flex items-baseline gap-1 text-foreground">
                  <span className="text-3xl font-extrabold tracking-tight">R$ {plan.price}</span>
                  <span className="text-sm font-semibold text-muted-foreground">/mês</span>
                </div>
                <CardDescription className="mt-1 text-xs">
                  {plan.aiMessageLimit > 0
                    ? `${plan.aiMessageLimit.toLocaleString()} mensagens de IA inclusas`
                    : "Sem Inteligência Artificial"}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col justify-between pt-0">
                <ul className="space-y-2.5 text-xs text-muted-foreground mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(key as "starter" | "pro" | "scale")}
                  disabled={isCurrent || isUpgrading || !canEditSettings || billing?.is_lifetime}
                  className={`w-full text-xs font-semibold ${
                    isCurrent
                      ? "bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted"
                      : "bg-primary hover:bg-primary/95 text-primary-foreground"
                  }`}
                >
                  {isUpgrading ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Redirecionando...
                    </>
                  ) : isCurrent ? (
                    "Seu Plano Ativo"
                  ) : plan.price > currentPlan.price ? (
                    "Fazer Upgrade"
                  ) : (
                    "Mudar de Plano"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1">
            <CreditCard className="h-4 w-4 text-muted-foreground" /> Cobrança Segura via Stripe
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-lg">
            Sua assinatura é processada de forma segura pelo Stripe. Você pode gerenciar seu histórico de pagamentos, baixar faturas ou cancelar a assinatura a qualquer momento.
          </p>
        </div>
        {billing?.stripe_customer_id && (
          <Button
            variant="outline"
            onClick={handleManageBilling}
            disabled={managingBilling}
            className="text-xs border-border text-foreground hover:bg-muted font-semibold"
          >
            {managingBilling ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Carregando portal...
              </>
            ) : (
              "Gerenciar Assinatura"
            )}
          </Button>
        )}
      </div>
    </section>
  );
}

