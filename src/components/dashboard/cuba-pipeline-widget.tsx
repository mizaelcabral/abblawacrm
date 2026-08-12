"use client"

import Link from 'next/link'
import { Briefcase, ArrowRight } from 'lucide-react'
import type { PipelineDonutData } from '@/lib/dashboard/types'
import { formatCurrency, DEFAULT_CURRENCY } from '@/lib/currency'
import { Skeleton } from './skeleton'

export interface CubaPipelineWidgetProps {
  data: PipelineDonutData | null
  loading?: boolean
  currency?: string
}

export function CubaPipelineWidget({
  data,
  loading = false,
  currency = DEFAULT_CURRENCY,
}: CubaPipelineWidgetProps) {
  const totalValue = data?.totalValue ?? 0
  const totalDeals =
    data?.stages.reduce((acc, stage) => acc + (stage.dealCount || 0), 0) ?? 0

  return (
    <div className="cuba-card p-5 flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Funil de Vendas & Etapas</h3>
            <p className="text-xs text-muted-foreground">Distribuição financeira por etapa do pipeline</p>
          </div>
        </div>

        <Link
          href="/pipelines"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all border border-primary/20 shrink-0"
        >
          <span>Ver funil completo</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading state vs Main content */}
      {loading ? (
        <div className="space-y-4 flex-1">
          {/* Summary Box Skeleton */}
          <Skeleton className="h-20 w-full rounded-2xl" />

          {/* Stages List Skeleton */}
          <div className="space-y-4 pt-1 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* Total Summary Box */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Valor Total no Funil
              </p>
              <p className="text-2xl font-extrabold text-foreground tracking-tight mt-0.5 tabular-nums">
                {formatCurrency(totalValue, currency)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/20">
                {totalDeals} {totalDeals === 1 ? 'negócio ativo' : 'negócios ativos'}
              </span>
            </div>
          </div>

          {/* List of Stages */}
          <div className="flex-1 space-y-3.5 pt-1">
            {!data || data.stages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border border-dashed border-border/60 rounded-2xl bg-muted/10 my-auto">
                <Briefcase className="w-8 h-8 opacity-40 mb-2" />
                <p className="text-xs font-semibold text-foreground">Nenhum negócio no funil</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Crie negócios nos pipelines para ver a distribuição por etapa aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto no-scrollbar pr-0.5">
                {data.stages.map((stage) => {
                  const percentage =
                    totalValue > 0 ? (stage.totalValue / totalValue) * 100 : 0

                  return (
                    <div key={stage.id} className="space-y-1.5">
                      {/* Stage info header */}
                      <div className="flex items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: stage.color || '#3b82f6' }}
                            aria-hidden="true"
                          />
                          <span className="font-bold text-foreground truncate">
                            {stage.name}
                          </span>
                          <span className="text-[11px] font-medium text-muted-foreground shrink-0">
                            ({stage.dealCount} {stage.dealCount === 1 ? 'negócio' : 'negócios'})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {percentage.toFixed(1)}%
                          </span>
                          <span className="font-bold text-foreground tabular-nums">
                            {formatCurrency(stage.totalValue, currency)}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: `${Math.max(percentage, percentage > 0 ? 1.5 : 0)}%`,
                            backgroundColor: stage.color || '#3b82f6',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
