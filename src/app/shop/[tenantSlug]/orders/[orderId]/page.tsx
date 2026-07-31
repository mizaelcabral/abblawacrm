'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getOrderDetails } from '../actions';
import { ShoppingBag, ArrowLeft, Clock, QrCode, Copy, Truck, CreditCard, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenantSlug as string;
  const orderId = params.orderId as string;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(900); // 15 mins for PIX

  const [supabase] = useState(() => createClient());

  useEffect(() => {
    async function loadOrder() {
      setLoading(true);
      const res = await getOrderDetails(orderId, tenantSlug);
      if (res.error) {
        toast.error(res.error);
        router.push(`/shop/${tenantSlug}/orders`);
      } else {
        setOrder(res.order);
        setConfig(res.config);
        setAddress(res.address);
        
        // Calculate time left if pending
        if (res.order.status === 'pending') {
          const createdAt = new Date(res.order.created_at).getTime();
          const now = new Date().getTime();
          const diff = Math.floor((now - createdAt) / 1000);
          const remaining = Math.max(900 - diff, 0);
          setTimeLeft(remaining);
        }
      }
      setLoading(false);
    }
    loadOrder();
  }, [orderId, tenantSlug, router]);

  // Realtime updates for payment status
  useEffect(() => {
    if (order && order.status === 'pending' && timeLeft > 0) {
      const channel = supabase
        .channel(`public-order-status-${order.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
          (payload) => {
            if (payload.new && payload.new.status === 'paid') {
              setOrder((prev: any) => ({ ...prev, status: 'paid' }));
              toast.success('Pagamento confirmado!');
            }
          }
        )
        .subscribe();

      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [order, supabase, timeLeft]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Código Pix copiado!');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) return null;

  const translateStatus = (status: string) => {
    switch (status) {
      case 'paid': return 'Pago';
      case 'pending': return timeLeft === 0 ? 'Expirado' : 'Aguardando Pagamento';
      case 'cancelled': return 'Cancelado / Expirado';
      default: return status;
    }
  };

  const isPending = order.status === 'pending';
  const isPaid = order.status === 'paid';
  const isExpired = isPending && timeLeft === 0;

  return (
    <div className="min-h-screen bg-muted/20 pb-16 pt-8 text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Header */}
      <header className="mb-8">
        <div className="mx-auto max-w-4xl px-4 flex items-center justify-between">
          <button
            onClick={() => router.push(`/shop/${tenantSlug}/orders`)}
            className="flex items-center gap-2 focus:outline-none hover:text-primary transition-colors text-sm font-bold"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar aos Pedidos
          </button>
          
          {config?.store_logo_url ? (
            <img src={config.store_logo_url} alt="Logo" className="h-8 object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <span className="font-bold">{config?.store_name || 'Loja'}</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 space-y-6">
        
        {/* Status Banner */}
        <div className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-center sm:items-start gap-4 shadow-sm ${
          isPaid ? 'bg-emerald-100/30 border-emerald-200 text-emerald-900' :
          isPending && !isExpired ? 'bg-amber-100/30 border-amber-200 text-amber-900' :
          'bg-red-100/30 border-red-200 text-red-900'
        }`}>
          {isPaid ? <CheckCircle2 className="h-10 w-10 text-emerald-600 shrink-0 mt-1" /> :
           isPending && !isExpired ? <Clock className="h-10 w-10 text-amber-600 shrink-0 mt-1" /> :
           <XCircle className="h-10 w-10 text-red-600 shrink-0 mt-1" />}
          <div className="text-center sm:text-left">
            <h2 className="text-2xl font-extrabold">{translateStatus(order.status)}</h2>
            <p className="text-sm opacity-90 mt-1">
              Pedido <strong className="font-bold">#{order.id.split('-')[0].toUpperCase()}</strong> efetuado em {new Date(order.created_at).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Info (Left) */}
          <div className="md:col-span-2 space-y-6">
            {/* Itens do Pedido */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  Itens do Pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="space-y-5">
                  {order.order_items?.map((item: any) => {
                    const product = item.product_variations?.products;
                    const attrs = Object.entries(item.product_variations?.attributes || {})
                      .map(([k, v]) => `${v}`).join(' / ');
                    const image = product?.images?.[0];

                    return (
                      <div key={item.id} className="flex gap-4 items-center">
                        {image ? (
                          <img src={image} alt={product?.name} className="h-16 w-16 rounded-xl object-cover border shadow-sm" />
                        ) : (
                          <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center border shadow-sm">
                            <ShoppingBag className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm truncate text-foreground">{product?.name || 'Produto indisponível'}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                            Qtd: {item.quantity} {attrs ? `| ${attrs}` : ''}
                          </p>
                        </div>
                        <div className="font-bold text-sm shrink-0">
                          R$ {(item.unit_price * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Endereço / Contato */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground/80">
                    <CreditCard className="h-4 w-4 text-primary" /> Dados de Cobrança
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1 text-muted-foreground">
                  <p className="font-bold text-foreground">{order.customer_info?.name}</p>
                  <p>{order.customer_info?.email}</p>
                  <p>{order.customer_info?.phone}</p>
                </CardContent>
              </Card>

              {address && (
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground/80">
                      <Truck className="h-4 w-4 text-primary" /> Endereço de Entrega
                  </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1 text-muted-foreground">
                    <p className="font-medium text-foreground">{address.street}, {address.number} {address.complement ? ` - ${address.complement}` : ''}</p>
                    <p>{address.neighborhood}, {address.city} - {address.state}</p>
                    <p>CEP: {address.postal_code}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Sidebar (Right) */}
          <div className="space-y-6">
            {/* Pix Payment Box if pending */}
            {isPending && (
              <Card className={isExpired ? "border-red-200 shadow-md overflow-hidden bg-red-50/50" : "border-primary/30 shadow-md overflow-hidden"}>
                {isExpired ? (
                  <>
                    <CardHeader className="text-center pb-2 bg-red-100/30 border-b border-red-200">
                      <CardTitle className="text-lg text-red-700 flex justify-center items-center gap-2 font-bold">
                        <XCircle className="h-5 w-5" /> Pix Expirado
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4 text-center">
                      <p className="text-sm text-red-900 font-bold">
                        O tempo limite para pagamento deste pedido expirou.
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Por favor, realize uma nova compra ou entre em contato com o suporte do lojista se achar que isso é um erro.
                      </p>
                    </CardContent>
                  </>
                ) : (
                  <>
                    <div className="h-1.5 w-full bg-primary/20">
                      <div className="h-full bg-primary animate-pulse w-full"></div>
                    </div>
                    <CardHeader className="text-center pb-2 bg-primary/5 border-b border-primary/10">
                      <CardTitle className="text-lg text-primary flex justify-center items-center gap-2 font-bold">
                        <QrCode className="h-5 w-5" /> Pagamento Pix
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-5 text-center">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full border border-amber-200">
                        <Clock className="h-4 w-4 animate-spin" /> Expira em {formatTime(timeLeft)}
                      </div>
                      
                      {order.woovi_qrcode_image && (
                        <div className="border-2 border-border p-3 rounded-2xl bg-white w-fit mx-auto shadow-sm hover:border-primary/50 transition-colors">
                          <img src={order.woovi_qrcode_image} alt="QR Code" className="h-40 w-40 object-contain" />
                        </div>
                      )}

                      {order.woovi_brcode && (
                        <div className="space-y-2 text-left">
                          <div className="text-xs text-muted-foreground font-bold text-center">Pix Copia e Cola</div>
                          <div className="flex gap-2 border border-border bg-muted/30 p-2 rounded-xl items-center shadow-inner">
                            <div className="flex-1 overflow-hidden truncate text-[11px] font-mono text-muted-foreground">
                              {order.woovi_brcode}
                            </div>
                            <Button size="sm" onClick={() => copyToClipboard(order.woovi_brcode)} className="h-8 shrink-0 text-xs px-3 font-bold shadow-md shadow-primary/20">
                              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-3 leading-relaxed font-medium">
                        Aguardando confirmação do pagamento.<br/>A página será atualizada automaticamente.
                      </p>
                    </CardContent>
                )}
              </Card>
            )}

            {/* Totals Calculation */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  Resumo Financeiro
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-muted-foreground font-medium">
                    <span>Subtotal:</span>
                    <span className="text-foreground">R$ {Number(order.items_amount).toFixed(2)}</span>
                  </div>
                  {Number(order.shipping_amount) > 0 && (
                    <div className="flex justify-between text-muted-foreground font-medium">
                      <span>Frete:</span>
                      <span className="text-foreground">R$ {Number(order.shipping_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-4 mt-2 border-t border-border flex justify-between font-extrabold text-lg text-foreground">
                    <span>Total:</span>
                    <span className="text-primary">R$ {Number(order.total_amount).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
