'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductCategory, ProductVariation, WooviConfig } from '@/types';
import { CartDrawer } from '@/components/shop/cart-drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Heart,
  Trash2,
  ShoppingBag,
  Store,
  ShoppingCart,
  ArrowLeft,
  Lock,
  Star,
  Search,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

type ExtendedProduct = Product & {
  variations: ProductVariation[];
  category?: ProductCategory | null;
};

export default function WishlistPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenantSlug as string; // account_id or slug
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [products, setProducts] = useState<ExtendedProduct[]>([]);

  // Password protection state
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<{ variationId: string; quantity: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const loadData = useCallback(async () => {
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

      // 2. Check Password Authentication
      const authKeySession = "auth_shop_" + configData.account_id;
      const authKeyLocal = "store_auth_" + configData.account_id;
      const isAuth =
        (!configData.password_protected && !configData.has_password) ||
        sessionStorage.getItem(authKeySession) === 'true' ||
        localStorage.getItem(authKeyLocal) === 'true';

      setAuthenticated(isAuth);

      // 3. Load Wishlist IDs from localStorage
      const wishlistKey = `wishlist_${configData.account_id}`;
      const savedWishlist = localStorage.getItem(wishlistKey);
      let parsedIds: string[] = [];
      if (savedWishlist) {
        try {
          parsedIds = JSON.parse(savedWishlist);
        } catch (e) {
          console.error('Error parsing wishlist localStorage:', e);
        }
      }
      setWishlistIds(parsedIds);

      // 4. Fetch products matching Wishlist IDs
      if (parsedIds.length > 0) {
        const { data: prodData, error: prodError } = await supabase
          .from('products')
          .select(`
            *,
            category:product_categories(*),
            variations:product_variations(*)
          `)
          .eq('account_id', configData.account_id)
          .in('id', parsedIds)
          .eq('active', true);

        if (prodError) throw prodError;

        if (prodData) {
          setProducts(prodData as ExtendedProduct[]);
        }
      } else {
        setProducts([]);
      }

      // 5. Load Cart items for cart badge/drawer
      const savedCart = localStorage.getItem(`cart_${configData.account_id}`);
      if (savedCart) {
        try {
          setCartItems(JSON.parse(savedCart));
        } catch (e) {
          console.error('Error parsing cart localStorage:', e);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar a lista de desejos.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/shop/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, password: passwordInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem("auth_shop_" + config.account_id, 'true');
        localStorage.setItem("store_auth_" + config.account_id, 'true');
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

  const updateCart = (items: { variationId: string; quantity: number }[]) => {
    setCartItems(items);
    if (config?.account_id) {
      localStorage.setItem(`cart_${config.account_id}`, JSON.stringify(items));
    }
  };

  const handleRemoveFromWishlist = (productId: string) => {
    if (!config?.account_id) return;
    const updatedIds = wishlistIds.filter((id) => id !== productId);
    setWishlistIds(updatedIds);
    localStorage.setItem(`wishlist_${config.account_id}`, JSON.stringify(updatedIds));
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    toast.success('Produto removido da lista de desejos.');
  };

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const primaryColor = config?.theme_color || '#000000';

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!config || !config.app_id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center">
        <Store className="h-12 w-12 text-muted-foreground opacity-55 mb-2" />
        <h2 className="text-xl font-bold">Loja Indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Esta loja ainda não concluiu a configuração de pagamentos Pix. Por favor, tente novamente mais tarde.
        </p>
      </div>
    );
  }

  if (config.password_protected && !authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center selection:bg-primary selection:text-primary-foreground">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-white p-8 shadow-sm">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
          </div>
          <h2 className="text-xl font-bold">Loja Protegida por Senha</h2>
          <p className="text-sm text-muted-foreground">
            Digite a senha de acesso fornecida pelo lojista para continuar.
          </p>
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <Input
              type="password"
              placeholder="Senha de acesso"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="bg-muted/50"
              required
            />
            <Button type="submit" disabled={verifying} className="w-full">
              {verifying ? 'Verificando...' : 'Acessar Loja'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#f8f9fa] pb-16 text-foreground antialiased selection:bg-primary selection:text-primary-foreground"
      style={{ '--theme-color': primaryColor } as React.CSSProperties}
    >
      {/* Header Fixo */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-white shadow-sm">
        <div className="mx-auto max-w-7xl flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Logo / Retorno */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => router.push(`/shop/${tenantSlug}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {config.store_logo_url ? (
              <img src={config.store_logo_url} alt="Logo" className="h-9 w-auto max-w-[150px] object-contain shrink-0" />
            ) : (
              <div className="flex items-center gap-2 text-xl font-bold text-primary">
                <Store className="h-6 w-6" />
                <span className="hidden sm:inline-block font-semibold">{config.store_name || 'Loja'}</span>
              </div>
            )}
          </div>

          {/* Title Middle */}
          <div className="hidden md:flex items-center gap-2 font-bold text-lg text-gray-900">
            <Heart className="h-5 w-5 text-red-500 fill-red-500" />
            <span>Lista de Desejos</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-primary bg-primary/10 hover:bg-primary/20"
              onClick={() => router.push(`/shop/${tenantSlug}/wishlist`)}
              title="Lista de Desejos"
            >
              <Heart className="h-5 w-5 fill-primary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
              onClick={() => setCartOpen(true)}
              title="Carrinho"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-in zoom-in">
                  {cartCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={() => router.push(`/shop/${tenantSlug}`)}
            className="hover:text-foreground transition-colors font-medium"
          >
            Início
          </button>
          <span>/</span>
          <span className="text-foreground font-semibold">Lista de Desejos</span>
        </nav>

        {/* Header da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Minha Lista de Desejos
              </h1>
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-bold bg-primary/10 text-primary">
                {products.length} {products.length === 1 ? 'produto' : 'produtos'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Guarde seus itens favoritos para consultar ou comprar a qualquer momento.
            </p>
          </div>

          {products.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold self-start sm:self-auto"
              onClick={() => router.push(`/shop/${tenantSlug}`)}
            >
              Continuar Comprando
            </Button>
          )}
        </div>

        {/* Grid ou Estado Vazio */}
        {products.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center text-center max-w-xl mx-auto my-12 animate-in fade-in zoom-in-95 duration-500">
            <div className="h-20 w-20 bg-red-50 rounded-full flex items-center justify-center mb-6 text-red-500 shadow-inner">
              <Heart className="h-10 w-10 fill-red-500/20" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Sua lista de desejos está vazia
            </h2>
            <p className="text-gray-500 text-sm mb-8 max-w-sm leading-relaxed">
              Você ainda não adicionou nenhum produto aos seus favoritos. Explore nossa loja e clique no coração para salvar seus itens preferidos!
            </p>
            <Button
              className="h-12 px-8 rounded-xl font-bold text-white transition-transform hover:scale-105 active:scale-95 shadow-md"
              style={{ backgroundColor: primaryColor }}
              onClick={() => router.push(`/shop/${tenantSlug}`)}
            >
              Explorar Produtos
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((p) => {
              const coverImg = p.images && p.images.length > 0 ? p.images[0] : null;
              const variations = p.variations || [];
              const minPrice =
                variations.length > 0
                  ? Math.min(...variations.map((v) => Number(v.price)))
                  : 0;

              return (
                <div
                  key={p.id}
                  className="group flex flex-col justify-between rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300"
                >
                  <div>
                    {/* Cover Image */}
                    <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden">
                      {coverImg ? (
                        <img
                          src={coverImg}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-500 ease-out"
                        />
                      ) : (
                        <ShoppingBag className="h-12 w-12 text-gray-300" />
                      )}

                      {/* Product Type Badge */}
                      <Badge
                        variant={p.product_type === 'digital' ? 'secondary' : 'default'}
                        className="absolute top-3 left-3 text-[10px] uppercase font-bold shadow-sm backdrop-blur-md bg-white/90"
                      >
                        {p.product_type === 'digital' ? 'Digital' : 'Físico'}
                      </Badge>

                      {/* Quick Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveFromWishlist(p.id)}
                        className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/90 backdrop-blur-md text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center shadow-sm"
                        title="Remover da lista de desejos"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Card Content */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                          {p.category?.name || 'Geral'}
                        </span>
                        <div className="flex items-center gap-0.5 text-amber-400">
                          <Star className="h-3 w-3 fill-current" />
                          <Star className="h-3 w-3 fill-current" />
                          <Star className="h-3 w-3 fill-current" />
                          <Star className="h-3 w-3 fill-current" />
                          <Star className="h-3 w-3 fill-current text-gray-200" />
                        </div>
                      </div>

                      <a href={`/shop/${tenantSlug}/product/${p.slug || p.id}`} className="block">
                        <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                          {p.name}
                        </h3>
                      </a>

                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed h-8">
                        {p.description || 'Produto incrível com excelente qualidade.'}
                      </p>

                      <div className="pt-2">
                        <span className="text-[10px] text-gray-400 block uppercase font-medium">A partir de</span>
                        <span className="text-xl font-black text-gray-900" style={{ color: primaryColor }}>
                          R$ {minPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="p-4 pt-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2">
                    <Button
                      variant="default"
                      className="flex-1 h-9 rounded-xl text-xs font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
                      style={{ backgroundColor: primaryColor }}
                      onClick={() => router.push(`/shop/${tenantSlug}/product/${p.slug || p.id}`)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Ver Detalhes
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 px-3 rounded-xl text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleRemoveFromWishlist(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        tenantSlug={tenantSlug}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        onUpdateCart={updateCart}
      />
    </div>
  );
}
