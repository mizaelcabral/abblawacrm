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
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto border-l border-border bg-card">
          {selectedOrder && (
            <>
              <SheetHeader className="pb-4 border-b border-border">
                <SheetTitle className="text-lg font-bold">
                  Detalhes do Pedido
                </SheetTitle>
                <p className="text-xs text-muted-foreground break-all">ID: {selectedOrder.id}</p>
              </SheetHeader>

              {detailsLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-6 pt-4">
                  {/* Status Banner */}
                  <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/40">
                    <div>
                      <div className="text-xs text-muted-foreground">Status do Pagamento</div>
                      <div className="flex items-center gap-1.5 mt-1 font-semibold text-sm">
                        {selectedOrder.status === 'paid' ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <span className="text-emerald-500">Pago via Pix</span>
                          </>
                        ) : selectedOrder.status === 'cancelled' ? (
                          <>
                            <XCircle className="h-4 w-4 text-rose-500" />
                            <span className="text-rose-500">Cancelado</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <span className="text-amber-500">Pendente de Pix</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      {selectedOrder.status !== 'paid' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10"
                          onClick={() => handleUpdateStatus(selectedOrder.id, 'paid')}
                        >
                          Marcar Pago
                        </Button>
                      )}
                      {selectedOrder.status !== 'cancelled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                          onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Dados do Cliente */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <User className="h-4 w-4 text-primary" />
                      Dados do Cliente
                    </h3>
                    <div className="rounded-lg border border-border p-3 text-sm space-y-1.5 bg-muted/20">
                      <div><span className="text-muted-foreground">Nome: </span>{(selectedOrder.customer_info as any).name}</div>
                      <div><span className="text-muted-foreground">WhatsApp: </span>{(selectedOrder.customer_info as any).phone}</div>
                      <div><span className="text-muted-foreground">E-mail: </span>{(selectedOrder.customer_info as any).email}</div>
                      {selectedOrder.contact && (
                        <div className="pt-1.5 border-t border-border mt-1.5 flex gap-2">
                          <a
                            href={`/inbox`} // redireciona para a inbox para chat rápido
                            className="inline-flex items-center text-xs text-primary hover:underline"
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Conversar no Inbox
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Endereço de Entrega se não for 100% digital */}
                  {selectedOrder.shipping_amount > 0 || (selectedOrder.customer_info as any).address ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                        <Truck className="h-4 w-4 text-primary" />
                        Endereço de Entrega
                      </h3>
                      <div className="rounded-lg border border-border p-3 text-sm space-y-1 bg-muted/20">
                        {(() => {
                          const addr = (selectedOrder.customer_info as any).address;
                          if (!addr) return <span className="text-muted-foreground">Nenhum endereço fornecido.</span>;
                          return (
                            <>
                              <div>{addr.street}, {addr.number} {addr.complement && `- ${addr.complement}`}</div>
                              <div>{addr.neighborhood} - CEP: {addr.postal_code}</div>
                              <div>{addr.city} / {addr.state}</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/10 p-3 text-xs text-muted-foreground flex items-center gap-1.5">
                      <ShoppingBag className="h-4 w-4 text-primary shrink-0" />
                      <span>Pedido digital ou de serviço. Sem necessidade de entrega física.</span>
                    </div>
                  )}

                  {/* Itens do Pedido */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      Produtos Comprados
                    </h3>
                    <div className="border border-border rounded-lg overflow-hidden">
                      {selectedOrder.items?.map((item, idx) => {
                        const prod = item.variation?.product;
                        const attrs = item.variation?.attributes || {};
                        const attrString = Object.entries(attrs)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ');

                        return (
                          <div key={item.id} className={`p-3 text-sm flex justify-between items-center ${idx > 0 && 'border-t border-border'}`}>
                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                {prod?.name || 'Produto Removido'}
                                {item.is_upsell && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">Upsell</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {prod?.product_type === 'digital' ? 'Digital' : 'Físico'} {attrString && `| ${attrString}`}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Qtd: {item.quantity} x R$ {Number(item.unit_price).toFixed(2)}
                              </div>
                            </div>
                            <div className="font-bold text-foreground">
                              R$ {Number(item.quantity * item.unit_price).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pix Details */}
                  {(selectedOrder.woovi_brcode || selectedOrder.woovi_correlation_id) && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Dados Pix Woovi</h3>
                      <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1.5 bg-muted/20 break-all">
                        <div><span className="font-medium text-foreground">CorrelationID:</span> {selectedOrder.woovi_correlation_id}</div>
                        {selectedOrder.woovi_brcode && (
                          <div className="max-h-16 overflow-y-auto font-mono text-[10px] border-t border-border mt-1.5 pt-1.5">
                            <span className="font-medium text-foreground block mb-0.5">Chave Pix:</span>
                            {selectedOrder.woovi_brcode}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Resumo Financeiro */}
                  <div className="border-t border-border pt-4 text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal dos itens:</span>
                      <span className="font-medium">R$ {Number(selectedOrder.items_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frete:</span>
                      <span className="font-medium">R$ {Number(selectedOrder.shipping_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                      <span>Total Geral:</span>
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
