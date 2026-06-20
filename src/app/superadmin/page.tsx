'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, DollarSign, Users, MessageSquare, ShieldAlert, Cpu } from 'lucide-react';
import { toast } from 'sonner';

interface DashboardMetrics {
  totalAccounts: number;
  totalUsers: number;
  totalWhatsApp: number;
  totalMessages: number;
  mrr: number;
  plans: {
    starter: number;
    pro: number;
    scale: number;
  };
}

export default function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/superadmin/metrics');
        if (res.ok) {
          const data = await res.json();
          setMetrics(data.metrics);
        } else {
          toast.error('Erro ao carregar dados do painel.');
        }
      } catch (err) {
        toast.error('Erro de conexão ao carregar dados.');
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-10">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-3" />
        <h3 className="text-lg font-semibold">Erro ao Inicializar</h3>
        <p className="text-muted-foreground text-sm">Não foi possível carregar as métricas de administração.</p>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const kpis = [
    {
      title: 'Faturamento Estimado (MRR)',
      value: formatCurrency(metrics.mrr),
      description: 'MRR estimado com assinaturas ativas',
      icon: DollarSign,
      color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      title: 'Total de Contas (Tenants)',
      value: metrics.totalAccounts,
      description: `Starter: ${metrics.plans.starter} | Pro: ${metrics.plans.pro} | Scale: ${metrics.plans.scale}`,
      icon: Users,
      color: 'text-blue-500 bg-blue-500/10',
    },
    {
      title: 'Contas com WhatsApp',
      value: metrics.totalWhatsApp,
      description: 'Números oficiais Meta conectados',
      icon: Cpu,
      color: 'text-purple-500 bg-purple-500/10',
    },
    {
      title: 'Total de Mensagens',
      value: metrics.totalMessages.toLocaleString('pt-BR'),
      description: 'Mensagens trafegadas na plataforma',
      icon: MessageSquare,
      color: 'text-amber-500 bg-amber-500/10',
    },
  ];

  const totalPlans = metrics.plans.starter + metrics.plans.pro + metrics.plans.scale || 1;
  const getPercentage = (count: number) => Math.round((count / totalPlans) * 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Visão Geral do SaaS</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitoramento e consolidação de métricas globais da Abbla CRM.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <Card key={idx} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {kpi.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${kpi.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Distribution of plans */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Distribuição de Planos</CardTitle>
            <CardDescription className="text-muted-foreground">
              Proporção de contas registradas por nível de assinatura.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Scale Plan bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-purple-400">Scale (R$ 497/mês)</span>
                <span className="text-muted-foreground">
                  {metrics.plans.scale} ({getPercentage(metrics.plans.scale)}%)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${getPercentage(metrics.plans.scale)}%` }}
                />
              </div>
            </div>

            {/* Pro Plan bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-blue-400">Pro (R$ 249/mês)</span>
                <span className="text-muted-foreground">
                  {metrics.plans.pro} ({getPercentage(metrics.plans.pro)}%)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${getPercentage(metrics.plans.pro)}%` }}
                />
              </div>
            </div>

            {/* Starter Plan bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-zinc-400">Starter (R$ 97/mês)</span>
                <span className="text-muted-foreground">
                  {metrics.plans.starter} ({getPercentage(metrics.plans.starter)}%)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-500 rounded-full transition-all duration-500"
                  style={{ width: `${getPercentage(metrics.plans.starter)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System info */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Informações de Integração</CardTitle>
            <CardDescription className="text-muted-foreground">
              Dados consolidados de uso e conexões de IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Média de Mensagens / Conta:</span>
              <span className="font-semibold text-foreground">
                {metrics.totalAccounts ? Math.round(metrics.totalMessages / metrics.totalAccounts) : 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Taxa de Conexão WhatsApp:</span>
              <span className="font-semibold text-foreground">
                {metrics.totalAccounts ? `${Math.round((metrics.totalWhatsApp / metrics.totalAccounts) * 100)}%` : '0%'}
              </span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-muted-foreground">Faturamento Máximo Potencial:</span>
              <span className="font-semibold text-emerald-400">
                {formatCurrency(
                  metrics.plans.scale * 497 + metrics.plans.pro * 249 + metrics.plans.starter * 97
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
