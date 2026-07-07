'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductVariation, WooviConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ShoppingBag,
  CreditCard,
  Truck,
  CheckCircle2,
  Copy,
  Clock,
  QrCode,
  MapPin,
  MessageSquare,
  AlertCircle,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';

interface CartItemInput {
  variationId: string;
  quantity: number;
  isUpsell?: boolean;
}

interface HydratedCartItem {
  variationId: string;
  quantity: number;
  price: number;
  productName: string;
  productType: 'physical' | 'digital';
  attributes: Record<string, string>;
  coverImage: string | null;
  shippingFee: number | null;
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenantSlug as string; // account_id
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WooviConfig | null>(null);
  const [cartItems, setCartItems] = useState<CartItemInput[]>([]);
  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[]>([]);

  // Checkout steps
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  // Form states
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '' });
  const [shippingAddress, setShippingAddress] = useState({
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    postal_code: '',
    saveAddress: true,
  });

  // Saved addresses auto-complete list
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Timer countdown
  const [timeLeft, setTimeLeft] = useState(900); // 15:00 minutes

  // Load configuration and hydrate cart items
  const loadCheckoutData = useCallback(async () => {
    if (!tenantSlug) return;

    try {
      setLoading(true);

      // 1. Fetch Woovi Config
      const { data: configData } = await supabase
        .from('woovi_config')
        .select('*')
        .eq('account_id', tenantSlug)
        .maybeSingle();
      setConfig(configData);

      // 2. Read cart from LocalStorage
      const savedCart = localStorage.getItem(`cart_${tenantSlug}`);
      if (savedCart) {
        const parsed = JSON.parse(savedCart) as CartItemInput[];
        setCartItems(parsed);

        if (parsed.length > 0) {
          const { data: varData } = await supabase
            .from('product_variations')
            .select('*, product:products(*)')
            .in('id', parsed.map((item) => item.variationId));

          if (varData) {
            const hydrated = parsed.map((item) => {
              const matchedVar = varData.find((v) => v.id === item.variationId);
              if (!matchedVar) return null;

              const prod = matchedVar.product;
              return {
                variationId: item.variationId,
                quantity: item.quantity,
                price: Number(matchedVar.price),
                productName: prod?.name || 'Produto',
                productType: prod?.product_type || 'physical',
                attributes: matchedVar.attributes || {},
                coverImage: prod?.images && prod?.images.length > 0 ? prod.images[0] : null,
                shippingFee: prod?.shipping_fee ? Number(prod.shipping_fee) : null,
              } as HydratedCartItem;
            }).filter((item): item is HydratedCartItem => item !== null);

            setHydratedItems(hydrated);
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao preparar o checkout.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, supabase]);

  useEffect(() => {
    loadCheckoutData();
  }, [loadCheckoutData]);

  // Lookup saved addresses when phone changes
  useEffect(() => {
    const phoneDigits = customerInfo.phone.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      const controller = new AbortController();
      const fetchSavedAddresses = async () => {
        try {
          const res = await fetch(
            `/api/ecommerce/addresses?phone=${encodeURIComponent(phoneDigits)}&accountId=${tenantSlug}`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const list = await res.json();
            setSavedAddresses(list || []);
            // Pre-fill with default address if list has items and street is currently empty
            if (list && list.length > 0 && !shippingAddress.street) {
              const def = list.find((a: any) => a.is_default) || list[0];
              setShippingAddress({
                street: def.street,
                number: def.number,
                complement: def.complement || '',
                neighborhood: def.neighborhood,
                city: def.city,
                state: def.state,
                postal_code: def.postal_code,
                saveAddress: false, // already saved
              });
              toast.success('Endereço salvo preenchido automaticamente!');
            }
          }
        } catch (e) {
          // ignore aborts
        }
      };

      const delayDebounce = setTimeout(fetchSavedAddresses, 600);
      return () => {
        clearTimeout(delayDebounce);
        controller.abort();
      };
    } else {
      setSavedAddresses([]);
    }
  }, [customerInfo.phone, tenantSlug]);

  // Realtime subscription for payment confirmation
  useEffect(() => {
    if (step === 'payment' && createdOrder?.id) {
      const channel = supabase
        .channel(`public-order-status-${createdOrder.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${createdOrder.id}`,
          },
          (payload) => {
            if (payload.new && payload.new.status === 'paid') {
              setStep('success');
              // Limpar carrinho
              localStorage.removeItem(`cart_${tenantSlug}`);
              toast.success('Pagamento confirmado via Pix com sucesso!');
            }
          }
        )
        .subscribe();

      // Start countdown
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
  }, [step, createdOrder, supabase, tenantSlug]);

  // Calculate totals
  const itemsSubtotal = hydratedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const hasPhysical = hydratedItems.some((item) => item.productType === 'physical');
  
  const maxShippingFee = hydratedItems.reduce((max, item) => {
    if (item.productType === 'physical' && item.shippingFee !== null && item.shippingFee > max) {
      return item.shippingFee;
    }
    return max;
  }, 0);

  const shippingFeeTotal = hasPhysical
    ? maxShippingFee > 0
      ? maxShippingFee
      : Number(config?.default_shipping_fee || 0)
    : 0;

  const orderTotal = itemsSubtotal + shippingFeeTotal;

  // Submit checkout
  const handleSubmitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.email) {
      toast.error('Preencha as informações de contato.');
      return;
    }

    if (hasPhysical && (!shippingAddress.street || !shippingAddress.number || !shippingAddress.postal_code)) {
      toast.error('Preencha os dados de entrega para produtos físicos.');
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch('/api/ecommerce/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: tenantSlug,
          customerInfo,
          cartItems: cartItems.map((c) => ({
            variationId: c.variationId,
            quantity: c.quantity,
            isUpsell: c.isUpsell || false,
          })),
          shippingAddress: hasPhysical ? shippingAddress : null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro desconhecido durante o checkout.');
      }

      const order = await res.json();
      setCreatedOrder(order);
      setStep('payment');
      toast.success('Pedido gerado! Aguardando pagamento Pix.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Falha ao processar pagamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Código Pix Copia e Cola copiado!');
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

  if (cartItems.length === 0 && step === 'form') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-55 mb-2" />
        <h2 className="text-xl font-bold">Carrinho Vazio</h2>
        <Button variant="link" onClick={() => router.push(`/shop/${tenantSlug}`)} className="text-primary mt-1">
          Ir para a vitrine
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-16 pt-8 text-foreground selection:bg-primary selection:text-primary-foreground">
      <main className="mx-auto max-w-4xl px-4 grid gap-8 md:grid-cols-5">
        
        {/* Lado Esquerdo: Formulário / Pagamento (Cols 3) */}
        <div className="md:col-span-3 space-y-6">
          {step === 'form' && (
            <form onSubmit={handleSubmitCheckout} className="space-y-6">
              {/* Informações Pessoais */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Informações de Contato
                  </CardTitle>
                  <CardDescription>
                    Usaremos estes dados para enviar a confirmação do pagamento e suporte.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="custName">Nome Completo</Label>
                    <Input
                      id="custName"
                      placeholder="Seu nome"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="custPhone">WhatsApp (com DDD)</Label>
                      <Input
                        id="custPhone"
                        placeholder="Ex: (11) 99999-9999"
                        value={customerInfo.phone}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="custEmail">E-mail</Label>
                      <Input
                        id="custEmail"
                        type="email"
                        placeholder="seu@email.com"
                        value={customerInfo.email}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Endereço de Entrega (se produto físico) */}
              {hasPhysical ? (
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      Endereço de Entrega
                    </CardTitle>
                    <CardDescription>
                      Insira o local para envio das mercadorias físicas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Exibe endereços salvos autocompletados */}
                    {savedAddresses.length > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2 mb-2">
                        <Label className="text-xs font-bold text-primary flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" /> Endereços de recompra encontrados:
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {savedAddresses.map((addr, i) => (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={() => {
                                setShippingAddress({
                                  street: addr.street,
                                  number: addr.number,
                                  complement: addr.complement || '',
                                  neighborhood: addr.neighborhood,
                                  city: addr.city,
                                  state: addr.state,
                                  postal_code: addr.postal_code,
                                  saveAddress: false,
                                });
                                toast.success('Endereço carregado!');
                              }}
                              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-left hover:border-primary hover:bg-primary/5 transition-all max-w-xs truncate"
                            >
                              {addr.street}, {addr.number} ({addr.neighborhood})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-1">
                        <Label htmlFor="cep">CEP</Label>
                        <Input
                          id="cep"
                          placeholder="00000-000"
                          value={shippingAddress.postal_code}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="street">Logradouro</Label>
                        <Input
                          id="street"
                          placeholder="Rua, Avenida..."
                          value={shippingAddress.street}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="number">Número</Label>
                        <Input
                          id="number"
                          placeholder="123"
                          value={shippingAddress.number}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, number: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="complement">Complemento</Label>
                        <Input
                          id="complement"
                          placeholder="Apto, Bloco (opcional)"
                          value={shippingAddress.complement}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, complement: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="neighborhood">Bairro</Label>
                        <Input
                          id="neighborhood"
                          placeholder="Bairro"
                          value={shippingAddress.neighborhood}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, neighborhood: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="city">Cidade</Label>
                        <Input
                          id="city"
                          placeholder="Cidade"
                          value={shippingAddress.city}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="state">Estado (UF)</Label>
                        <Input
                          id="state"
                          placeholder="SP"
                          maxLength={2}
                          value={shippingAddress.state}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value.toUpperCase() })}
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id="saveAddress"
                        checked={shippingAddress.saveAddress}
                        onCheckedChange={(checked) =>
                          setShippingAddress({ ...shippingAddress, saveAddress: !!checked })
                        }
                      />
                      <Label htmlFor="saveAddress" className="text-xs text-muted-foreground leading-none">
                        Salvar este endereço para facilitar futuras compras de recompra.
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-primary">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <span className="font-bold block">Pedido 100% Digital</span>
                    Nenhum endereço de entrega física é necessário. Os links e acessos serão entregues imediatamente no WhatsApp fornecido.
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl h-12 text-base font-bold shadow-md shadow-primary/20"
              >
                {submitting ? 'Gerando Pix Woovi...' : 'Avançar para Pagamento Pix'}
              </Button>
            </form>
          )}

          {/* STEP 2: Tela de Pagamento Pix */}
          {step === 'payment' && createdOrder && (
            <Card className="border-primary/30 shadow-lg text-center">
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-extrabold flex items-center justify-center gap-2">
                  <CreditCard className="h-6 w-6 text-primary" />
                  Pagamento Pix Woovi
                </CardTitle>
                <CardDescription>
                  Pague com Pix para receber seus produtos instantaneamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Timer */}
                <div className="flex items-center justify-center gap-1.5 text-sm font-semibold bg-muted rounded-full py-1.5 px-4 w-max mx-auto text-amber-500 border border-amber-500/20">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Aguardando pagamento: {formatTime(timeLeft)}</span>
                </div>

                {/* QR Code */}
                {createdOrder.woovi_qrcode_image ? (
                  <div className="mx-auto border border-border rounded-2xl p-4 bg-white h-52 w-52 flex items-center justify-center shadow-inner">
                    <img src={createdOrder.woovi_qrcode_image} alt="Pix QR Code" className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="mx-auto border border-dashed border-muted rounded-2xl p-6 h-52 w-52 flex flex-col items-center justify-center text-muted-foreground text-xs">
                    <QrCode className="h-10 w-10 mb-2 opacity-50" />
                    <span>QR Code indisponível</span>
                  </div>
                )}

                {/* Copia e Cola */}
                {createdOrder.woovi_brcode && (
                  <div className="space-y-2 text-left max-w-sm mx-auto">
                    <Label className="text-xs font-bold text-muted-foreground block text-center">Código Pix Copia e Cola:</Label>
                    <div className="flex gap-2 border border-border rounded-xl p-2 bg-muted/50 break-all font-mono text-[10px] items-center">
                      <span className="flex-1 max-h-12 overflow-y-auto select-all leading-normal">
                        {createdOrder.woovi_brcode}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(createdOrder.woovi_brcode)}
                        className="h-8 w-8 shrink-0 hover:bg-background"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs text-emerald-500 max-w-sm mx-auto">
                  <span className="font-semibold block mb-0.5">Confirmação Instantânea</span>
                  Assim que pagar, a tela irá atualizar automaticamente para a confirmação de envio.
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Sucesso do Pagamento */}
          {step === 'success' && createdOrder && (
            <Card className="border-emerald-500/30 shadow-lg text-center bg-card">
              <CardHeader>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-4 animate-bounce">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <CardTitle className="text-2xl font-extrabold text-emerald-500">Pagamento Confirmado!</CardTitle>
                <CardDescription>
                  Seu Pix foi processado e aprovado com sucesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Muito obrigado por sua compra! O recibo de pagamento e as informações de entrega foram enviados automaticamente em seu WhatsApp.
                </p>

                {/* Exibe botão de voltar */}
                <Button
                  className="rounded-2xl h-11 px-6 shadow-md shadow-primary/20"
                  onClick={() => router.push(`/shop/${tenantSlug}`)}
                >
                  Voltar para a Vitrine
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lado Direito: Resumo do Pedido (Cols 2) */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Resumo do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Itens */}
              <div className="divide-y divide-border/60 max-h-60 overflow-y-auto pr-1">
                {hydratedItems.map((item) => {
                  const attrs = Object.entries(item.attributes).map(([k, v]) => `${v}`).join(' / ');
                  return (
                    <div key={item.variationId} className="py-2.5 flex justify-between items-center text-sm">
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="font-semibold text-foreground truncate">{item.productName}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Qtd: {item.quantity} {attrs && `| ${attrs}`}
                        </div>
                      </div>
                      <div className="font-bold text-foreground shrink-0">
                        R$ {(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totais */}
              <div className="border-t border-border pt-4 text-xs space-y-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal itens:</span>
                  <span className="font-medium text-foreground">R$ {itemsSubtotal.toFixed(2)}</span>
                </div>
                {hasPhysical && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Frete:</span>
                    <span className="font-medium text-foreground">R$ {shippingFeeTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2 text-foreground">
                  <span>Total Geral:</span>
                  <span className="text-primary text-base font-extrabold">R$ {orderTotal.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </main>
    </div>
  );
}
