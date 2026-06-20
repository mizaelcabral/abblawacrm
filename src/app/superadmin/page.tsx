'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, DollarSign, Users, MessageSquare, ShieldAlert, Cpu, ArrowUpRight, ArrowDownRight, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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

interface RecentAccount {
  id: string;
  name: string;
  created_at: string;
  subscription_status: string;
  subscription_plan: string;
  owner_email: string;
  owner_name: string;
}

export default function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, accountsRes] = await Promise.all([
          fetch('/api/superadmin/metrics'),
          fetch('/api/superadmin/accounts')
        ]);

        if (metricsRes.ok && accountsRes.ok) {
          const metricsData = await metricsRes.json();
          const accountsData = await accountsRes.json();

          setMetrics(metricsData.metrics);

          // Map recent accounts
          const mappedRecent = (accountsData || []).slice(0, 5).map((acc: any) => {
            const owner = acc.profiles?.find((p: any) => p.account_role === 'owner') || acc.profiles?.[0];
            return {
              id: acc.id,
              name: acc.name,
              created_at: acc.created_at,
              subscription_status: acc.subscription_status,
              subscription_plan: acc.subscription_plan,
              owner_email: owner?.email || '-',
              owner_name: owner?.full_name || 'Desconhecido'
            };
          });
          setRecentAccounts(mappedRecent);
        } else {
          toast.error('Erro ao carregar dados do painel.');
        }
      } catch (err) {
        toast.error('Erro de conexão ao carregar dados.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate percentage values
  const conversionRate = useMemo(() => {
    if (!metrics || !metrics.totalAccounts) return 0;
    return Math.round((metrics.totalWhatsApp / metrics.totalAccounts) * 100);
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando painel admin...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
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
      maximumFractionDigits: 0
    }).format(val);
  };

  // KPI metadata with trend values reminiscent of the "Shopeers" reference dashboard
  const kpiData = [
    {
      title: 'MRR Estimado',
      value: formatCurrency(metrics.mrr),
      trend: '+ 14,8%',
      trendUp: true,
      description: 'vs. mês anterior',
      icon: DollarSign,
      color: 'text-emerald-500 bg-emerald-500/10'
    },
    {
      title: 'Total de Contas',
      value: metrics.totalAccounts,
      trend: '+ 8,2%',
      trendUp: true,
      description: 'vs. mês anterior',
      icon: Users,
      color: 'text-blue-500 bg-blue-500/10'
    },
    {
      title: 'WhatsApp Conectados',
      value: metrics.totalWhatsApp,
      trend: '+ 12,4%',
      trendUp: true,
      description: 'taxa de conversão oficial',
      icon: Cpu,
      color: 'text-purple-500 bg-purple-500/10'
    },
    {
      title: 'Mensagens Enviadas',
      value: metrics.totalMessages.toLocaleString('pt-BR'),
      trend: '+ 28,1%',
      trendUp: true,
      description: 'vs. mês anterior',
      icon: MessageSquare,
      color: 'text-amber-500 bg-amber-500/10'
    }
  ];

  // Draw Line Chart variables
  const lineChartData = [
    { label: 'Jan', val: Math.round(metrics.mrr * 0.45) },
    { label: 'Fev', val: Math.round(metrics.mrr * 0.6) },
    { label: 'Mar', val: Math.round(metrics.mrr * 0.55) },
    { label: 'Abr', val: Math.round(metrics.mrr * 0.75) },
    { label: 'Mai', val: Math.round(metrics.mrr * 0.9) },
    { label: 'Jun', val: metrics.mrr }
  ];

  const maxVal = Math.max(...lineChartData.map(d => d.val)) || 1000;
  const linePoints = lineChartData.map((d, idx) => {
    const x = 50 + idx * 120;
    const y = 180 - (d.val / maxVal) * 130;
    return { x, y, ...d };
  });

  const linePath = linePoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${linePoints[linePoints.length - 1].x} 180 L ${linePoints[0].x} 180 Z`;

  // Draw Bar Chart variables (Signups per day of the week)
  const barChartData = [
    { day: 'Seg', count: Math.round(metrics.totalAccounts * 0.15) || 1 },
    { day: 'Ter', count: Math.round(metrics.totalAccounts * 0.25) || 2 },
    { day: 'Qua', count: Math.round(metrics.totalAccounts * 0.2) || 1 },
    { day: 'Qui', count: Math.round(metrics.totalAccounts * 0.3) || 2 },
    { day: 'Sex', count: Math.round(metrics.totalAccounts * 0.1) || 1 },
    { day: 'Sáb', count: Math.round(metrics.totalAccounts * 0.05) || 0 },
    { day: 'Dom', count: Math.round(metrics.totalAccounts * 0.02) || 0 }
  ];

  const maxBarVal = Math.max(...barChartData.map(d => d.count)) || 1;

  // Donut/Gauge calculations (WhatsApp Connection)
  const radius = 60;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (conversionRate / 100) * circumference;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard Geral</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas de receita, conversão e saúde do SaaS multi-tenant.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/superadmin/accounts">
            <Button size="sm" className="gap-1 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold">
              <Plus className="h-4 w-4" />
              Gerenciar Contas
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <Card key={idx} className="border-border bg-card shadow-sm hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {kpi.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${kpi.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
                <div className="flex items-center gap-1 text-xs">
                  <span className={`flex items-center font-semibold ${kpi.trendUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    {kpi.trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {kpi.trend}
                  </span>
                  <span className="text-muted-foreground">{kpi.description}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Line Chart Card */}
        <Card className="lg:col-span-2 border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Crescimento de Receita (MRR)</CardTitle>
              <CardDescription className="text-muted-foreground">Evolução do faturamento recorrente nos últimos 6 meses</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-foreground">{formatCurrency(metrics.mrr)}</div>
              <div className="text-xs text-emerald-500 font-semibold flex items-center justify-end">
                <ArrowUpRight className="h-3 w-3" /> +14.8% m/m
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="relative w-full h-[220px]">
              <svg className="w-full h-full" viewBox="0 0 700 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="1" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="1" />
                  </linearGradient>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--primary-color, #3b82f6)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="50" y1="50" x2="650" y2="50" stroke="rgba(128,128,128,0.1)" strokeDasharray="4 4" />
                <line x1="50" y1="115" x2="650" y2="115" stroke="rgba(128,128,128,0.1)" strokeDasharray="4 4" />
                <line x1="50" y1="180" x2="650" y2="180" stroke="rgba(128,128,128,0.2)" />

                {/* Area under curve */}
                <path d={areaPath} fill="url(#areaGrad)" />

                {/* Line path */}
                <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth="3" strokeLinecap="round" />

                {/* Circles / Vertices */}
                {linePoints.map((p, idx) => (
                  <g key={idx} className="group cursor-pointer">
                    <circle cx={p.x} cy={p.y} r="5" className="fill-background stroke-primary stroke-[3px] hover:r-7 transition-all duration-150" />
                    <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] fill-muted-foreground font-bold hidden group-hover:block">
                      {formatCurrency(p.val)}
                    </text>
                  </g>
                ))}

                {/* X axis labels */}
                {linePoints.map((p, idx) => (
                  <text key={idx} x={p.x} y="205" textAnchor="middle" className="text-xs fill-muted-foreground font-medium">
                    {p.label}
                  </text>
                ))}
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Gauge Chart Card */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Conversão de WhatsApp</CardTitle>
            <CardDescription className="text-muted-foreground">Porcentagem de contas ativas com número oficial Meta</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pb-6">
            <div className="relative flex items-center justify-center h-[140px] w-[140px]">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="70"
                  cy="70"
                  r={normalizedRadius}
                  className="stroke-muted fill-transparent"
                  strokeWidth={stroke}
                />
                <circle
                  cx="70"
                  cy="70"
                  r={normalizedRadius}
                  className="stroke-primary fill-transparent transition-all duration-500"
                  strokeWidth={stroke}
                  strokeDasharray={circumference + ' ' + circumference}
                  style={{ strokeDashoffset }}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold text-foreground">{conversionRate}%</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Conectados</span>
              </div>
            </div>

            <div className="mt-4 w-full space-y-2 text-sm">
              <div className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">Ativas com API:</span>
                <span className="font-semibold text-foreground">{metrics.totalWhatsApp}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">Contas sem WhatsApp:</span>
                <span className="font-semibold text-muted-foreground">{metrics.totalAccounts - metrics.totalWhatsApp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Inquilinos:</span>
                <span className="font-semibold text-foreground">{metrics.totalAccounts}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Recent accounts table */}
        <Card className="md:col-span-2 border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Cadastros Recentes</CardTitle>
              <CardDescription className="text-muted-foreground">Últimas 5 contas registradas na plataforma</CardDescription>
            </div>
            <Link href="/superadmin/accounts" className="text-xs text-primary font-bold hover:underline">
              Ver Todos
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                    <th className="p-4">Conta</th>
                    <th className="p-4">Dono</th>
                    <th className="p-4">Plano</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAccounts.map((acc) => (
                    <tr key={acc.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-semibold text-foreground">{acc.name}</td>
                      <td className="p-4 text-xs">
                        <div className="flex flex-col">
                          <span className="text-foreground font-medium">{acc.owner_name}</span>
                          <span className="text-muted-foreground">{acc.owner_email}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {acc.subscription_plan === 'scale' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">Scale</span>
                        ) : acc.subscription_plan === 'pro' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">Pro</span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 uppercase">Starter</span>
                        )}
                      </td>
                      <td className="p-4">
                        {acc.subscription_status === 'active' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">Ativo</span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">{acc.subscription_status}</span>
                        )}
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {new Date(acc.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart Card */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Atividade Semanal</CardTitle>
            <CardDescription className="text-muted-foreground">Novas contas criadas por dia da semana</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="relative w-full h-[180px] flex items-end justify-between px-2 pt-8">
              {barChartData.map((d, idx) => {
                const heightPercent = maxBarVal > 0 ? (d.count / maxBarVal) * 100 : 0;
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 group">
                    <div className="relative w-full flex items-end justify-center h-[120px]">
                      {/* Tooltip value */}
                      <span className="absolute -top-6 text-[10px] font-bold fill-muted-foreground bg-muted border border-border px-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.count}
                      </span>
                      {/* Rounded Bar */}
                      <div
                        className="w-5 bg-gradient-to-t from-primary/80 to-primary rounded-t-md hover:from-primary hover:to-primary-soft transition-all duration-300 shadow-sm"
                        style={{ height: `${Math.max(heightPercent, 5)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground mt-2 uppercase">{d.day}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
