'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductVariation } from '@/types';
import { Button } from '@/components/ui/button';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  X,
  PlusCircle,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

interface CartItemInput {
  variationId: string;
  quantity: number;
  isUpsell?: boolean;
}

interface CartDrawerProps {
  tenantSlug: string;
  open: boolean;
  onClose: () => void;
  cartItems: CartItemInput[];
  onUpdateCart: (items: CartItemInput[]) => void;
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
  upsellProductId?: string | null;
  isUpsell?: boolean;
}

export function CartDrawer({ tenantSlug, open, onClose, cartItems, onUpdateCart }: CartDrawerProps) {
  const supabase = createClient();
  const router = useRouter();

  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Upsell recommendation state
  const [upsellProduct, setUpsellProduct] = useState<(Product & { variations: ProductVariation[] }) | null>(null);

  const hydrateCart = useCallback(async () => {
    if (cartItems.length === 0) {
      setHydratedItems([]);
      setUpsellProduct(null);
      return;
    }

    try {
      setLoading(true);
      const variationIds = cartItems.map(item => item.variationId);

      // 1. Fetch variations and join products
      const { data: varData, error: varError } = await supabase
        .from('product_variations')
        .select(`
          *,
          product:products(*)
        `)
        .in('id', variationIds);

      if (varError) throw varError;

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
            coverImage: prod?.images && prod?.images.length > 0 ? prod.images[0] : null,
            upsellProductId: prod?.upsell_product_id,
            isUpsell: item.isUpsell || false
          } as HydratedCartItem;
        }).filter((item): item is HydratedCartItem => item !== null);

        setHydratedItems(hydrated);

        // 2. Process Upsell Recommendation
        // Get all upsell product IDs present in cart items
        const upsellIds = hydrated
          .map(item => item.upsellProductId)
          .filter((id): id is string => !!id);

        if (upsellIds.length > 0) {
          // Check if any recommended upsell product is NOT already in the cart
          // We map cart items to their parent product IDs
          const cartProductIds = varData.map(v => v.product_id);
          const pendingUpsellId = upsellIds.find(id => !cartProductIds.includes(id));

          if (pendingUpsellId) {
            const { data: upsellData } = await supabase
              .from('products')
              .select(`
                *,
                variations:product_variations(*)
              `)
              .eq('id', pendingUpsellId)
              .eq('active', true)
              .maybeSingle();

            if (upsellData && upsellData.variations && upsellData.variations.length > 0) {
              setUpsellProduct(upsellData as any);
            } else {
              setUpsellProduct(null);
            }
          } else {
            setUpsellProduct(null);
          }
        } else {
          setUpsellProduct(null);
        }
      }
    } catch (err) {
      console.error('Erro ao hidratar carrinho:', err);
    } finally {
      setLoading(false);
    }
  }, [cartItems, supabase]);

  useEffect(() => {
    if (open) {
      hydrateCart();
    }
  }, [open, hydrateCart]);

  const handleUpdateQuantity = (variationId: string, delta: number) => {
    const matched = hydratedItems.find(item => item.variationId === variationId);
    if (!matched) return;

    const newQty = matched.quantity + delta;
    if (newQty <= 0) {
      handleRemoveItem(variationId);
      return;
    }

    // Check stock for physical
    if (matched.productType === 'physical' && delta > 0 && newQty > matched.stock) {
      toast.warning(`Limite de estoque atingido (${matched.stock} unidades disponíveis).`);
      return;
    }

    const updated = cartItems.map(item =>
      item.variationId === variationId ? { ...item, quantity: newQty } : item
    );
    onUpdateCart(updated);
  };

  const handleRemoveItem = (variationId: string) => {
    const updated = cartItems.filter(item => item.variationId !== variationId);
    onUpdateCart(updated);
    toast.success('Produto removido do carrinho.');
  };

  // Add upsell product to cart
  const handleAddUpsell = () => {
    if (!upsellProduct) return;
    const defaultVar = upsellProduct.variations[0];
    if (!defaultVar) return;

    const updated = [...cartItems, { variationId: defaultVar.id, quantity: 1, isUpsell: true }];
    onUpdateCart(updated);
    setUpsellProduct(null); // hide recommendation card
    toast.success('Oferta de Upsell adicionada ao carrinho!');
  };

  const subtotal = hydratedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-md flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Seu Carrinho</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && hydratedItems.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : hydratedItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground text-center">
              <ShoppingBag className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-semibold">Carrinho vazio</p>
              <p className="text-xs mt-1">Adicione produtos da vitrine para prosseguir.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Items List */}
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background">
                {hydratedItems.map((item) => {
                  const attrs = Object.entries(item.attributes)
                    .map(([k, v]) => `${v}`)
                    .join(' / ');

                  return (
                    <div key={item.variationId} className="p-3 flex gap-3 items-center">
                      <div className="h-12 w-12 rounded-lg bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
                        {item.coverImage ? (
                          <img src={item.coverImage} alt={item.productName} className="h-full w-full object-cover" />
                        ) : (
                          <ShoppingBag className="h-5 w-5 text-muted-foreground opacity-55" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                          {item.productName}
                          {item.isUpsell && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                              Upsell
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.productType === 'digital' ? 'Digital' : 'Físico'} {attrs && `| ${attrs}`}
                        </div>
                        <div className="text-sm font-bold text-primary mt-1">
                          R$ {item.price.toFixed(2)}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center border border-border rounded-lg h-7 bg-background">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.variationId, -1)}
                            className="px-2 text-muted-foreground hover:bg-muted/40 transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-foreground min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.variationId, 1)}
                            className="px-2 text-muted-foreground hover:bg-muted/40 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.variationId)}
                          className="text-rose-500 hover:text-rose-600 focus:outline-none"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* UPSELL OFFER CARD */}
              {upsellProduct && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center gap-1.5 text-primary text-xs font-bold">
                    <Sparkles className="h-4 w-4 animate-bounce" />
                    <span>Oferta Especial (Aproveite também!)</span>
                  </div>

                  <div className="flex gap-3 items-center">
                    <div className="h-10 w-10 rounded-lg bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
                      {upsellProduct.images && upsellProduct.images.length > 0 ? (
                        <img src={upsellProduct.images[0]} alt={upsellProduct.name} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingBag className="h-5 w-5 text-muted-foreground opacity-55" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{upsellProduct.name}</div>
                      <div className="text-xs font-bold text-primary mt-0.5">
                        Por apenas R$ {Number(upsellProduct.variations[0]?.price || 0).toFixed(2)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddUpsell}
                      className="text-xs h-8 px-2.5 rounded-lg shrink-0"
                    >
                      <PlusCircle className="h-3.5 w-3.5 mr-1" /> Levar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {hydratedItems.length > 0 && (
          <footer className="border-t border-border p-4 bg-muted/20 space-y-4">
            <div className="flex justify-between items-baseline text-sm">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="text-xl font-extrabold text-foreground">
                R$ {subtotal.toFixed(2)}
              </span>
            </div>

            <Button
              className="w-full rounded-2xl h-11 text-sm font-bold shadow-md shadow-primary/10"
              onClick={() => {
                onClose();
                router.push(`/shop/${tenantSlug}/checkout`);
              }}
            >
              Finalizar e Pagar Pix
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}
