"use client"

import { Clock, Target } from 'lucide-react'
import { DOW_SHORT_MON_FIRST } from '@/lib/dashboard/date-utils'
import type { ResponseTimeSummary } from '@/lib/dashboard/types'
import { BarChart } from '@/components/tremor/bar-chart'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface ResponseTimeChartProps {
  data: ResponseTimeSummary | null
  loading: boolean
  thresholdMinutes?: number
}

const CATEGORY = 'Média (minutos)'

export function ResponseTimeChart({
  data,
  loading,
  thresholdMinutes = 5,
}: ResponseTimeChartProps) {
  const hasData = data?.buckets.some((b) => b.avgMinutes != null) ?? false

  const chartData =
    data?.buckets.map((b, i) => ({
      day: DOW_SHORT_MON_FIRST[i],
      [CATEGORY]: b.avgMinutes ?? 0,
      samples: b.samples,
    })) ?? []

  return (
    <section className="cuba-card p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Tempo Médio de Primeira Resposta
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Minutos para responder à primeira mensagem não respondida do cliente, por dia da semana
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 whitespace-nowrap self-start lg:self-auto">
          {thresholdMinutes > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-500 shrink-0">
              <Target className="w-3.5 h-3.5" />
              Meta {thresholdMinutes}m
            </span>
          )}
          {data && (data.thisWeekAvg != null || data.lastWeekAvg != null) && (
            <div className="flex items-center gap-3 text-xs bg-muted/40 border border-border/60 rounded-xl px-3 py-1 shrink-0">
              <div className="text-muted-foreground">
                Esta semana: <span className="font-bold text-foreground tabular-nums">{fmt(data.thisWeekAvg)}</span>
              </div>
              <span className="text-border/80">|</span>
              <div className="text-muted-foreground">
                Semana passada: <span className="font-semibold text-foreground/80 tabular-nums">{fmt(data.lastWeekAvg)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart Body */}
      <div>
        {loading || !data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <EmptyState
            icon={Clock}
            title="Nenhuma resposta registrada ainda"
            hint="Este gráfico será preenchido conforme você responder às mensagens dos clientes."
          />
        ) : (
          <BarChart
            data={chartData}
            index="day"
            categories={[CATEGORY]}
            colors={['violet']}
            valueFormatter={(value) => (value === 0 ? '0m' : value % 1 === 0 ? `${value}m` : `${value.toFixed(1)}m`)}
            showLegend={false}
            yAxisWidth={48}
            className="h-[260px]"
          />
        )}
      </div>
    </section>
  )
}

function fmt(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`
  if (mins < 60) return `${mins.toFixed(1)}m`
  return `${(mins / 60).toFixed(1)}h`
}
