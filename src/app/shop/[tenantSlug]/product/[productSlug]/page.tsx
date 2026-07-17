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

      // 2. Fetch Product detail with category and variations using resolved account_id
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select(`
          *,
          category:product_categories(*),
          variations:product_variations(*)
        `)
        .eq('account_id', configData.account_id)
        .eq('slug', productSlug)
        .eq('active', true)
        .maybeSingle();

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

  // Load cart and check password protection
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

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

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

  if (!product || !config) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-55 mb-2" />
        <h2 className="text-xl font-bold">Produto não encontrado</h2>
        <Button variant="link" onClick={() => router.push(`/shop/${tenantSlug}`)} className="text-primary mt-1">
          Voltar para a vitrine
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-16 text-foreground antialiased">
      {/* Cabeçalho Fixo */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-5xl flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {config.store_logo_url ? (
              <img src={config.store_logo_url} alt="Logo" className="h-8 w-auto max-w-[120px] object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Store className="h-4 w-4" />
              </div>
            )}
          </div>

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
      </header>

      <main className="mx-auto max-w-4xl px-4 mt-6">
        {/* Breadcrumb / Retorno contextual */}
        <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <button 
            onClick={() => router.push(`/shop/${tenantSlug}`)} 
            className="hover:text-foreground transition-colors font-medium"
          >
            Início
          </button>
          <span>/</span>
          {product.category && (
            <>
              <span className="max-w-[120px] truncate">{product.category.name}</span>
              <span>/</span>
            </>
          )}
          <span className="text-foreground font-semibold max-w-[200px] truncate">{product.name}</span>
        </nav>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Lado Esquerdo: Galeria */}
          <div className="space-y-4">
            <div className="relative aspect-square w-full rounded-2xl border border-border bg-card overflow-hidden flex items-center justify-center">
              {activeImage ? (
                <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <ShoppingBag className="h-20 w-20 text-muted-foreground opacity-30" />
              )}
              <div className="absolute top-3 right-3">
                <Badge variant={product.product_type === 'digital' ? 'secondary' : 'default'} className="text-xs">
                  {product.product_type === 'digital' ? 'Digital' : 'Físico'}
                </Badge>
              </div>
            </div>

            {/* Carrossel de Miniaturas */}
            {product.images && product.images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(img)}
                    className={`relative h-16 w-16 rounded-lg overflow-hidden border bg-card shrink-0 ${
                      activeImage === img ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                    }`}
                  >
                    <img src={img} alt="Thumbnail" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lado Direito: Compra */}
          <div className="flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs text-primary font-semibold flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" />
                {product.category?.name || 'Sem Categoria'}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">{product.name}</h1>

              {/* Preço Ativo */}
              <div className="text-2xl sm:text-3xl font-extrabold text-primary">
                R$ {selectedVariation ? Number(selectedVariation.price).toFixed(2) : '0.00'}
              </div>

              <hr className="border-border" />

              {/* Seletores de Variações */}
              {product.variations && product.variations.length > 1 && (
                <div className="space-y-3">
                  <span className="text-sm font-semibold text-muted-foreground block">Opções disponíveis</span>
                  <div className="flex flex-wrap gap-2">
                    {product.variations.map((v) => {
                      const attrs = v.attributes || {};
                      const label = Object.values(attrs).join(' / ') || 'Padrão';
                      const isSelected = selectedVariation?.id === v.id;

                      return (
                        <button
                          key={v.id}
                          onClick={() => {
                            setSelectedVariation(v);
                            setQuantity(1); // reset quantity uploader
                          }}
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                              : 'border-border hover:bg-muted/40 text-muted-foreground'
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
              <div className="flex items-center space-x-6 pt-2">
                <span className="text-sm font-semibold text-muted-foreground">Quantidade</span>
                <div className="flex items-center border border-border rounded-xl bg-background overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3 text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-3 text-sm font-bold text-foreground min-w-[36px] text-center">
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
                    className="px-3 text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Informações de Frete / Conteúdo */}
              <div className="text-xs text-muted-foreground pt-2 space-y-2">
                {product.product_type === 'digital' ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex gap-2">
                    <ShoppingBag className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>Este é um **produto digital** (serviço, mentoria ou ebook). As instruções de acesso serão enviadas imediatamente em seu WhatsApp após o pagamento. Sem frete.</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border p-3 flex gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>
                      Frete calculado na finalização da compra. Taxa padrão da loja: R$ {Number(config.default_shipping_fee || 0).toFixed(2)}.
                      {product.shipping_fee && ` Taxa específica deste produto: R$ ${Number(product.shipping_fee).toFixed(2)}.`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="pt-6 border-t border-border mt-auto">
              <Button
                className="w-full rounded-2xl h-12 text-base font-bold shadow-md shadow-primary/20"
                onClick={handleAddToCart}
                disabled={!!(product.product_type === 'physical' && selectedVariation && selectedVariation.stock <= 0)}
              >
                {product.product_type === 'physical' && selectedVariation && selectedVariation.stock <= 0
                  ? 'Esgotado'
                  : 'Adicionar ao Carrinho'}
              </Button>
            </div>
          </div>
        </div>

        {/* Descrição Detalhada */}
        {product.description && (
          <div className="mt-12 border-t border-border pt-8 space-y-3">
            <h2 className="text-lg font-bold text-foreground">Descrição do Produto</h2>
            <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {product.description}
            </div>
          </div>
        )}

        {/* Produtos Relacionados */}
        {relatedProducts.length > 0 && (
          <div className="mt-16 border-t border-border pt-10 space-y-6">
            <h2 className="text-xl font-bold text-foreground">Produtos Relacionados</h2>
            <div className="grid gap-6 grid-cols-2 sm:grid-cols-4">
              {relatedProducts.map((p) => {
                const firstVar = p.variations?.[0];
                const displayPrice = firstVar ? firstVar.price : 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => router.push(`/shop/${tenantSlug}/product/${p.slug}`)}
                    className="group cursor-pointer space-y-3 rounded-2xl border border-border bg-card p-3 transition-all hover:shadow-md"
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                      {p.images && p.images.length > 0 ? (
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <ShoppingBag className="h-8 w-8" />
                        </div>
                      )}
                      {p.product_type === 'digital' && (
                        <span className="absolute top-2 right-2 rounded-md bg-primary/95 px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
                          Digital
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-semibold text-xs text-foreground line-clamp-2 min-h-[32px] group-hover:text-primary transition-colors">
                        {p.name}
                      </h3>
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-foreground">
                          R$ {Number(displayPrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
