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
  Heart,
  Star,
  Filter
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
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Password protection state
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<{ variationId: string; quantity: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

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
    const matchesType = selectedType === 'all' || p.product_type === selectedType;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch && matchesType;
  });

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Se a loja não tem credenciais Woovi, exibe erro
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

  // Tela de Senha
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
    <div className="min-h-screen bg-[#f8f9fa] pb-16 text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      {/* Header Fixo */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-white shadow-sm">
        <div className="mx-auto max-w-7xl flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-4 flex-shrink-0">
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
             <div className="relative w-full max-w-lg">
               <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input
                 placeholder="Buscar produtos..."
                 className="pl-10 bg-muted/30 border-border focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary rounded-full"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
               />
             </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
             <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full">
                <a href={`/shop/${tenantSlug}/wishlist`}>
                  <Heart className="h-5 w-5" />
                </a>
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

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8">
         <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            
            {/* Sidebar Filters */}
            <aside className={`lg:block w-full lg:w-64 shrink-0 space-y-6 ${isMobileFiltersOpen ? 'block' : 'hidden'}`}>
               <div className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-6">
                 {/* Categorias */}
                 <div>
                    <h3 className="font-semibold mb-3 text-sm text-foreground uppercase tracking-wider">Categorias</h3>
                    <div className="space-y-1">
                       <button 
                         className={`flex items-center justify-between w-full text-sm px-2 py-1.5 rounded-md transition-colors ${selectedCategory === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                         onClick={() => { setSelectedCategory('all'); setIsMobileFiltersOpen(false); }}
                       >
                         <span>Todas as categorias</span>
                         <span className="bg-background border border-border px-2 py-0.5 rounded-full text-[10px]">{products.length}</span>
                       </button>
                       {categories.map((cat) => (
                          <button 
                            key={cat.id}
                            className={`flex items-center justify-between w-full text-sm px-2 py-1.5 rounded-md transition-colors ${selectedCategory === cat.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                            onClick={() => { setSelectedCategory(cat.id); setIsMobileFiltersOpen(false); }}
                          >
                            <span className="truncate pr-2 text-left">{cat.name}</span>
                            <span className="bg-background border border-border px-2 py-0.5 rounded-full text-[10px]">
                               {products.filter(p => p.category_id === cat.id).length}
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
                       {['all', 'physical', 'digital'].map((type) => (
                          <label key={type} className="flex items-center gap-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground group">
                            <input 
                               type="radio" 
                               name="product_type" 
                               value={type} 
                               checked={selectedType === type}
                               onChange={(e) => setSelectedType(e.target.value)}
                               className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                            />
                            <span className="group-hover:translate-x-0.5 transition-transform">{type === 'all' ? 'Todos os tipos' : type === 'physical' ? 'Físico' : 'Digital'}</span>
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

            {/* Product Grid Area */}
            <div className="flex-1 space-y-6">
               
               {/* Top bar (mobile search/filters, sorting) */}
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3 rounded-xl border border-border shadow-sm">
                 <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="lg:hidden w-full sm:w-auto text-muted-foreground"
                      onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                    >
                       <Filter className="h-4 w-4 mr-2" />
                       Filtros
                    </Button>
                    <div className="text-sm text-muted-foreground hidden sm:block font-medium">
                       Exibindo <span className="text-foreground">{filteredProducts.length}</span> {filteredProducts.length === 1 ? 'produto' : 'produtos'}
                    </div>
                 </div>
                 <div className="w-full sm:w-64 lg:hidden">
                    <div className="relative">
                       <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                       <Input
                         placeholder="Buscar produtos..."
                         className="pl-9 h-9 text-sm w-full bg-muted/30 border-border rounded-full"
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                       />
                    </div>
                 </div>
               </div>

               {filteredProducts.length === 0 ? (
                 <div className="flex h-[400px] flex-col items-center justify-center text-muted-foreground rounded-2xl border border-dashed border-border bg-white p-6 shadow-sm">
                   <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                     <ShoppingBag className="h-8 w-8 text-muted-foreground opacity-50" />
                   </div>
                   <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum produto encontrado</h3>
                   <p className="text-sm text-center max-w-sm">Tente ajustar seus filtros ou buscar por termos diferentes.</p>
                   <Button variant="outline" className="mt-6 rounded-full" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedType('all'); }}>
                      Limpar Filtros
                   </Button>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                   {filteredProducts.map((p) => {
                     const coverImg = p.images && p.images.length > 0 ? p.images[0] : null;
                     const variations = p.variations || [];
                     const defaultVariation = variations[0];

                     if (!defaultVariation) return null;

                     const minPrice = Math.min(...variations.map((v) => Number(v.price)));
                     
                     return (
                       <div
                         key={p.id}
                         className="group flex flex-col justify-between rounded-xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300"
                       >
                         <div>
                           {/* Imagem do Produto com Hover Effect */}
                           <a href={`/shop/${tenantSlug}/product/${p.slug || p.id}`} className="block relative aspect-[4/3] w-full bg-muted/30 flex items-center justify-center overflow-hidden">
                             {coverImg ? (
                               <img
                                 src={coverImg}
                                 alt={p.name}
                                 className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-500 ease-out"
                               />
                             ) : (
                               <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-30" />
                             )}
                             <div className="absolute top-3 right-3 flex flex-col gap-2">
                               <Badge variant={p.product_type === 'digital' ? 'secondary' : 'default'} className="text-[10px] uppercase font-bold shadow-sm backdrop-blur-md bg-background/90">
                                 {p.product_type === 'digital' ? 'Digital' : 'Físico'}
                               </Badge>
                             </div>
                           </a>

                           <div className="p-4 space-y-2.5">
                             {/* Avaliação (Mock) & Categoria */}
                             <div className="flex items-center justify-between">
                                <div className="text-[11px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
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
                               <h3 className="font-bold text-[15px] leading-tight line-clamp-1 group-hover:text-primary transition-colors">{p.name}</h3>
                             </a>
                             <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed h-8">
                               {p.description || 'Produto incrível com a melhor qualidade para você.'}
                             </p>
                           </div>
                         </div>

                         <div className="p-4 pt-2 border-t border-border/40 mt-2 bg-gray-50/50">
                           <div className="flex items-end justify-between mb-3">
                             <div>
                               <span className="text-[10px] text-muted-foreground block uppercase font-medium tracking-wide">A partir de</span>
                               <span className="text-lg font-black text-foreground">
                                 R$ {minPrice.toFixed(2)}
                               </span>
                             </div>
                           </div>

                           <div className="flex gap-2">
                             <a
                               href={`/shop/${tenantSlug}/product/${p.slug || p.id}`}
                               className="flex-1 inline-flex items-center justify-center rounded-lg border border-input bg-white text-sm font-semibold hover:bg-gray-50 hover:text-primary transition-colors h-9"
                             >
                               Detalhes
                             </a>
                             
                             {variations.length === 1 && (
                               <Button
                                 variant="default"
                                 size="icon"
                                 onClick={(e) => {
                                   e.preventDefault();
                                   handleAddToCart(defaultVariation.id);
                                 }}
                                 className="h-9 w-9 shrink-0 rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-transform"
                               >
                                 <Plus className="h-4 w-4" />
                               </Button>
                             )}
                           </div>
                         </div>
                       </div>
                     );
                   })}
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

