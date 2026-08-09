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
  ChevronLeft,
  ShoppingCart,
  ShoppingBag,
  Store,
  Plus,
  Minus,
  Truck,
  Layers,
  Lock,
  Heart,
  Star,
  Search,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

type ExtendedProduct = Product & {
  variations: ProductVariation[];
  category?: ProductCategory | null;
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenantSlug as string; // account_id or slug
  const productSlug = params.productSlug as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WooviConfig | null>(null);
  const [product, setProduct] = useState<ExtendedProduct | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Selected states
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState<ExtendedProduct[]>([]);

  // Password protection state
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<{ variationId: string; quantity: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Wishlist state
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!tenantSlug || !productSlug) return;

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

      // Fetch categories & active products count for sidebar
      const { data: catData } = await supabase
        .from('product_categories')
        .select('*')
        .eq('account_id', configData.account_id)
        .order('name');
      if (catData) setCategories(catData);

      const { data: activeProds } = await supabase
        .from('products')
        .select('id, category_id')
        .eq('account_id', configData.account_id)
        .eq('active', true);
      if (activeProds) setAllProducts(activeProds as Product[]);

      // 2. Fetch Product detail with category and variations using resolved account_id
      const isProdUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productSlug);
      let prodQuery = supabase
        .from('products')
        .select(`
          *,
          category:product_categories(*),
          variations:product_variations(*)
        `)
        .eq('account_id', configData.account_id)
        .eq('active', true);

      if (isProdUuid) {
        prodQuery = prodQuery.or(`slug.eq.${productSlug},id.eq.${productSlug}`);
      } else {
        prodQuery = prodQuery.eq('slug', productSlug);
      }

      let { data: prodData, error: prodError } = await prodQuery.maybeSingle();

      if (!prodData && !isProdUuid) {
        const { data: fallbackData } = await supabase
          .from('products')
          .select(`
            *,
            category:product_categories(*),
            variations:product_variations(*)
          `)
          .eq('account_id', configData.account_id)
          .eq('active', true)
          .ilike('slug', productSlug)
          .maybeSingle();

        if (fallbackData) {
          prodData = fallbackData;
        }
      }

      if (prodError) throw prodError;

      if (prodData) {
        const extendedProd = prodData as ExtendedProduct;
        setProduct(extendedProd);

        // Pre-select first image
        if (extendedProd.images && extendedProd.images.length > 0) {
          setActiveImage(extendedProd.images[0]);
        }

        // Pre-select first variation
        if (extendedProd.variations && extendedProd.variations.length > 0) {
          setSelectedVariation(extendedProd.variations[0]);
        }

        // Fetch related products (excluding current product)
        const { data: relatedData } = await supabase
          .from('products')
          .select(`
            *,
            category:product_categories(*),
            variations:product_variations(*)
          `)
          .eq('account_id', configData.account_id)
          .eq('active', true)
          .neq('id', extendedProd.id)
          .limit(4);

        if (relatedData) {
          setRelatedProducts(relatedData as ExtendedProduct[]);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar detalhes do produto.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, productSlug, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load cart, wishlist and check password protection
  useEffect(() => {
    if (!config?.account_id) return;

    // Check authentication for password protected stores
    const hasAuth = sessionStorage.getItem("auth_shop_" + config.account_id) === 'true';
    setAuthenticated(hasAuth);

    // Load cart
    const savedCart = localStorage.getItem(`cart_${config.account_id}`);
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (e) {
        console.error(e);
      }
    }

    // Load wishlist
    const savedWishlist = localStorage.getItem(`wishlist_${config.account_id}`);
    if (savedWishlist) {
      try {
        setWishlistIds(JSON.parse(savedWishlist));
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

  const handleToggleWishlist = (productId: string) => {
    if (!config?.account_id) return;
    let updated: string[];
    if (wishlistIds.includes(productId)) {
      updated = wishlistIds.filter((id) => id !== productId);
      toast.success('Produto removido da lista de desejos.');
    } else {
      updated = [...wishlistIds, productId];
      toast.success('Produto adicionado à lista de desejos!');
    }
    setWishlistIds(updated);
    localStorage.setItem(`wishlist_${config.account_id}`, JSON.stringify(updated));
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

  const handleAddToCart = () => {
    if (!selectedVariation) return;

    const existing = cartItems.find((item) => item.variationId === selectedVariation.id);
    let updated;
    if (existing) {
      updated = cartItems.map((item) =>
        item.variationId === selectedVariation.id
          ? { ...item, quantity: item.quantity + quantity }
          : item
      );
    } else {
      updated = [...cartItems, { variationId: selectedVariation.id, quantity }];
    }
    updateCart(updated);
    toast.success('Produto adicionado ao carrinho!');
    setCartOpen(true);
  };

  const handleBuyNow = () => {
    if (!selectedVariation) return;

    const existing = cartItems.find((item) => item.variationId === selectedVariation.id);
    let updated;
    if (existing) {
      updated = cartItems.map((item) =>
        item.variationId === selectedVariation.id
          ? { ...item, quantity: item.quantity + quantity }
          : item
      );
    } else {
      updated = [...cartItems, { variationId: selectedVariation.id, quantity }];
    }
    updateCart(updated);
    router.push(`/shop/${tenantSlug}/checkout`);
  };

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Tela de Senha
  if (config?.password_protected && !authenticated) {
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

  if (!product || !config) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center">
        <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-55 mb-2" />
        <h2 className="text-xl font-bold">Produto não encontrado</h2>
        <Button variant="link" onClick={() => router.push(`/shop/${tenantSlug}`)} className="text-primary mt-1">
          Voltar para a vitrine
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-16 text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      {/* Header Fixo */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto max-w-[1720px] w-full flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
          {/* Logo */}
          <div className="flex items-center gap-4 flex-shrink-0 cursor-pointer" onClick={() => router.push(`/shop/${tenantSlug}`)}>
            {config.store_logo_url ? (
              <img src={config.store_logo_url} alt="Logo" className="h-10 w-auto max-w-[160px] object-contain shrink-0" />
            ) : (
              <div className="flex items-center gap-2 text-xl font-bold text-primary">
                <Store className="h-6 w-6" />
                <span className="hidden sm:inline-block font-semibold">{config.store_name || 'Loja'}</span>
              </div>
            )}
          </div>

          {/* Search Header */}
          <div className="hidden flex-1 sm:flex justify-center px-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  router.push(`/shop/${tenantSlug}?search=${encodeURIComponent(searchQuery.trim())}`);
                }
              }}
              className="relative w-full max-w-lg"
            >
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                className="pl-10 bg-muted/30 border-border focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary rounded-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { window.location.href = `/shop/${tenantSlug}/wishlist` }}
              title="Lista de Desejos"
              className="relative hidden sm:inline-flex text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
            >
              <Heart className={`h-5 w-5 ${wishlistIds.length > 0 ? 'text-red-500 fill-red-500' : ''}`} />
              {wishlistIds.length > 0 && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-in zoom-in">
                  {wishlistIds.length}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
              onClick={() => setCartOpen(true)}
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

      <main className="mx-auto max-w-[1720px] w-full px-4 sm:px-8 lg:px-12 mt-6 sm:mt-8">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Sidebar Filters */}
          <aside className="hidden lg:block w-full lg:w-72 shrink-0 space-y-6">
            <div className="bg-white rounded-2xl border border-border/80 p-6 shadow-sm space-y-6">
              {/* Categorias */}
              <div>
                <h3 className="font-semibold mb-3 text-sm text-foreground uppercase tracking-wider">Categorias</h3>
                <div className="space-y-1">
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-between w-full ${
                      !product.category_id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                    onClick={() => router.push(`/shop/${tenantSlug}`)}
                  >
                    <span>Todas as categorias</span>
                    <span className="bg-background border border-border px-2 py-0.5 rounded-full text-[10px]">{allProducts.length}</span>
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-between w-full ${
                        product.category_id === cat.id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                      onClick={() => router.push(`/shop/${tenantSlug}?category=${cat.id}`)}
                    >
                      <span className="truncate pr-2 text-left">{cat.name}</span>
                      <span className="bg-background border border-border px-2 py-0.5 rounded-full text-[10px]">
                        {allProducts.filter((p) => p.category_id === cat.id).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-border" />

              {/* Tipo de Produto */}
              <div>
                <h3 className="font-semibold mb-3 text-sm text-foreground uppercase tracking-wider">Tipo</h3>
                <div className="space-y-2 px-1">
                  {[
                    { id: 'all', label: 'Todos os tipos' },
                    { id: 'physical', label: 'Físico' },
                    { id: 'digital', label: 'Digital' },
                  ].map((type) => (
                    <label
                      key={type.id}
                      className="flex items-center gap-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground group"
                      onClick={() => {
                        if (type.id === 'all') router.push(`/shop/${tenantSlug}`);
                        else router.push(`/shop/${tenantSlug}?type=${type.id}`);
                      }}
                    >
                      <input
                        type="radio"
                        name="product_type_sidebar"
                        value={type.id}
                        checked={type.id === 'all' ? false : product.product_type === type.id}
                        readOnly
                        className="text-primary focus:ring-primary h-4 w-4 border-gray-300 pointer-events-none"
                      />
                      <span className="group-hover:translate-x-0.5 transition-transform">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <hr className="border-border" />

              {/* Marca (Dummy) */}
              <div>
                <h3 className="font-semibold mb-3 text-sm text-foreground uppercase tracking-wider">Marca</h3>
                <div className="space-y-2 px-1">
                  {['Abbla', 'Premium', 'Essencial'].map((brand) => (
                    <label key={brand} className="flex items-center gap-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground group">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="group-hover:translate-x-0.5 transition-transform">{brand}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Content Area */}
          <div className="flex-1 space-y-8 min-w-0">
            {/* Breadcrumb / Retorno contextual */}
            <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <button 
                onClick={() => router.push(`/shop/${tenantSlug}`)} 
                className="hover:text-primary transition-colors"
              >
                Início
              </button>
              <span>/</span>
              {product.category && (
                <>
                  <span className="max-w-[150px] truncate hover:text-primary cursor-pointer" onClick={() => router.push(`/shop/${tenantSlug}?category=${product.category?.id}`)}>
                    {product.category.name}
                  </span>
                  <span>/</span>
                </>
              )}
              <span className="text-foreground font-semibold max-w-[250px] truncate">{product.name}</span>
            </nav>

            {/* Grid de Galeria e Painel de Compra */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Lado Esquerdo: Galeria (lg:col-span-6 xl:col-span-6) */}
              <div className="lg:col-span-6 xl:col-span-6 space-y-4">
                <div className="aspect-square max-w-[540px] mx-auto w-full rounded-3xl border border-border/80 bg-white overflow-hidden shadow-sm relative group flex items-center justify-center">
                  {activeImage ? (
                    <img src={activeImage} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <ShoppingBag className="h-20 w-20 text-muted-foreground opacity-30" />
                  )}
                  <div className="absolute top-4 left-4">
                    <Badge variant="outline" className="bg-white/80 backdrop-blur-md text-foreground border border-border/60 shadow-xs text-xs uppercase font-bold tracking-wider rounded-full px-3 py-1">
                      {product.product_type === 'digital' ? 'Digital' : 'Físico'}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleWishlist(product.id)}
                    className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/80 backdrop-blur-md text-gray-500 hover:text-red-500 hover:bg-white hover:scale-110 transition-all flex items-center justify-center shadow-md z-10"
                    title={wishlistIds.includes(product.id) ? "Remover da Lista de Desejos" : "Adicionar à Lista de Desejos"}
                  >
                    <Heart className={`h-5 w-5 ${wishlistIds.includes(product.id) ? 'fill-red-500 text-red-500' : ''}`} />
                  </button>
                </div>

                {/* Carrossel de Miniaturas */}
                {product.images && product.images.length > 1 && (
                  <div className="flex gap-3 overflow-x-auto pb-1 mt-4">
                    {product.images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImage(img)}
                        className={`relative h-18 w-18 sm:h-20 sm:w-20 rounded-xl overflow-hidden border bg-white shrink-0 transition-all ${
                          activeImage === img ? 'border-primary ring-2 ring-primary/20 scale-95' : 'border-border/80 hover:border-primary/50'
                        }`}
                      >
                        <img src={img} alt="Thumbnail" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lado Direito: Painel de Compra (lg:col-span-6 xl:col-span-6) */}
              <div className="lg:col-span-6 xl:col-span-6 bg-white rounded-3xl border border-border/80 p-6 sm:p-8 shadow-sm space-y-6 flex flex-col justify-between">
                <div className="space-y-5">
                  <div className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    {product.category?.name || 'Sem Categoria'}
                  </div>

                  <div>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight leading-tight">{product.name}</h1>
                    <div className="flex items-center gap-1 mt-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                      <span className="text-xs font-semibold text-muted-foreground ml-2">(4.8 / 5.0)</span>
                    </div>
                  </div>

                  {/* Preço Ativo */}
                  <div className="text-3xl sm:text-4xl font-black text-primary tracking-tight">
                    R$ {selectedVariation ? Number(selectedVariation.price).toFixed(2) : '0.00'}
                  </div>

                  <hr className="border-border/60" />

                  {/* Seletores de Variações */}
                  {product.variations && product.variations.length > 1 && (
                    <div className="space-y-3">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Opções disponíveis</span>
                      <div className="flex flex-wrap gap-2.5">
                        {product.variations.map((v) => {
                          const attrs = v.attributes || {};
                          const label = Object.values(attrs).join(' / ') || 'Padrão';
                          const isSelected = selectedVariation?.id === v.id;

                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setSelectedVariation(v);
                                setQuantity(1);
                              }}
                              className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition-all border ${
                                isSelected
                                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20 shadow-xs'
                                  : 'border-border bg-white text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                              }`}
                            >
                              {label} (R$ {Number(v.price).toFixed(2)})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Seleção de Quantidade */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quantidade</span>
                    <div className="flex items-center border border-border rounded-xl bg-muted/20 overflow-hidden h-11">
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="px-3.5 h-full flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="px-4 text-sm font-bold text-foreground min-w-[40px] text-center">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (product.product_type === 'physical' && selectedVariation && quantity >= selectedVariation.stock) {
                            toast.warning(`Limite de estoque atingido (${selectedVariation.stock} unidades disponíveis).`);
                            return;
                          }
                          setQuantity(quantity + 1);
                        }}
                        className="px-3.5 h-full flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Informações de Frete / Conteúdo */}
                  <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 flex gap-3 text-xs text-muted-foreground">
                    {product.product_type === 'digital' ? (
                      <>
                        <ShoppingBag className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span>Este é um <strong>produto digital</strong> (serviço, mentoria ou ebook). As instruções de acesso serão enviadas imediatamente em seu WhatsApp após o pagamento. Sem frete.</span>
                      </>
                    ) : (
                      <>
                        <Truck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span>
                          Frete calculated na finalização da compra. Taxa padrão da loja: R$ {Number(config.default_shipping_fee || 0).toFixed(2)}.
                          {product.shipping_fee && ` Taxa específica deste produto: R$ ${Number(product.shipping_fee).toFixed(2)}.`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="pt-6 border-t border-border/60 mt-auto flex flex-col gap-3">
                  <Button
                    className="w-full rounded-2xl h-13 text-base font-bold bg-primary text-primary-foreground shadow-md hover:opacity-95 transition-all"
                    onClick={handleBuyNow}
                    disabled={!!(product.product_type === 'physical' && selectedVariation && selectedVariation.stock <= 0)}
                  >
                    {product.product_type === 'physical' && selectedVariation && selectedVariation.stock <= 0
                      ? 'Esgotado'
                      : 'Comprar Agora'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-2xl h-13 text-base font-bold border-border bg-white text-foreground hover:bg-muted/50 transition-all"
                    onClick={handleAddToCart}
                    disabled={!!(product.product_type === 'physical' && selectedVariation && selectedVariation.stock <= 0)}
                  >
                    Adicionar ao Carrinho
                  </Button>
                </div>
              </div>
            </div>

            {/* Descrição Detalhada */}
            {product.description && (
              <div className="bg-white rounded-3xl border border-border/80 p-6 sm:p-8 shadow-sm mt-8 space-y-4">
                <h2 className="text-xl font-bold text-foreground tracking-tight">Descrição do Produto</h2>
                <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {product.description}
                </div>
              </div>
            )}

            {/* Produtos Relacionados */}
            {relatedProducts.length > 0 && (
              <div className="mt-12 space-y-6">
                <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Produtos Relacionados</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
                  {relatedProducts.map((p) => {
                    const coverImg = p.images && p.images.length > 0 ? p.images[0] : null;
                    const variations = p.variations || [];
                    const defaultVariation = variations[0];

                    if (!defaultVariation) return null;

                    const minPrice = Math.min(...variations.map((v) => Number(v.price)));

                    return (
                      <div
                        key={p.id}
                        className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-white overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1.5 hover:border-primary/30 transition-all duration-300"
                      >
                        <div>
                          {/* Imagem do Produto com Hover Effect */}
                          <a href={`/shop/${tenantSlug}/product/${p.slug || p.id}`} className="block relative aspect-square w-full bg-muted/30 flex items-center justify-center overflow-hidden">
                            {coverImg ? (
                              <img
                                src={coverImg}
                                alt={p.name}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-500 ease-out"
                              />
                            ) : (
                              <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-30" />
                            )}
                            <div className="absolute top-3 left-3">
                              <Badge variant="outline" className="bg-white/80 backdrop-blur-md text-foreground border border-border/60 shadow-xs text-[10px] uppercase font-bold tracking-wider rounded-full px-2.5 py-1">
                                {p.product_type === 'digital' ? 'Digital' : 'Físico'}
                              </Badge>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleWishlist(p.id);
                              }}
                              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/80 backdrop-blur-md text-gray-500 hover:text-red-500 hover:bg-white hover:scale-110 transition-all flex items-center justify-center shadow-md z-10"
                              title={wishlistIds.includes(p.id) ? "Remover da Lista de Desejos" : "Adicionar à Lista de Desejos"}
                            >
                              <Heart className={`h-4 w-4 ${wishlistIds.includes(p.id) ? 'fill-red-500 text-red-500' : ''}`} />
                            </button>
                          </a>

                          <div className="p-5 space-y-2.5">
                            {/* Avaliação & Categoria */}
                            <div className="flex items-center justify-between">
                              <div className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                                {p.category?.name || 'Sem Categoria'}
                              </div>
                              <div className="flex items-center gap-0.5 text-amber-400">
                                <Star className="h-3 w-3 fill-current" />
                                <Star className="h-3 w-3 fill-current" />
                                <Star className="h-3 w-3 fill-current" />
                                <Star className="h-3 w-3 fill-current" />
                                <Star className="h-3 w-3 fill-current text-muted-foreground/30" />
                              </div>
                            </div>

                            {/* Título & Descrição */}
                            <a href={`/shop/${tenantSlug}/product/${p.slug || p.id}`} className="block">
                              <h3 className="font-bold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1 leading-snug">{p.name}</h3>
                            </a>
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed h-9 mt-1">
                              {p.description || 'Produto incrível com a melhor qualidade para você.'}
                            </p>
                          </div>
                        </div>

                        <div className="p-5 pt-3 border-t border-border/40 bg-gray-50/30">
                          <div className="flex items-end justify-between mb-3">
                            <div>
                              <span className="text-[10px] text-muted-foreground block uppercase font-medium tracking-wide">A partir de</span>
                              <span className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
                                R$ {minPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <a
                              href={`/shop/${tenantSlug}/product/${p.slug || p.id}`}
                              className="flex-1 inline-flex items-center justify-center rounded-xl border border-input bg-white text-sm font-semibold hover:bg-muted/50 hover:text-primary hover:border-primary/50 transition-all h-10 shadow-2xs"
                            >
                              Detalhes
                            </a>
                            {variations.length === 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const firstVar = variations[0];
                                  if (firstVar) {
                                    const existing = cartItems.find((item) => item.variationId === firstVar.id);
                                    let updated;
                                    if (existing) {
                                      updated = cartItems.map((item) =>
                                        item.variationId === firstVar.id ? { ...item, quantity: item.quantity + 1 } : item
                                      );
                                    } else {
                                      updated = [...cartItems, { variationId: firstVar.id, quantity: 1 }];
                                    }
                                    updateCart(updated);
                                    toast.success('Produto adicionado ao carrinho!');
                                  }
                                }}
                                className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:opacity-90 shadow-sm active:scale-95 transition-transform flex items-center justify-center"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
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
