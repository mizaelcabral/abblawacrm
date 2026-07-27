"use client"

import { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface CubaMetricCardProps {
  title: string
  value: string
  icon: React.ElementType
  delta?: {
    value?: string | number
    label?: string
    isPositive?: boolean
  }
  subtitle?: string
  variant?: 'primary' | 'success' | 'secondary' | 'warning'
}

const variantStyles = {
  primary: {
    bgIcon: 'cuba-badge-soft-primary',
    textIcon: 'text-indigo-600 dark:text-indigo-400',
  },
  success: {
    bgIcon: 'cuba-badge-soft-success',
    textIcon: 'text-emerald-600 dark:text-emerald-400',
  },
  secondary: {
    bgIcon: 'cuba-badge-soft-secondary',
    textIcon: 'text-rose-600 dark:text-rose-400',
  },
  warning: {
    bgIcon: 'bg-amber-500/15',
    textIcon: 'text-amber-600 dark:text-amber-400',
  },
}

export function CubaMetricCard({
  title,
  value,
  icon: Icon,
  delta,
  subtitle,
  variant = 'primary',
}: CubaMetricCardProps) {
  const style = variantStyles[variant] || variantStyles.primary

  return (
    <div className="cuba-card p-5 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div
          className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${style.bgIcon}`}
        >
          <Icon className={`w-5.5 h-5.5 ${style.textIcon}`} />
        </div>

        {delta && (
          <div
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${
              delta.isPositive !== false
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {delta.isPositive !== false ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            <span>{delta.value ?? delta.label}</span>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {value}
        </h3>
        <p className="text-xs font-medium text-muted-foreground mt-1">
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] font-semibold text-primary/80 mt-1">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
