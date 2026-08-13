"use client"

import Link from 'next/link'
import { Briefcase, ArrowRight, TrendingUp, DollarSign, Award, Target } from 'lucide-react'
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

  // Calculate funnel insights metrics
  const avgTicket = totalDeals > 0 ? totalValue / totalDeals : 0
  const topStage = data?.stages && data.stages.length > 0
    ? [...data.stages].sort((a, b) => b.totalValue - a.totalValue)[0]
    : null

  const wonStage = data?.stages
    ? data.stages.find(s => s.name.toLowerCase().includes('ganho') || s.name.toLowerCase().includes('fechado'))
    : null
  const wonCount = wonStage?.dealCount ?? 0
  const wonValue = wonStage?.totalValue ?? 0
  const conversionRate = totalDeals > 0 ? (wonCount / totalDeals) * 100 : 0

  return (
    <div className="cuba-card p-5 sm:p-6 flex flex-col justify-between h-full space-y-5">
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
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all border border-primary/20 shrink-0"
        >
          <span>Ver funil completo</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading state vs Main content */}
      {loading ? (
        <div className="space-y-4 flex-1">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5 flex-1 flex flex-col justify-between">
          {/* Total Summary Box + Multi-segment Continuous Pipeline Bar */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Valor Total no Funil
                </p>
                <p className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mt-0.5 tabular-nums">
                  {formatCurrency(totalValue, currency)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/20">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {totalDeals} {totalDeals === 1 ? 'negócio ativo' : 'negócios ativos'}
                </span>
              </div>
            </div>

            {/* Continuous Segmented Multi-Color Pipeline Bar */}
            {data && data.stages.length > 0 && totalValue > 0 && (
              <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden flex gap-0.5 p-0.5 shadow-inner">
                {data.stages.map((stage) => {
                  const percentage = (stage.totalValue / totalValue) * 100
                  if (percentage <= 0) return null
                  return (
                    <div
                      key={stage.id}
                      className="h-full rounded-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: stage.color || '#3b82f6',
                      }}
                      title={`${stage.name}: ${percentage.toFixed(1)}% (${formatCurrency(stage.totalValue, currency)})`}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Grid of Stage Cards (No flat lines!) */}
          <div className="flex-1">
            {!data || data.stages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground border border-dashed border-border/60 rounded-2xl bg-muted/10 my-auto">
                <Briefcase className="w-9 h-9 opacity-40 mb-2" />
                <p className="text-sm font-bold text-foreground">Nenhum negócio no funil</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                  Crie negócios nos pipelines para visualizar os valores e a distribuição por etapa aqui.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {data.stages.map((stage) => {
                  const percentage =
                    totalValue > 0 ? (stage.totalValue / totalValue) * 100 : 0

                  return (
                    <div
                      key={stage.id}
                      className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md flex flex-col justify-between gap-3 group"
                    >
                      {/* Top indicator: Stage color dot + name + percentage badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0 shadow-xs ring-2 ring-background"
                            style={{ backgroundColor: stage.color || '#3b82f6' }}
                            aria-hidden="true"
                          />
                          <span className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                            {stage.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>

                      {/* Value in bold */}
                      <div>
                        <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight tabular-nums">
                          {formatCurrency(stage.totalValue, currency)}
                        </p>
                        <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                          {stage.dealCount} {stage.dealCount === 1 ? 'negócio' : 'negócios'}
                        </p>
                      </div>

                      {/* Bottom accent colored line */}
                      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(percentage, percentage > 0 ? 4 : 0)}%`,
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

          {/* Bottom Insights & Performance Strip to fill remaining vertical space */}
          {data && data.stages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border/40 mt-auto">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ticket Médio</p>
                  <p className="text-xs sm:text-sm font-extrabold text-foreground tracking-tight tabular-nums truncate">
                    {formatCurrency(avgTicket, currency)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Etapa Principal</p>
                  <p className="text-xs sm:text-sm font-extrabold text-foreground tracking-tight truncate">
                    {topStage ? topStage.name : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Taxa de Conversão</p>
                  <p className="text-xs sm:text-sm font-extrabold text-foreground tracking-tight tabular-nums truncate">
                    {conversionRate.toFixed(1)}% <span className="text-[10px] font-normal text-muted-foreground">({wonCount} fechados)</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
