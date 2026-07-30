'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductVariation, WooviConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ShoppingBag,
  ArrowLeft,
  Minus,
  Plus,
  Trash2,
  Lock,
  Search,
  ShoppingCart,
  Heart
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
  stock: number;
  attributes: Record<string, string>;
  productName: string;
  productType: 'physical' | 'digital';
  coverImage: string | null;
}

export default function CartPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WooviConfig | null>(null);
  
  const [cartItems, setCartItems] = useState<CartItemInput[]>([]);
  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[]>([]);

  // Password verification logic (same as storefront)
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // 1. Fetch Config and Verify Password
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/shop/config?tenantSlug=${tenantSlug}`);
        if (!res.ok) throw new Error('Erro ao carregar loja');
        const data = await res.json();
        setConfig(data);
        
        if (data.has_password) {
          const authKey = `store_auth_${data.account_id}`;
          if (localStorage.getItem(authKey) === 'true') {
            setAuthenticated(true);
          }
        } else {
          setAuthenticated(true);
        }
      } catch (error) {
        console.error(error);
        toast.error('Loja não encontrada');
      }
    }
    loadConfig();
  }, [tenantSlug]);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/shop/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: config.account_id, password: passwordInput })
      });
      if (!res.ok) throw new Error('Senha incorreta');
      localStorage.setItem(`store_auth_${config.account_id}`, 'true');
      setAuthenticated(true);
      toast.success('Acesso liberado!');
    } catch (err: any) {
      toast.error(err.message || 'Senha incorreta');
    } finally {
      setVerifying(false);
    }
  };

  // 2. Load Cart from LocalStorage
  useEffect(() => {
    if (config && authenticated) {
      const cartKey = `cart_${config.account_id}`;
      const saved = localStorage.getItem(cartKey);
      if (saved) {
        try {
          setCartItems(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      } else {
        setCartItems([]);
      }
    }
  }, [config, authenticated]);

  // 3. Hydrate Cart Items
  const hydrateCart = useCallback(async () => {
    if (!config) return;
    if (cartItems.length === 0) {
      setHydratedItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const variationIds = cartItems.map(item => item.variationId);

      const { data: varData, error } = await supabase
        .from('product_variations')
        .select(`
          *,
          product:products(*)
        `)
        .in('id', variationIds);

      if (error) throw error;

      if (varData) {
        const hydrated = cartItems.map(item => {
          const matchedVar = varData.find(v => v.id === item.variationId);
          if (!matchedVar) return null;

          const prod = matchedVar.product;
          return {
            variationId: item.variationId,
            quantity: item.quantity,
            price: Number(matchedVar.price),
            stock: Number(matchedVar.stock),
            attributes: matchedVar.attributes || {},
            productName: prod?.name || 'Produto',
            productType: prod?.product_type || 'physical',
            coverImage: prod?.images && prod?.images.length > 0 ? prod.images[0] : null
          } as HydratedCartItem;
        }).filter((item): item is HydratedCartItem => item !== null);

        setHydratedItems(hydrated);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar detalhes dos produtos.');
    } finally {
      setLoading(false);
    }
  }, [cartItems, config, supabase]);

  useEffect(() => {
    if (authenticated) {
      hydrateCart();
    }
  }, [cartItems, authenticated, hydrateCart]);

  // Update Cart logic
  const saveCart = (items: CartItemInput[]) => {
    if (!config) return;
    setCartItems(items);
    localStorage.setItem(`cart_${config.account_id}`, JSON.stringify(items));
  };

  const handleUpdateQuantity = (variationId: string, delta: number) => {
    const matched = hydratedItems.find(item => item.variationId === variationId);
    if (!matched) return;

    const newQty = matched.quantity + delta;
    if (newQty <= 0) return; // Prevent zero or negative. User should use Trash button to remove.

    if (matched.productType === 'physical' && delta > 0 && newQty > matched.stock) {
      toast.warning(`Limite de estoque atingido (${matched.stock} disponíveis).`);
      return;
    }

    const updated = cartItems.map(item =>
      item.variationId === variationId ? { ...item, quantity: newQty } : item
    );
    saveCart(updated);
  };

  const handleRemoveItem = (variationId: string) => {
    const updated = cartItems.filter(item => item.variationId !== variationId);
    saveCart(updated);
    toast.success('Produto removido.');
  };

  // Render logic
  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (config.has_password && !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl space-y-6">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Loja Protegida</h1>
            <p className="text-gray-500">Digite a senha para acessar.</p>
          </div>
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <Input
              type="password"
              placeholder="Senha de acesso"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="h-12"
              required
            />
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={verifying}>
              {verifying ? 'Verificando...' : 'Acessar Loja'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const primaryColor = config.theme_color || '#000000';
  const subtotal = hydratedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Calculate Frete: if any item is physical, display default or custom fee (we'll display a mocked calculation as per brief, R$ 0.00 if no physical or mocked fee)
  const hasPhysicalItems = hydratedItems.some(item => item.productType === 'physical');
  const shippingFee = hasPhysicalItems ? 15.00 : 0.00; // Mocked R$ 15.00 for physical items, else R$ 0.00
  const total = subtotal + shippingFee;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans" style={{ '--theme-color': primaryColor } as React.CSSProperties}>
      {/* Sleek Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-xl hover:bg-gray-100" 
              onClick={() => router.push(`/shop/${tenantSlug}`)}
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Button>
            <div className="font-bold text-xl text-gray-900 tracking-tight">
              {config.name || 'Loja'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-xl text-gray-600 hover:bg-gray-100 hidden sm:flex">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-xl text-gray-600 hover:bg-gray-100 hidden sm:flex">
              <Heart className="h-5 w-5" />
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" className="rounded-xl text-gray-600 hover:bg-gray-100">
                <ShoppingCart className="h-5 w-5" />
              </Button>
              {cartItems.length > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Seu Carrinho</h1>

        {loading ? (
          <div className="flex justify-center items-center h-64">
             <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--theme-color)] border-t-transparent" />
          </div>
        ) : hydratedItems.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center text-center max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-500">
            <div className="h-24 w-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <ShoppingBag className="h-10 w-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Seu carrinho está vazio</h2>
            <p className="text-gray-500 mb-8 max-w-sm">
              Parece que você ainda não adicionou nenhum produto ao seu carrinho. Que tal dar uma olhada nas novidades?
            </p>
            <Button 
              className="h-12 px-8 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95 text-white" 
              style={{ backgroundColor: primaryColor }}
              onClick={() => router.push(`/shop/${tenantSlug}`)}
            >
              Continuar Comprando
            </Button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Cart Items Table */}
            <div className="flex-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produto</th>
                        <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalhes</th>
                        <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Preço</th>
                        <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Quantidade</th>
                        <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Subtotal</th>
                        <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {hydratedItems.map((item) => {
                        const attrs = Object.entries(item.attributes)
                          .map(([k, v]) => `${v}`)
                          .join(' / ');

                        const itemSubtotal = item.price * item.quantity;

                        return (
                          <tr key={item.variationId} className="hover:bg-gray-50/30 transition-colors">
                            <td className="py-5 px-6">
                              <div className="flex items-center gap-4">
                                <div className="h-16 w-16 bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-100">
                                  {item.coverImage ? (
                                    <img src={item.coverImage} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                      <ShoppingBag className="h-6 w-6 text-gray-300" />
                                    </div>
                                  )}
                                </div>
                                <div className="font-semibold text-gray-900 max-w-[200px] truncate">
                                  {item.productName}
                                </div>
                              </div>
                            </td>
                            <td className="py-5 px-6">
                              <div className="text-sm text-gray-600">
                                {item.productType === 'digital' ? 'Digital' : 'Físico'}
                                {attrs && <span className="block mt-1 text-xs bg-gray-100 px-2 py-1 rounded-md inline-block text-gray-600">{attrs}</span>}
                              </div>
                            </td>
                            <td className="py-5 px-6">
                              <div className="font-medium text-gray-900">
                                R$ {item.price.toFixed(2)}
                              </div>
                            </td>
                            <td className="py-5 px-6 text-center">
                              <div className="inline-flex items-center justify-center p-1 rounded-lg border border-gray-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(item.variationId, -1)}
                                  className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-10 text-center font-semibold text-gray-900 text-sm">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(item.variationId, 1)}
                                  className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                            <td className="py-5 px-6 text-right">
                              <div className="font-bold" style={{ color: primaryColor }}>
                                R$ {itemSubtotal.toFixed(2)}
                              </div>
                            </td>
                            <td className="py-5 px-6 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.variationId)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Cart Summary Card */}
            <div className="lg:w-[380px] shrink-0">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Resumo do Pedido</h3>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium text-gray-900">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span>Frete</span>
                    <span className="font-medium text-gray-900">
                      {shippingFee === 0 ? 'Grátis' : `R$ ${shippingFee.toFixed(2)}`}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Input placeholder="Cupom de desconto" className="h-10 text-sm" />
                    <Button variant="outline" className="h-10 px-4 font-semibold shrink-0">Aplicar</Button>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mb-8">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900">Total</span>
                    <span className="text-2xl font-black" style={{ color: primaryColor }}>
                      R$ {total.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 text-right mt-1">Impostos inclusos</p>
                </div>

                <div className="space-y-3">
                  <Button 
                    className="w-full h-12 rounded-xl font-bold text-base transition-transform hover:scale-[1.02] active:scale-[0.98] text-white shadow-lg"
                    style={{ backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}40` }}
                    onClick={() => router.push(`/shop/${tenantSlug}/checkout`)}
                  >
                    Avançar para o Checkout
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full h-12 rounded-xl font-semibold border-gray-200 text-gray-700 hover:bg-gray-50"
                    onClick={() => router.push(`/shop/${tenantSlug}`)}
                  >
                    Continuar Comprando
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
