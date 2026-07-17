'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductCategory, ProductVariation, WooviConfig } from '@/types';
import { CartDrawer } from '@/components/shop/cart-drawer';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShoppingBag,
  Search,
  Layers,
  Store,
  ShoppingCart,
  Plus,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

type ExtendedProduct = Product & {
  variations: ProductVariation[];
  category?: ProductCategory | null;
};

export default function StorefrontPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string; // account_id or slug
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WooviConfig | null>(null);
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Password protection state
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<{ variationId: string; quantity: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const loadStoreData = useCallback(async () => {
    if (!tenantSlug) return;

    try {
      setLoading(true);

      // 1. Fetch Woovi Config for branding
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

      // 2. Fetch categories using resolved account_id
      const { data: catData } = await supabase
        .from('product_categories')
        .select('*')
        .eq('account_id', configData.account_id)
        .order('name');
      if (catData) setCategories(catData);

      // 3. Fetch active products with variations using resolved account_id
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select(`
          *,
          category:product_categories(*),
          variations:product_variations(*)
        `)
        .eq('account_id', configData.account_id)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (prodError) throw prodError;
      if (prodData) setProducts(prodData as ExtendedProduct[]);

    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar a loja.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, supabase]);

  useEffect(() => {
    loadStoreData();
  }, [loadStoreData]);

  // Load cart from LocalStorage using resolved account_id
  useEffect(() => {
    if (!config?.account_id) return;
    
    // Check authentication for password protected stores
    const hasAuth = sessionStorage.getItem("auth_shop_" + config.account_id) === 'true';
    setAuthenticated(hasAuth);

    const savedCart = localStorage.getItem(`cart_${config.account_id}`);
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (e) {
        console.error(e);
      }
    }
  }, [config?.account_id]);

  const updateCart = (items: { variationId: string; quantity: number }[]) => {
    setCartItems(items);
    if (config?.account_id) {
      localStorage.setItem(`cart_${config.account_id}`, JSON.stringify(items));
    }
  };

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

  const handleAddToCart = (variationId: string) => {
    const existing = cartItems.find((item) => item.variationId === variationId);
    let updated;
    if (existing) {
      updated = cartItems.map((item) =>
        item.variationId === variationId ? { ...item, quantity: item.quantity + 1 } : item
      );
    } else {
      updated = [...cartItems, { variationId, quantity: 1 }];
    }
    updateCart(updated);
    toast.success('Produto adicionado ao carrinho!');
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Se a loja não tem credenciais Woovi, exibe erro
  if (!config || !config.app_id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <Store className="h-12 w-12 text-muted-foreground opacity-55 mb-2" />
        <h2 className="text-xl font-bold">Loja Indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Esta loja ainda não concluiu a configuração de pagamentos Pix. Por favor, tente novamente mais tarde.
        </p>
      </div>
    );
  }

  // Tela de Senha
  if (config.password_protected && !authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center selection:bg-primary selection:text-primary-foreground">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-lg">
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
    <div className="min-h-screen bg-muted/20 pb-16 text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      {/* Cabeçalho Fixo */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-5xl flex h-16 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4 flex-1">
            {config.store_logo_url ? (
              <img src={config.store_logo_url} alt="Logo" className="h-10 w-auto max-w-[160px] object-contain shrink-0" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Store className="h-5 w-5" />
              </div>
            )}

            {/* Barra de Pesquisa no Header */}
            <div className="relative max-w-xs w-full hidden sm:block">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Pesquisar na vitrine..."
                className="pl-8.5 bg-muted/40 hover:bg-muted/60 focus:bg-background h-9 text-xs transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="relative"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-in zoom-in">
                  {cartCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Barra de Pesquisa Móvel (Visível apenas em telas menores) */}
        <div className="border-t border-border px-4 py-2 bg-background sm:hidden">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Pesquisar na vitrine..."
              className="pl-8.5 bg-muted/40 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-5xl px-4 mt-8 space-y-6">
        {/* Categorias */}
        <div className="space-y-4">
          {/* Abas de Categoria */}
          <div className="flex border-b border-border overflow-x-auto pb-px scrollbar-none">
            <div className="flex space-x-2 min-w-max pb-1">
              <Button
                variant={selectedCategory === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedCategory('all')}
                className="text-xs rounded-full h-8"
              >
                Todos
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="text-xs rounded-full h-8"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Listagem do Grid */}
        {filteredProducts.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground rounded-xl border border-dashed border-border bg-background p-6">
            <ShoppingBag className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm font-medium">Nenhum produto encontrado nesta busca.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((p) => {
              const coverImg = p.images && p.images.length > 0 ? p.images[0] : null;
              const variations = p.variations || [];
              const defaultVariation = variations[0];

              if (!defaultVariation) return null;

              const minPrice = Math.min(...variations.map((v) => Number(v.price)));
              const hasMultiplePrices = variations.some((v) => Number(v.price) !== minPrice);

              return (
                <div
                  key={p.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition-all"
                >
                  <div>
                    {/* Imagem do Produto */}
                    <div className="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
                      {coverImg ? (
                        <img
                          src={coverImg}
                          alt={p.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-30" />
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant={p.product_type === 'digital' ? 'secondary' : 'default'} className="text-[10px]">
                          {p.product_type === 'digital' ? 'Digital' : 'Físico'}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="text-[10px] text-primary font-semibold flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {p.category?.name || 'Sem Categoria'}
                      </div>
                      <h3 className="font-bold text-lg leading-tight line-clamp-1">{p.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {p.description || 'Sem descrição adicional.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 pt-0 space-y-4">
                    <div className="flex items-baseline justify-between border-t border-border/60 pt-3">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">A partir de</span>
                        <span className="text-xl font-extrabold text-foreground">
                          R$ {minPrice.toFixed(2)}
                        </span>
                      </div>
                      {p.product_type === 'physical' && (
                        <span className="text-xs text-muted-foreground">
                          Estoque disponível
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {/* Detalhes */}
                      <a
                        href={`/shop/${tenantSlug}/product/${p.slug}`}
                        className="flex-1 inline-flex items-center justify-center rounded-xl border border-input bg-background text-sm font-semibold hover:bg-accent h-10 transition-colors"
                      >
                        Ver Detalhes
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                      </a>
                      
                      {/* Compra rápida */}
                      {variations.length === 1 && (
                        <Button
                          variant="default"
                          size="icon"
                          onClick={() => handleAddToCart(defaultVariation.id)}
                          className="h-10 w-10 shrink-0 rounded-xl"
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
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
