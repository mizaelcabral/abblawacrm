'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductCategory, ProductVariation } from '@/types';
import { ProductForm } from '@/components/ecommerce/product-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  FolderPlus,
  Layers,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

type ExtendedProduct = Product & {
  category?: ProductCategory | null;
  variations?: ProductVariation[];
};

export default function EcommerceProductsPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ExtendedProduct[]>([]);
  const [search, setSearch] = useState('');

  // Category State
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [catDialogOpen, setCatDialogOpen] = useState(false);

  // Form states
  const [editingProduct, setEditingProduct] = useState<ExtendedProduct | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadProductsAndCategories = useCallback(async () => {
    if (!accountId) return;

    try {
      setLoading(true);

      // 1. Fetch Categories
      const { data: catData } = await supabase
        .from('product_categories')
        .select('*')
        .eq('account_id', accountId)
        .order('name');
      if (catData) setCategories(catData);

      // 2. Fetch Products with Category and Variations
      const { data: prodData, error: prodError } = await supabase
        .from('products')
        .select(`
          *,
          category:product_categories(*),
          variations:product_variations(*)
        `)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (prodError) throw prodError;
      if (prodData) setProducts(prodData as ExtendedProduct[]);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao carregar catálogo.');
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadProductsAndCategories();
  }, [loadProductsAndCategories]);

  // Handle category submission
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName || !newCatSlug) return;

    try {
      const { data, error } = await supabase
        .from('product_categories')
        .insert({
          account_id: accountId,
          name: newCatName,
          slug: newCatSlug.toLowerCase().trim().replace(/\s+/g, '-'),
        })
        .select()
        .single();

      if (error) throw error;
      setCategories([...categories, data]);
      setNewCatName('');
      setNewCatSlug('');
      toast.success('Categoria criada!');
    } catch (err: any) {
      console.error(err);
      toast.error('Falha ao criar categoria. Verifique se o slug é único.');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const { error } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setCategories(categories.filter((c) => c.id !== id));
      toast.success('Categoria removida.');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao deletar categoria.');
    }
  };

  // Delete product
  const handleDeleteProduct = async (id: string) => {
    const confirm = window.confirm('Deseja realmente remover este produto do catálogo?');
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setProducts(products.filter((p) => p.id !== id));
      toast.success('Produto removido.');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao deletar produto.');
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (loading && products.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Se estiver editando ou criando, exibe o formulário
  if (isCreating || editingProduct) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
          </h2>
        </div>
        <ProductForm
          accountId={accountId!}
          product={editingProduct || undefined}
          onSave={() => {
            setIsCreating(false);
            setEditingProduct(null);
            loadProductsAndCategories();
          }}
          onCancel={() => {
            setIsCreating(false);
            setEditingProduct(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Ações */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produtos..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Gerenciar Categorias */}
          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" />
              }
            >
              <FolderPlus className="h-4 w-4 mr-2" /> Categorias
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Categorias do Catálogo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateCategory} className="space-y-4 pt-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="catName">Nome</Label>
                    <Input
                      id="catName"
                      placeholder="Ex: Roupas"
                      value={newCatName}
                      onChange={(e) => {
                        setNewCatName(e.target.value);
                        setNewCatSlug(e.target.value.toLowerCase().trim().replace(/\s+/g, '-'));
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="catSlug">Slug</Label>
                    <Input
                      id="catSlug"
                      placeholder="roupas"
                      value={newCatSlug}
                      onChange={(e) => setNewCatSlug(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" size="sm">
                  Adicionar Categoria
                </Button>
              </form>

              <div className="border-t border-border mt-4 pt-4 max-h-48 overflow-y-auto space-y-2">
                <p className="text-xs font-semibold text-muted-foreground block">Categorias Existentes:</p>
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma categoria cadastrada.</p>
                ) : (
                  categories.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded bg-muted/50 p-2 text-sm">
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({c.slug})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c.id)}
                        className="text-rose-500 hover:text-rose-600 focus:outline-none"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Criar Produto */}
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Produto
          </Button>
        </div>
      </div>

      {/* Grid de produtos */}
      {filteredProducts.length === 0 ? (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Package className="h-10 w-10 mb-2 opacity-55" />
            <p className="text-sm font-medium">Nenhum produto cadastrado no catálogo.</p>
            <Button variant="link" onClick={() => setIsCreating(true)} className="mt-1 text-primary text-xs">
              Cadastre seu primeiro produto agora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((p) => {
            const minPrice = p.variations && p.variations.length > 0
              ? Math.min(...p.variations.map((v) => Number(v.price)))
              : 0;
            const maxPrice = p.variations && p.variations.length > 0
              ? Math.max(...p.variations.map((v) => Number(v.price)))
              : 0;
            const totalStock = p.variations
              ? p.variations.reduce((sum, v) => sum + Number(v.stock), 0)
              : 0;

            const coverImage = p.images && p.images.length > 0 ? p.images[0] : null;

            return (
              <Card key={p.id} className={`border-border hover:shadow-md transition-all overflow-hidden flex flex-col justify-between ${!p.active && 'opacity-60'}`}>
                <div>
                  <div className="relative h-40 bg-muted/30 border-b border-border flex items-center justify-center overflow-hidden">
                    {coverImage ? (
                      <img src={coverImage} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="h-12 w-12 text-muted-foreground opacity-30" />
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Badge variant={p.product_type === 'digital' ? 'secondary' : 'default'} className="text-[10px]">
                        {p.product_type === 'digital' ? 'Digital' : 'Físico'}
                      </Badge>
                      {!p.active && <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                    </div>
                  </div>

                  <CardHeader className="p-4 pb-0">
                    <div className="text-xs text-primary font-semibold mb-1 flex items-center gap-1.5">
                      <Layers className="h-3 w-3" />
                      {p.category?.name || 'Sem Categoria'}
                    </div>
                    <CardTitle className="text-lg line-clamp-1">{p.name}</CardTitle>
                    <CardDescription className="line-clamp-2 text-xs mt-1">
                      {p.description || 'Sem descrição.'}
                    </CardDescription>
                  </CardHeader>
                </div>

                <CardContent className="p-4 pt-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-t border-border/60 pt-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Preço</div>
                      <div className="font-bold text-foreground">
                        {minPrice === maxPrice
                          ? `R$ ${minPrice.toFixed(2)}`
                          : `R$ ${minPrice.toFixed(2)} - R$ ${maxPrice.toFixed(2)}`}
                      </div>
                    </div>
                    {p.product_type === 'physical' && (
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Estoque</div>
                        <div className="font-semibold text-foreground text-sm">{totalStock} unid</div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 border-t border-border/60 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setEditingProduct(p)}
                    >
                      <Edit2 className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <a
                      href={`/shop/${accountId}/product/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold hover:bg-accent text-muted-foreground hover:text-accent-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-500 hover:text-rose-600 border-rose-500/20 hover:bg-rose-500/10"
                      onClick={() => handleDeleteProduct(p.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
