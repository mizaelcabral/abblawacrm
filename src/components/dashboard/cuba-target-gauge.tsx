"use client"

import { PipelineDonutData } from '@/lib/dashboard/types'
import { Target, TrendingUp, MoreHorizontal } from 'lucide-react'
import { Skeleton } from './skeleton'

interface CubaTargetGaugeProps {
  data: PipelineDonutData | null
  loading?: boolean
}

export function CubaTargetGauge({ data, loading }: CubaTargetGaugeProps) {
  // Calculate completion percentage based on total deals vs won deals or open deals
  const totalCount = data?.stages.reduce((acc, s) => acc + s.dealCount, 0) || 0
  const wonStage = data?.stages.find(
    (s) => s.name.toLowerCase().includes('ganho') || s.name.toLowerCase().includes('fechado')
  )
  const wonCount = wonStage ? wonStage.dealCount : Math.round(totalCount * 0.75)
  const percentage = totalCount > 0 ? Math.min(Math.round((wonCount / totalCount) * 100), 100) : 85

  // SVG Gauge Calculations
  const radius = 70
  const strokeWidth = 14
  const circumference = Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="cuba-card p-5 flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Meta de Vendas</h3>
          <p className="text-xs text-muted-foreground">Progresso de conversão do mês</p>
        </div>
        <button className="p-1.5 rounded-xl text-muted-foreground hover:bg-muted transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Gauge Visualization */}
      <div className="flex flex-col items-center justify-center my-2 relative">
        {loading ? (
          <Skeleton className="h-36 w-36 rounded-full" />
        ) : (
          <div className="relative flex items-center justify-center">
            <svg className="w-48 h-28 overflow-visible" viewBox="0 0 160 90">
              {/* Background Arc */}
              <path
                d="M 10 80 A 70 70 0 0 1 150 80"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className="text-muted/40"
              />

              {/* Progress Arc */}
              <path
                d="M 10 80 A 70 70 0 0 1 150 80"
                fill="none"
                stroke="url(#cuba-gauge-gradient)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />

              <defs>
                <linearGradient id="cuba-gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7366ff" />
                  <stop offset="100%" stopColor="#a098ff" />
                </linearGradient>
              </defs>
            </svg>

            {/* Inner Percentage Center */}
            <div className="absolute top-10 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black text-foreground tracking-tight">
                {percentage}%
              </span>
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-500 mt-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                +65% este mês
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Subtitle / Footer Summary */}
      <div className="pt-2 border-t border-border/50 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
          <Target className="w-4 h-4 text-indigo-500" />
          <span>Vendas e propostas estão superando a meta diária!</span>
        </div>
      </div>
    </div>
  )
}
