'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, ShoppingBag, ArrowRight, Package } from 'lucide-react';
import { lookupCustomerOrders } from './actions';
import { toast } from 'sonner';

export default function OrderHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenantSlug as string;

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error('Digite um e-mail ou WhatsApp válido');
      return;
    }

    setLoading(true);
    try {
      const res = await lookupCustomerOrders(tenantSlug, query.trim());
      if (res.error) {
        toast.error(res.error);
        setOrders([]);
      } else {
        setOrders(res.orders || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar pedidos');
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  };

  const translateStatus = (status: string) => {
    switch (status) {
      case 'paid': return 'Pago';
      case 'pending': return 'Pendente';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 pb-16 pt-8 text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Header */}
      <header className="mb-8">
        <div className="mx-auto max-w-4xl px-4 flex items-center justify-between">
          <button
            onClick={() => router.push(`/shop/${tenantSlug}`)}
            className="flex items-center gap-2 focus:outline-none hover:text-primary transition-colors"
          >
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Voltar à Loja</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 space-y-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Meus Pedidos
            </CardTitle>
            <CardDescription>
              Acompanhe o status das suas compras
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Search form */}
            <form onSubmit={handleSearch} className="flex gap-3 mb-6 flex-col sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="searchQuery" className="sr-only">Busca por Email ou WhatsApp</Label>
                <Input
                  id="searchQuery"
                  type="text"
                  placeholder="Digite o e-mail ou WhatsApp utilizado na compra..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button type="submit" disabled={loading} className="h-11 px-6 shadow-md shadow-primary/20">
                {loading ? 'Buscando...' : (
                  <>
                    <Search className="h-4 w-4 mr-2" /> Buscar
                  </>
                )}
              </Button>
            </form>

            {/* Results */}
            {hasSearched && orders !== null && (
              <div className="space-y-4 mt-8">
                {orders.length === 0 ? (
                  <div className="text-center py-10 bg-muted/30 rounded-xl border border-dashed border-border">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                    <h3 className="text-lg font-medium text-foreground mb-1">Nenhum pedido encontrado</h3>
                    <p className="text-sm text-muted-foreground">
                      Não encontramos pedidos para "{query}". Tente buscar por outro número ou e-mail.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
                        <tr>
                          <th className="px-5 py-4 font-medium rounded-tl-lg">Pedido #</th>
                          <th className="px-5 py-4 font-medium">Data</th>
                          <th className="px-5 py-4 font-medium text-right">Total</th>
                          <th className="px-5 py-4 font-medium">Status</th>
                          <th className="px-5 py-4 font-medium rounded-tr-lg"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card">
                        {orders.map((order) => (
                          <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-4 font-mono text-xs text-foreground/80 font-medium">
                              {order.id.split('-')[0].toUpperCase()}
                            </td>
                            <td className="px-5 py-4 font-medium">
                              {new Date(order.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit', month: 'short', year: 'numeric'
                              })}
                            </td>
                            <td className="px-5 py-4 text-right font-bold text-foreground">
                              R$ {Number(order.total_amount).toFixed(2)}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${getStatusColor(order.status)}`}>
                                {translateStatus(order.status)}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/shop/${tenantSlug}/orders/${order.id}`)}
                                className="h-8 gap-1 font-semibold text-primary hover:text-primary/80 hover:bg-primary/10"
                              >
                                Ver Detalhes <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
