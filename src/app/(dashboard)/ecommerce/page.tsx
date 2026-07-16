'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { WooviConfig, Order } from '@/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ShoppingBag,
  Clock,
  TrendingUp,
  CreditCard,
  Building,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileText,
  DollarSign,
  Layers,
  Sparkles,
  BarChart3,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

export default function EcommerceOverviewPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WooviConfig | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    paidOrdersCount: 0,
    averageTicket: 0,
    pendingOrdersCount: 0,
  });

  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [appId, setAppId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [defaultShippingFee, setDefaultShippingFee] = useState('0.00');
  const [storeDescription, setStoreDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [requestedPixKey, setRequestedPixKey] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [storePassword, setStorePassword] = useState('');

  const loadData = useCallback(async () => {
    if (!accountId) return;

    try {
      setLoading(true);

      // 1. Fetch Woovi configuration
      const { data: configData, error: configError } = await supabase
        .from('woovi_config')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();

      if (configError) throw configError;

      if (configData) {
        setConfig(configData);
        setAppId(configData.app_id || '');
        setSecretKey(configData.secret_key || '');
        setDefaultShippingFee(Number(configData.default_shipping_fee || 0).toFixed(2));
        setStoreDescription(configData.store_description || '');
        setLogoUrl(configData.store_logo_url || '');
        setRequestedPixKey(configData.requested_pix_key || '');
        setStoreName(configData.store_name || '');
        setStoreSlug(configData.store_slug || '');
        setPasswordProtected(!!configData.password_protected);
        setStorePassword(configData.store_password || '');

        // 2. Fetch Orders metrics only if approved
        if (configData.onboarding_status === 'approved') {
          const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('account_id', accountId)
            .order('created_at', { ascending: false });

          if (ordersError) throw ordersError;

          if (ordersData) {
            setOrders(ordersData);

            const paidOrders = ordersData.filter((o) => o.status === 'paid');
            const pendingOrders = ordersData.filter((o) => o.status === 'pending');
            const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
            const paidCount = paidOrders.length;
            const avgTicket = paidCount > 0 ? totalRevenue / paidCount : 0;

            setMetrics({
              totalRevenue,
              paidOrdersCount: paidCount,
              averageTicket: avgTicket,
              pendingOrdersCount: pendingOrders.length,
            });
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados do e-commerce:', err);
      toast.error('Erro ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Request subaccount opening
  const handleRequestOnboarding = async () => {
    if (!accountId) return;
    try {
      setSubmitting(true);
      // ponytail: use upsert to prevent unique key conflict if account already has a config row
      const { data, error } = await supabase
        .from('woovi_config')
        .upsert({
          account_id: accountId,
          onboarding_status: 'pending_approval',
          requested_pix_key: requestedPixKey,
          default_shipping_fee: config?.default_shipping_fee ?? 0,
        }, { onConflict: 'account_id' })
        .select()
        .single();

      if (error) throw error;
      setConfig(data);
      toast.success('Solicitação de subconta enviada com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error('Falha ao enviar solicitação.');
    } finally {
      setSubmitting(false);
    }
  };

  // Upload logo helper
  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${accountId}/store-logo-${Date.now()}.${fileExt}`;
    const filePath = `public/${fileName}`;

    // Upload to supabase storage bucket
    const { error: uploadError } = await supabase.storage
      .from('profiles') // reutilizando bucket existente ou criando outro se necessário
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // Save configuration details
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !config) return;

    try {
      setSubmitting(true);
      let finalLogoUrl = logoUrl;

      if (logoFile) {
        finalLogoUrl = await uploadLogo(logoFile);
        setLogoUrl(finalLogoUrl);
        setLogoFile(null);
      }

      const sanitizedSlug = storeSlug
        ? storeSlug
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
        : '';

      const { data, error } = await supabase
        .from('woovi_config')
        .update({
          app_id: appId,
          secret_key: secretKey,
          default_shipping_fee: parseFloat(defaultShippingFee) || 0,
          store_description: storeDescription,
          store_logo_url: finalLogoUrl,
          store_name: storeName,
          store_slug: sanitizedSlug || null,
          password_protected: passwordProtected,
          store_password: passwordProtected ? storePassword : '',
          // Auto-aprova quando app_id é preenchido
          ...(appId ? { onboarding_status: 'approved' } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) throw error;
      setConfig(data);
      toast.success('Configurações salvas com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error('Falha ao salvar configurações.');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to render full-width split onboarding layout (ponytail: beautiful full-width columns with feature cards)
  const renderOnboardingLayout = (mainCard: React.ReactNode) => {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full items-start">
        {/* Lado Esquerdo: Card Principal de Ação (ocupa 2 colunas) */}
        <div className="lg:col-span-2 space-y-6">
          {mainCard}
        </div>

        {/* Lado Direito: Preview de Recursos e Dashboard (ocupa 1 coluna) */}
        <div className="space-y-6">
          {/* Card: Recursos do E-commerce */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> Recursos Habilitados
              </CardTitle>
              <CardDescription className="text-xs">
                O que você poderá fazer com o seu e-commerce ativado no Abbla:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs text-muted-foreground">
              <div className="flex gap-2.5 items-start">
                <div className="h-5 w-5 shrink-0 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">✓</div>
                <div>
                  <p className="font-semibold text-foreground">Venda Direta pelo WhatsApp</p>
                  <p className="text-[11px] leading-relaxed">Operadores e IA podem criar cobranças Pix e enviar links de checkout no chat.</p>
                </div>
              </div>
              <div className="flex gap-2.5 items-start">
                <div className="h-5 w-5 shrink-0 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">✓</div>
                <div>
                  <p className="font-semibold text-foreground">Checkout Pix Inteligente</p>
                  <p className="text-[11px] leading-relaxed">Clientes compram rápido sem preencher dados repetidos de endereço.</p>
                </div>
              </div>
              <div className="flex gap-2.5 items-start">
                <div className="h-5 w-5 shrink-0 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">✓</div>
                <div>
                  <p className="font-semibold text-foreground">Infoprodutos & Serviços</p>
                  <p className="text-[11px] leading-relaxed">Entrega digital automatizada pós-pagamento sem taxas de frete.</p>
                </div>
              </div>
              <div className="flex gap-2.5 items-start">
                <div className="h-5 w-5 shrink-0 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">✓</div>
                <div>
                  <p className="font-semibold text-foreground">Lembretes de Recompra</p>
                  <p className="text-[11px] leading-relaxed">IA avisa o cliente no WhatsApp para repor o estoque após alguns dias.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Mockup do Dashboard (Com efeito Blur) */}
          <Card className="border-border overflow-hidden relative">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-primary" /> Relatórios do E-commerce
              </CardTitle>
              <CardDescription className="text-xs">Acompanhamento de vendas em tempo real.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 filter blur-[3px] select-none opacity-50 pointer-events-none">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Faturamento</div>
                  <div className="text-base font-bold text-foreground">R$ 15.280,00</div>
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Pedidos</div>
                  <div className="text-base font-bold text-foreground">148</div>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Ticket Médio</div>
                <div className="text-base font-bold text-foreground">R$ 103,24</div>
                <div className="w-full bg-muted rounded-full h-1">
                  <div className="bg-primary h-1 rounded-full w-[60%]" />
                </div>
              </div>
            </CardContent>
            {/* Overlay informativo sobre ativação */}
            <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center">
              <div className="rounded-full bg-primary/10 p-2 text-primary mb-2 shadow-sm border border-primary/20 animate-bounce">
                <Lock className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-foreground">Aguardando Ativação</p>
              <p className="text-[10px] text-muted-foreground max-w-[200px] mt-1 leading-relaxed">
                Insira as credenciais Woovi para habilitar métricas e gráficos de faturamento.
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // FASE 1: Sem onboarding solicitado
  if (!config || config.onboarding_status === 'none') {
    return renderOnboardingLayout(
      <Card className="border-primary/20 bg-card">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <CardTitle className="mt-4 text-2xl">Ative seu E-commerce no Abbla</CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            Venda e-books, mentorias, serviços ou produtos físicos diretamente pelo chat do WhatsApp e tenha uma página de checkout Pix integrada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Como funciona a integração com a Woovi?</p>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
              <span>Você solicita a abertura de uma subconta vinculada à nossa plataforma de parceiro Woovi.</span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
              <span>Nossa equipe cria sua subconta e envia as chaves de acesso Sandbox/Produção no seu e-mail.</span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
              <span>Você insere suas chaves aqui, configura seu e-commerce e ativa os pagamentos e envios Pix automatizados.</span>
            </div>
          </div>

          <div className="space-y-2 text-left">
            <Label htmlFor="pixKey" className="text-xs font-semibold text-muted-foreground uppercase">
              Sua Chave Pix para Recebimento (Obrigatório)
            </Label>
            <Input
              id="pixKey"
              placeholder="Digite seu CPF, CNPJ, Celular ou E-mail da chave Pix"
              value={requestedPixKey}
              onChange={(e) => setRequestedPixKey(e.target.value)}
              className="bg-muted border-border"
            />
            <p className="text-[10px] text-muted-foreground">
              Esta chave Pix será utilizada para configurar o recebimento automático das suas vendas na Woovi.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleRequestOnboarding}
            disabled={submitting || !requestedPixKey.trim()}
          >
            {submitting ? 'Enviando solicitação...' : 'Solicitar Abertura de Subconta Woovi'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // FASE 2: Aguardando aprovação
  if (config.onboarding_status === 'pending_approval') {
    return renderOnboardingLayout(
      <Card className="border-amber-500/20 bg-card">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle className="mt-4 text-2xl">Abertura de Subconta Pendente</CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            Nossa equipe está processando a criação da sua carteira na Woovi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Este processo leva geralmente menos de 24 horas úteis. Assim que aprovada, enviaremos os dados de credenciais no seu e-mail de cadastro e esta aba será desbloqueada para você configurar suas chaves de API.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={loadData}>
              Verificar Status Atual
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // FASE 3: Aprovado, mas App ID ainda não preenchido (secret_key é opcional)
  const hasCredentials = !!config.app_id;
  if (!hasCredentials) {
    return renderOnboardingLayout(
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Building className="h-5 w-5 text-primary" />
            <CardTitle>Credenciais e Configuração do E-commerce</CardTitle>
          </div>
          <CardDescription>
            Insira as chaves de API obtidas na sua subconta da Woovi para iniciar as vendas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveConfig} className="space-y-6">
            {/* Logo e Nome do E-commerce */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Logotipo do E-commerce</Label>
                <div className="flex items-center space-x-4">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-lg object-cover border border-border" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-muted-foreground bg-muted text-muted-foreground">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">PNG ou JPG até 2MB</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingFee">Taxa de Frete Padrão (R$)</Label>
                <Input
                  id="shippingFee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={defaultShippingFee}
                  onChange={(e) => setDefaultShippingFee(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Taxa aplicada em produtos físicos do e-commerce caso não haja frete customizado.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="storeName">Nome da Loja</Label>
                <Input
                  id="storeName"
                  type="text"
                  placeholder="Nome do seu e-commerce"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="storeSlug">Link Personalizado (Slug)</Label>
                <div className="flex items-center">
                  <span className="inline-flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
                    /shop/
                  </span>
                  <Input
                    id="storeSlug"
                    type="text"
                    placeholder="minha-loja"
                    value={storeSlug}
                    onChange={(e) => setStoreSlug(e.target.value)}
                    className="rounded-l-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">O endereço final será amigável (ex: /shop/minha-loja).</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="storeDesc">Descrição / Apresentação do E-commerce</Label>
              <Textarea
                id="storeDesc"
                placeholder="Escreva sobre sua marca, nicho, horário de suporte..."
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Proteção por Senha */}
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-primary" /> Proteção por Senha
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Exigir uma senha de acesso para que os clientes visualizem sua loja.
                  </p>
                </div>
                <Switch
                  checked={passwordProtected}
                  onCheckedChange={setPasswordProtected}
                />
              </div>

              {passwordProtected && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label htmlFor="storePassword">Senha da Loja</Label>
                  <Input
                    id="storePassword"
                    type="password"
                    placeholder="Digite a senha de acesso"
                    value={storePassword}
                    onChange={(e) => setStorePassword(e.target.value)}
                    required={passwordProtected}
                  />
                </div>
              )}
            </div>

            <hr className="border-border" />

            {/* Chaves da Woovi */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-primary font-semibold text-sm">
                <CreditCard className="h-4 w-4" />
                <span>Integração de Pagamento Woovi API</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appId">Woovi App ID (Authorization Key)</Label>
                <Input
                  id="appId"
                  type="text"
                  placeholder="Insira seu AppID (ex: plugin_abc123...)"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secretKey">Woovi Secret Key (Opcional)</Label>
                <Input
                  id="secretKey"
                  type="password"
                  placeholder="Insira sua Secret Key se gerada"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar e Habilitar E-commerce'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // FASE 4: Configurado com sucesso. Exibe Métricas + Vendas
  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Faturamento Confirmado</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Pagamentos Pix recebidos</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Vendas Aprovadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.paidOrdersCount}</div>
            <p className="text-xs text-muted-foreground">Pedidos pagos com sucesso</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {metrics.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Média de gasto por pedido</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Aguardando Pagamento</CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pendingOrdersCount}</div>
            <p className="text-xs text-muted-foreground">Cobranças Pix geradas e ativas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tabela de pedidos recentes */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle>Pedidos Recentes</CardTitle>
            <CardDescription>Lista dos últimos pedidos gerados pelo e-commerce ou chat.</CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-55" />
                <p className="text-sm">Nenhum pedido registrado ainda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-medium">
                      <th className="py-2">Pedido</th>
                      <th className="py-2">Cliente</th>
                      <th className="py-2">Total</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((order) => {
                      const client = order.customer_info as { name: string; phone: string };
                      return (
                        <tr key={order.id} className="border-b border-border hover:bg-muted/30">
                          <td className="py-3 font-semibold text-xs truncate max-w-[120px]">{order.id.slice(0, 8)}</td>
                          <td className="py-3">
                            <div className="text-sm font-medium">{client.name}</div>
                            <div className="text-xs text-muted-foreground">{client.phone}</div>
                          </td>
                          <td className="py-3 font-semibold">R$ {Number(order.total_amount || 0).toFixed(2)}</td>
                          <td className="py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                order.status === 'paid'
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : order.status === 'cancelled'
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-amber-500/10 text-amber-500'
                              }`}
                            >
                              {order.status === 'paid' ? 'Pago' : order.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações do E-commerce & Atalhos */}
        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Seu E-commerce Ativo</CardTitle>
              <CardDescription>Informações públicas do e-commerce.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                {config.store_logo_url ? (
                  <img src={config.store_logo_url} alt="Logo" className="h-12 w-auto max-w-[120px] object-contain" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-foreground mb-1">
                    {config.store_name || 'Link de Acesso do E-commerce'}
                  </div>
                  {config.store_slug ? (
                    <div className="flex flex-col gap-1">
                      <a
                        href={`/shop/${config.store_slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline break-all font-medium"
                      >
                        /shop/{config.store_slug}
                      </a>
                      <span className="text-[10px] text-muted-foreground">
                        Fallback: <a href={`/shop/${accountId}`} target="_blank" rel="noreferrer" className="hover:underline">/shop/{accountId}</a>
                      </span>
                    </div>
                  ) : (
                    <a
                      href={`/shop/${accountId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline break-all font-medium"
                    >
                      /shop/{accountId}
                    </a>
                  )}
                </div>
              </div>

              <div className="text-sm border-t border-border pt-3 space-y-2 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Frete Padrão: </span>
                  R$ {Number(config.default_shipping_fee || 0).toFixed(2)}
                </div>
                {config.store_description && (
                  <div className="text-xs border-t border-border pt-2">
                    <span className="font-medium text-foreground block mb-1">Descrição:</span>
                    {config.store_description}
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  // Forçar reexibição do formulário de configuração resetando temporariamente o state
                  setAppId(config.app_id || '');
                  setSecretKey(config.secret_key || '');
                  setConfig({ ...config, app_id: null, secret_key: null } as any);
                }}
              >
                Editar Informações do E-commerce
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
