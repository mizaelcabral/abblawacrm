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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  Lock,
  ArrowLeft,
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
  const tenantSlug = params.tenantSlug as string; // account_id or slug
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WooviConfig | null>(null);
  const [cartItems, setCartItems] = useState<CartItemInput[]>([]);
  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[]>([]);

  // Checkout steps
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  // Password protection state
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

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

  const [selectedGateway, setSelectedGateway] = useState<string>('woovi');

  // Saved addresses auto-complete list
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Store branding
  const [storeName, setStoreName] = useState<string>('');
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);

  // Timer countdown
  const [timeLeft, setTimeLeft] = useState(900); // 15:00 minutes

  // Load configuration and hydrate cart items
  const loadCheckoutData = useCallback(async () => {
    if (!tenantSlug) return;

    try {
      setLoading(true);

      // 1. Fetch Woovi Config
      const res = await fetch(`/api/shop/config?tenantSlug=${tenantSlug}`);
      if (!res.ok) {
        throw new Error('Erro ao carregar configurações da loja');
      }
      const configData = await res.json();
      
      const mappedConfig: WooviConfig = {
        ...configData,
        app_id: configData.has_app_id ? 'configured' : null
      };
      setConfig(mappedConfig);
      if (mappedConfig.active_gateway) {
        setSelectedGateway(mappedConfig.active_gateway);
      }
      setStoreName(configData.store_name || '');
      setStoreLogoUrl(configData.store_logo_url || null);

      // Check authentication for password protected stores
      const hasAuth = sessionStorage.getItem("auth_shop_" + configData.account_id) === 'true';
      setAuthenticated(hasAuth);

      // 2. Read cart from LocalStorage using resolved account_id
      const savedCart = localStorage.getItem(`cart_${configData.account_id}`);
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
    if (phoneDigits.length >= 10 && config?.account_id) {
      const controller = new AbortController();
      const fetchSavedAddresses = async () => {
        try {
          const res = await fetch(
            `/api/ecommerce/addresses?phone=${encodeURIComponent(phoneDigits)}&accountId=${config.account_id}`,
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
  }, [customerInfo.phone, config?.account_id]);

  // Realtime subscription for payment confirmation
  useEffect(() => {
    if (step === 'payment' && createdOrder?.id && config?.account_id) {
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
              localStorage.removeItem(`cart_${config.account_id}`);
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
  }, [step, createdOrder, supabase, config?.account_id]);

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

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const res = await fetch('/api/shop/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, password: passwordInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (config?.account_id) {
          sessionStorage.setItem("auth_shop_" + config.account_id, 'true');
        }
        setAuthenticated(true);
        toast.success('Acesso liberado!');
      } else {
        toast.error(data.error || 'Senha incorreta.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao verificar a senha.');
    } finally {
      setVerifying(false);
    }
  };

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
          accountId: config?.account_id,
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

  // Tela de Senha
  if (config?.password_protected && !authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-4 text-center selection:bg-primary selection:text-primary-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border/80 bg-white p-8 shadow-sm overflow-hidden space-y-6">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Loja Protegida por Senha</h2>
            <p className="text-sm text-muted-foreground">
              Digite a senha de acesso fornecida pelo lojista para continuar.
            </p>
          </div>
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <Input
              type="password"
              placeholder="Senha de acesso"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
            />
            <Button type="submit" disabled={verifying} className="w-full rounded-2xl h-13 text-base font-bold shadow-md shadow-primary/20 hover:opacity-95 transition-all">
              {verifying ? 'Verificando...' : 'Acessar Loja'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0 && step === 'form') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-muted/20 p-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted/30 text-muted-foreground mb-4">
          <ShoppingBag className="h-8 w-8 opacity-50" />
        </div>
        <h2 className="text-xl font-bold">Carrinho Vazio</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Você ainda não adicionou produtos ao carrinho.</p>
        <Button onClick={() => router.push(`/shop/${tenantSlug}`)} className="rounded-2xl h-11 px-6 font-bold shadow-md shadow-primary/20">
          Ir para a vitrine
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-16 text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Header expansivo com Glassmorphism */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-white/95 backdrop-blur-md shadow-sm mb-8">
        <div className="mx-auto max-w-[1720px] w-full flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
          <button
            onClick={() => router.push(`/shop/${tenantSlug}`)}
            className="flex items-center gap-3 focus:outline-none hover:opacity-90 transition-opacity"
            aria-label="Voltar para a loja"
          >
            {storeLogoUrl ? (
              <img
                src={storeLogoUrl}
                alt={storeName || 'Logo da loja'}
                className="h-10 max-w-[160px] object-contain"
              />
            ) : (
              <div className="flex items-center gap-2 text-foreground">
                <ShoppingBag className="h-6 w-6 text-primary" />
                {storeName && <span className="font-bold text-lg">{storeName}</span>}
              </div>
            )}
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/shop/${tenantSlug}`)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground gap-2 rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar para a Loja</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1720px] w-full px-4 sm:px-8 lg:px-12 grid gap-8 lg:grid-cols-12 items-start">
        
        {/* Lado Esquerdo (Contact info, Shipping address, Payment form / Pix step) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {step === 'form' && (
            <form onSubmit={handleSubmitCheckout} className="space-y-6">
              {/* Informações Pessoais */}
              <Card className="rounded-3xl border border-border/80 bg-white shadow-sm overflow-hidden">
                <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/40">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Informações de Contato
                  </CardTitle>
                  <CardDescription>
                    Usaremos estes dados para enviar a confirmação do pagamento e suporte.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 sm:p-8 space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="custName" className="text-sm font-medium">Nome Completo</Label>
                    <Input
                      id="custName"
                      placeholder="Seu nome completo"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      required
                      className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="custPhone" className="text-sm font-medium">WhatsApp (com DDD)</Label>
                      <Input
                        id="custPhone"
                        placeholder="Ex: (11) 99999-9999"
                        value={customerInfo.phone}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                        required
                        className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="custEmail" className="text-sm font-medium">E-mail</Label>
                      <Input
                        id="custEmail"
                        type="email"
                        placeholder="seu@email.com"
                        value={customerInfo.email}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                        required
                        className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Endereço de Entrega (se produto físico) */}
              {hasPhysical ? (
                <Card className="rounded-3xl border border-border/80 bg-white shadow-sm overflow-hidden">
                  <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/40">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      Endereço de Entrega
                    </CardTitle>
                    <CardDescription>
                      Insira o local para envio das mercadorias físicas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 sm:p-8 space-y-5">
                    {/* Exibe endereços salvos autocompletados */}
                    {savedAddresses.length > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2 mb-2">
                        <Label className="text-xs font-bold text-primary flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" /> Endereços de recompra encontrados:
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {savedAddresses.map((addr) => (
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
                              className="rounded-xl border border-border bg-white px-3 py-2 text-xs text-left hover:border-primary hover:bg-primary/5 transition-all max-w-xs truncate shadow-xs"
                            >
                              {addr.street}, {addr.number} ({addr.neighborhood})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-1">
                        <Label htmlFor="cep" className="text-sm font-medium">CEP</Label>
                        <Input
                          id="cep"
                          placeholder="00000-000"
                          value={shippingAddress.postal_code}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
                          required
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="street" className="text-sm font-medium">Logradouro</Label>
                        <Input
                          id="street"
                          placeholder="Rua, Avenida..."
                          value={shippingAddress.street}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                          required
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="number" className="text-sm font-medium">Número</Label>
                        <Input
                          id="number"
                          placeholder="123"
                          value={shippingAddress.number}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, number: e.target.value })}
                          required
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="complement" className="text-sm font-medium">Complemento</Label>
                        <Input
                          id="complement"
                          placeholder="Apto, Bloco (opcional)"
                          value={shippingAddress.complement}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, complement: e.target.value })}
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="neighborhood" className="text-sm font-medium">Bairro</Label>
                        <Input
                          id="neighborhood"
                          placeholder="Bairro"
                          value={shippingAddress.neighborhood}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, neighborhood: e.target.value })}
                          required
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="city" className="text-sm font-medium">Cidade</Label>
                        <Input
                          id="city"
                          placeholder="Cidade"
                          value={shippingAddress.city}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                          required
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="state" className="text-sm font-medium">Estado (UF)</Label>
                        <Input
                          id="state"
                          placeholder="SP"
                          maxLength={2}
                          value={shippingAddress.state}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value.toUpperCase() })}
                          required
                          className="rounded-xl h-11 bg-muted/20 border-border/80 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
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
                      <Label htmlFor="saveAddress" className="text-xs text-muted-foreground leading-none cursor-pointer">
                        Salvar este endereço para facilitar futuras compras de recompra.
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-primary">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <span className="font-bold block">Pedido 100% Digital</span>
                    Nenhum endereço de entrega física é necessário. Os links e acessos serão entregues imediatamente no WhatsApp fornecido.
                  </div>
                </div>
              )}

              <Card className="rounded-3xl border border-border/80 bg-white shadow-sm overflow-hidden">
                <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/40">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Forma de Pagamento
                  </CardTitle>
                  <CardDescription>
                    Selecione como deseja pagar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 sm:p-8 space-y-5">
                  <RadioGroup
                    value={selectedGateway}
                    onValueChange={setSelectedGateway}
                    className="grid gap-4"
                  >
                    <div className="flex items-center space-x-3 rounded-2xl border border-border p-4 bg-muted/10 hover:border-primary/50 transition-all">
                      <RadioGroupItem value="woovi" id="woovi" />
                      <Label htmlFor="woovi" className="flex flex-1 items-center justify-between cursor-pointer">
                        <span className="font-semibold text-sm">Pix (Woovi/Rove)</span>
                        <QrCode className="h-5 w-5 text-primary" />
                      </Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl h-13 text-base font-bold shadow-md shadow-primary/20 hover:opacity-95 transition-all"
              >
                {submitting ? 'Gerando Pix Woovi...' : 'Avançar para Pagamento Pix'}
              </Button>
            </form>
          )}

          {/* STEP 2: Tela de Pagamento Pix */}
          {step === 'payment' && createdOrder && (
            <Card className="rounded-3xl border border-border/80 bg-white shadow-sm overflow-hidden text-center">
              <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/40">
                <CardTitle className="text-2xl font-extrabold flex items-center justify-center gap-2">
                  <CreditCard className="h-6 w-6 text-primary" />
                  Pagamento Pix Woovi
                </CardTitle>
                <CardDescription>
                  Pague com Pix para receber seus produtos instantaneamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-8 space-y-6">
                
                {/* Timer */}
                {timeLeft > 0 ? (
                  <div className="flex items-center justify-center gap-1.5 text-sm font-semibold bg-amber-500/10 rounded-full py-1.5 px-4 w-max mx-auto text-amber-600 border border-amber-500/20">
                    <Clock className="h-4 w-4 animate-spin" />
                    <span>Aguardando pagamento: {formatTime(timeLeft)}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-sm font-semibold bg-red-500/10 rounded-2xl p-4 mx-auto text-red-500 border border-red-500/20">
                    <AlertCircle className="h-6 w-6" />
                    <span className="text-lg font-bold">Pix Expirado!</span>
                    <span className="font-normal text-xs text-muted-foreground text-center">
                      O tempo limite para pagamento deste Pix acabou.<br/>
                      Por favor, recarregue a página e faça um novo pedido.
                    </span>
                  </div>
                )}

                {/* QR Code */}
                {timeLeft > 0 && (
                  createdOrder.woovi_qrcode_image ? (
                    <div className="mx-auto border border-border/80 rounded-2xl p-4 bg-white h-56 w-56 flex items-center justify-center shadow-sm">
                      <img src={createdOrder.woovi_qrcode_image} alt="Pix QR Code" className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className="mx-auto border border-dashed border-border/80 rounded-2xl p-6 h-56 w-56 flex flex-col items-center justify-center text-muted-foreground text-xs">
                      <QrCode className="h-10 w-10 mb-2 opacity-50" />
                      <span>QR Code indisponível</span>
                    </div>
                  )
                )}

                {/* Copia e Cola */}
                {timeLeft > 0 && createdOrder.woovi_brcode && (
                  <div className="space-y-2 text-left max-w-sm mx-auto">
                    <Label className="text-xs font-bold text-muted-foreground block text-center">Código Pix Copia e Cola:</Label>
                    <div className="flex gap-2 border border-border/80 rounded-xl p-2.5 bg-muted/20 break-all font-mono text-[10px] items-center">
                      <span className="flex-1 max-h-12 overflow-y-auto select-all leading-normal">
                        {createdOrder.woovi_brcode}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(createdOrder.woovi_brcode)}
                        className="h-8 w-8 shrink-0 hover:bg-background rounded-lg"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-3.5 text-xs text-emerald-600 max-w-sm mx-auto">
                  <span className="font-semibold block mb-0.5">Confirmação Instantânea</span>
                  Assim que pagar, a tela irá atualizar automaticamente para a confirmação de envio.
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Sucesso do Pagamento */}
          {step === 'success' && createdOrder && (
            <Card className="rounded-3xl border border-emerald-500/30 shadow-sm text-center bg-white overflow-hidden">
              <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/40">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-4 animate-bounce">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <CardTitle className="text-2xl font-extrabold text-emerald-600">Pagamento Confirmado!</CardTitle>
                <CardDescription>
                  Seu Pix foi processado e aprovado com sucesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-8 space-y-6">
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Muito obrigado por sua compra! O recibo de pagamento e as informações de entrega foram enviados automaticamente em seu WhatsApp.
                </p>

                <Button
                  className="rounded-2xl h-13 px-8 text-base font-bold shadow-md shadow-primary/20 hover:opacity-95 transition-all"
                  onClick={() => router.push(`/shop/${tenantSlug}`)}
                >
                  Voltar para a Vitrine
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lado Direito: Resumo do Pedido */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6 sticky top-24">
          <Card className="rounded-3xl border border-border/80 bg-white shadow-sm overflow-hidden">
            <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/40">
              <CardTitle className="text-lg font-bold flex items-center justify-between">
                <span>Resumo do Pedido</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {hydratedItems.reduce((acc, i) => acc + i.quantity, 0)} {hydratedItems.reduce((acc, i) => acc + i.quantity, 0) === 1 ? 'item' : 'itens'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 space-y-5">
              {/* Itens com Imagens de Capa, quantidades, detalhes e preços */}
              <div className="divide-y divide-border/40 max-h-[360px] overflow-y-auto pr-1 space-y-3">
                {hydratedItems.map((item) => {
                  const attrs = Object.entries(item.attributes).map(([, v]) => `${v}`).join(' / ');
                  return (
                    <div key={item.variationId} className="pt-3 first:pt-0 flex items-center gap-3.5 text-sm">
                      {item.coverImage ? (
                        <div className="h-14 w-14 rounded-xl border border-border/60 bg-muted/20 overflow-hidden shrink-0">
                          <img src={item.coverImage} alt={item.productName} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-14 w-14 rounded-xl border border-border/60 bg-muted/30 flex items-center justify-center shrink-0 text-muted-foreground">
                          <ShoppingBag className="h-6 w-6 opacity-40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-semibold text-foreground truncate text-sm">{item.productName}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Qtd: <span className="font-medium text-foreground">{item.quantity}</span> {attrs && `| ${attrs}`}
                        </div>
                        <div className="text-xs font-medium text-muted-foreground">
                          R$ {item.price.toFixed(2)} / un
                        </div>
                      </div>
                      <div className="font-bold text-foreground text-sm shrink-0">
                        R$ {(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totais */}
              <div className="border-t border-border/60 pt-4 text-xs space-y-2.5">
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
                <div className="flex justify-between items-baseline border-t border-border/60 pt-3 text-foreground">
                  <span className="text-sm font-bold">Total Geral:</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
                    R$ {orderTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Link voltar ao carrinho — só no step de formulário */}
              {step === 'form' && (
                <button
                  type="button"
                  onClick={() => router.push(`/shop/${tenantSlug}`)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar e editar carrinho
                </button>
              )}
            </CardContent>
          </Card>
        </div>

      </main>
    </div>
  );
}

