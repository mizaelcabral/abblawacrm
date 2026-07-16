'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { Order, OrderItem, ProductVariation, Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Truck,
  User,
  ShoppingBag,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

type ExtendedOrderItem = OrderItem & {
  variation?: (ProductVariation & { product?: Product }) | null;
};

type ExtendedOrder = Order & {
  items?: ExtendedOrderItem[];
  contact?: { id: string; name?: string; phone?: string } | null;
};

export default function EcommerceOrdersPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ExtendedOrder[]>([]);
  const [search, setSearch] = useState('');

  // Details sheet state
  const [selectedOrder, setSelectedOrder] = useState<ExtendedOrder | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!accountId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          contact:contacts(id, name, phone)
        `)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setOrders(data as ExtendedOrder[]);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao carregar lista de pedidos.');
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Load detailed items of selected order
  const handleOpenDetails = async (order: ExtendedOrder) => {
    setSelectedOrder(order);
    setDetailsLoading(true);

    try {
      const { data: items, error } = await supabase
        .from('order_items')
        .select(`
          *,
          variation:product_variations(
            *,
            product:products(*)
          )
        `)
        .eq('order_id', order.id);

      if (error) throw error;

      if (items) {
        setSelectedOrder({
          ...order,
          items: items as ExtendedOrderItem[],
        });
      }
    } catch (err) {
      console.error('Erro ao carregar itens do pedido:', err);
      toast.error('Erro ao carregar detalhes do pedido.');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Manually update status (override)
  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'paid' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Update state local
      setOrders(orders.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
      if (selectedOrder && selectedOrder.id === id) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
      toast.success('Status do pedido atualizado!');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao atualizar status.');
    }
  };

  const filteredOrders = orders.filter((o) => {
    const info = o.customer_info as { name: string; phone: string; email: string };
    const query = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(query) ||
      info.name?.toLowerCase().includes(query) ||
      info.phone?.toLowerCase().includes(query)
    );
  });

  if (loading && orders.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, nome ou WhatsApp..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Lista de Pedidos */}
      {filteredOrders.length === 0 ? (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <FileText className="h-10 w-10 mb-2 opacity-55" />
            <p className="text-sm font-medium">Nenhum pedido encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium text-xs">
                    <th className="p-3">Pedido</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Data</th>
                    <th className="p-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const client = order.customer_info as { name: string; phone: string };
                    return (
                      <tr key={order.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3 font-semibold text-xs text-primary truncate max-w-[120px]">{order.id}</td>
                        <td className="p-3">
                          <div className="text-sm font-medium text-foreground">{client.name}</div>
                          <div className="text-xs text-muted-foreground">{client.phone}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-foreground">R$ {Number(order.total_amount || 0).toFixed(2)}</div>
                          <div className="text-[10px] text-muted-foreground">Prod: R$ {Number(order.items_amount || 0).toFixed(2)} + Frete: R$ {Number(order.shipping_amount || 0).toFixed(2)}</div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              order.status === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : order.status === 'cancelled'
                                ? 'bg-rose-500/10 text-rose-500'
                                : 'bg-amber-500/10 text-amber-500'
                            }`}
                          >
                            {order.status === 'paid' ? 'Pago' : order.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString('pt-BR')} {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDetails(order)}>
                            Ver
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slide-over de Detalhes do Pedido */}
      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto border-l border-border bg-background p-0">
          {selectedOrder && (
            <>
              {/* Header */}
              <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-4">
                <SheetHeader className="space-y-0.5">
                  <SheetTitle className="text-base font-bold text-foreground">
                    Detalhes do Pedido
                  </SheetTitle>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">#{selectedOrder.id.slice(0, 8).toUpperCase()}</p>
                </SheetHeader>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(selectedOrder.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  {' às '}
                  {new Date(selectedOrder.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {detailsLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <div className="px-5 py-5 space-y-5">

                  {/* Status Banner */}
                  <div className={`flex items-center justify-between rounded-xl p-4 ${
                    selectedOrder.status === 'paid'
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : selectedOrder.status === 'cancelled'
                      ? 'bg-rose-500/10 border border-rose-500/20'
                      : 'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      {selectedOrder.status === 'paid' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      ) : selectedOrder.status === 'cancelled' ? (
                        <XCircle className="h-5 w-5 text-rose-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                      )}
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Status</div>
                        <div className={`font-bold text-sm ${
                          selectedOrder.status === 'paid' ? 'text-emerald-500'
                          : selectedOrder.status === 'cancelled' ? 'text-rose-500'
                          : 'text-amber-500'
                        }`}>
                          {selectedOrder.status === 'paid' ? 'Pago via Pix' : selectedOrder.status === 'cancelled' ? 'Cancelado' : 'Aguardando Pix'}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      {selectedOrder.status !== 'paid' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                          onClick={() => handleUpdateStatus(selectedOrder.id, 'paid')}
                        >
                          ✓ Pago
                        </Button>
                      )}
                      {selectedOrder.status !== 'cancelled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/50"
                          onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* QR Code Pix (se pendente e disponível) */}
                  {selectedOrder.status === 'pending' && selectedOrder.woovi_qrcode_image && (
                    <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center gap-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">QR Code Pix</p>
                      <img
                        src={selectedOrder.woovi_qrcode_image}
                        alt="QR Code Pix"
                        className="w-36 h-36 rounded-lg"
                      />
                      {selectedOrder.woovi_brcode && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedOrder.woovi_brcode!);
                            toast.success('Código Pix copiado!');
                          }}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Copiar Pix Copia e Cola
                        </button>
                      )}
                    </div>
                  )}

                  {/* Dados do Cliente */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Cliente
                    </h3>
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground text-sm">
                            {(selectedOrder.customer_info as any).name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {(selectedOrder.customer_info as any).email}
                          </div>
                        </div>
                        {(selectedOrder.customer_info as any).phone && (
                          <a
                            href={`https://wa.me/${(selectedOrder.customer_info as any).phone?.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors"
                          >
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground border-t border-border pt-2.5">
                        📱 {(selectedOrder.customer_info as any).phone}
                      </div>
                    </div>
                  </div>

                  {/* Endereço de Entrega */}
                  {(() => {
                    const addr = (selectedOrder.customer_info as any).address;
                    if (!addr?.street) return null;
                    return (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5" /> Entrega
                        </h3>
                        <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-0.5">
                          <div className="font-medium text-foreground">
                            {addr.street}, {addr.number}{addr.complement ? ` - ${addr.complement}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground">{addr.neighborhood}</div>
                          <div className="text-xs text-muted-foreground">{addr.city} / {addr.state} — CEP: {addr.postal_code}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Itens do Pedido */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5" /> Produtos
                    </h3>
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      {selectedOrder.items?.map((item, idx) => {
                        const prod = item.variation?.product;
                        const attrs = item.variation?.attributes || {};
                        // Only show attributes that have non-empty values
                        const validAttrs = Object.entries(attrs)
                          .filter(([, v]) => v && String(v).trim() !== '')
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ');

                        return (
                          <div key={item.id} className={`p-4 flex justify-between items-start gap-3 ${idx > 0 ? 'border-t border-border' : ''}`}>
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground text-sm flex items-center gap-1.5 flex-wrap">
                                {prod?.name || 'Produto Removido'}
                                {item.is_upsell && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">Upsell</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${prod?.product_type === 'digital' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                  {prod?.product_type === 'digital' ? 'Digital' : 'Físico'}
                                </span>
                                {validAttrs && <span>{validAttrs}</span>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {item.quantity}x · R$ {Number(item.unit_price).toFixed(2)} cada
                              </div>
                            </div>
                            <div className="font-bold text-foreground text-sm shrink-0">
                              R$ {Number(item.quantity * item.unit_price).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Resumo Financeiro */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>R$ {Number(selectedOrder.items_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Frete</span>
                      <span>{Number(selectedOrder.shipping_amount) > 0 ? `R$ ${Number(selectedOrder.shipping_amount).toFixed(2)}` : 'Grátis'}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t border-border pt-2.5 mt-1">
                      <span>Total</span>
                      <span className="text-primary">R$ {Number(selectedOrder.total_amount).toFixed(2)}</span>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

