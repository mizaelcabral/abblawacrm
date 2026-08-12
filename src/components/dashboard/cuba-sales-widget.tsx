"use client"

import Link from 'next/link'
import { ShoppingBag, ArrowRight, Package, TrendingUp, DollarSign } from 'lucide-react'
import type { EcommerceSummary } from '@/lib/dashboard/types'
import { formatCurrency, DEFAULT_CURRENCY } from '@/lib/currency'
import { Skeleton } from './skeleton'

export interface CubaSalesWidgetProps {
  data: EcommerceSummary | null
  loading?: boolean
  currency?: string
}

export function CubaSalesWidget({
  data,
  loading = false,
  currency = DEFAULT_CURRENCY,
}: CubaSalesWidgetProps) {
  const monthlyRevenue = data?.monthlyRevenue ?? 0
  const averageTicket = data?.averageTicket ?? 0
  const topProducts = data?.topProducts || []

  return (
    <div className="cuba-card p-5 flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Vendas & Catálogo</h3>
            <p className="text-xs text-muted-foreground">Resumo de pedidos e loja online</p>
          </div>
        </div>

        <Link
          href="/ecommerce"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all border border-primary/20 shrink-0"
        >
          <span>Ver loja</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading state vs Main content */}
      {loading ? (
        <div className="space-y-4 flex-1">
          {/* Grid Stats Skeleton */}
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>

          {/* Featured Products Skeleton */}
          <div className="space-y-2.5 pt-1">
            <Skeleton className="h-4 w-36 rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-2xl border border-border/40 bg-muted/20"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* Grid stats: Monthly Revenue and Average Ticket */}
          <div className="grid grid-cols-2 gap-3">
            {/* Monthly Revenue */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/15 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Receita Mensal
                </span>
                <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight tabular-nums">
                  {formatCurrency(monthlyRevenue, currency)}
                </p>
                {data?.paidOrdersCount !== undefined && (
                  <span className="text-[11px] font-medium text-muted-foreground mt-0.5 block">
                    {data.paidOrdersCount} {data.paidOrdersCount === 1 ? 'pedido pago' : 'pedidos pagos'}
                  </span>
                )}
              </div>
            </div>

            {/* Average Ticket */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/15 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Ticket Médio
                </span>
                <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight tabular-nums">
                  {formatCurrency(averageTicket, currency)}
                </p>
                {data?.pendingOrdersCount !== undefined && data.pendingOrdersCount > 0 ? (
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5 block">
                    {data.pendingOrdersCount} {data.pendingOrdersCount === 1 ? 'pedido pendente' : 'pedidos pendentes'}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-muted-foreground mt-0.5 block">
                    Média por pedido
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Featured products list */}
          <div className="flex-1 space-y-2 pt-1 flex flex-col">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
              Produtos em Destaque
            </h4>

            {topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground border border-dashed border-border/60 rounded-2xl bg-muted/10 my-auto">
                <Package className="w-8 h-8 opacity-40 mb-2" />
                <p className="text-xs font-semibold text-foreground">Nenhum produto em destaque</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Os produtos do e-commerce aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto no-scrollbar pr-0.5">
                {topProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                        <Package className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {product.name}
                        </p>
                        {product.salesCount !== undefined && (
                          <span className="text-[11px] text-muted-foreground">
                            {product.salesCount} {product.salesCount === 1 ? 'venda' : 'vendas'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-foreground tabular-nums">
                        {formatCurrency(product.price, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
