"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { MessageSquare, UserPlus, DollarSign, Send } from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { CubaWelcomeCard } from '@/components/dashboard/cuba-welcome-card'
import { CubaMetricCard } from '@/components/dashboard/cuba-metric-card'
import { CubaTopContacts } from '@/components/dashboard/cuba-top-contacts'
import { CubaTargetGauge } from '@/components/dashboard/cuba-target-gauge'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { SkeletonCard } from '@/components/dashboard/skeleton'

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full">
      {/* Cuba Top Row: Welcome Banner + 4 KPI Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Welcome Card (Spans 7 cols on LG) */}
        <div className="lg:col-span-7 flex flex-col">
          <CubaWelcomeCard />
        </div>

        {/* 4 Metric Cards (Spans 5 cols on LG in 2x2 grid) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {metricsLoading || !metrics ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <CubaMetricCard
                title="Conversas Ativas"
                value={metrics.activeConversations.current.toLocaleString()}
                icon={MessageSquare}
                variant="primary"
                delta={{
                  value: `${metrics.activeConversations.previous >= 0 ? '+' : ''}${metrics.activeConversations.previous}`,
                  isPositive: metrics.activeConversations.previous >= 0,
                }}
              />
              <CubaMetricCard
                title="Novos Leads Hoje"
                value={metrics.newContactsToday.current.toLocaleString()}
                icon={UserPlus}
                variant="success"
                delta={{
                  value: `${metrics.newContactsToday.current - metrics.newContactsToday.previous >= 0 ? '+' : ''}${metrics.newContactsToday.current - metrics.newContactsToday.previous}`,
                  isPositive: metrics.newContactsToday.current >= metrics.newContactsToday.previous,
                }}
              />
              <CubaMetricCard
                title="Negócios Abertos"
                value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                icon={DollarSign}
                variant="secondary"
                subtitle={`${metrics.openDealsCount} negócio${metrics.openDealsCount === 1 ? '' : 's'}`}
              />
              <CubaMetricCard
                title="Mensagens Enviadas"
                value={metrics.messagesSentToday.current.toLocaleString()}
                icon={Send}
                variant="warning"
                delta={{
                  value: `${metrics.messagesSentToday.current - metrics.messagesSentToday.previous >= 0 ? '+' : ''}${metrics.messagesSentToday.current - metrics.messagesSentToday.previous}`,
                  isPositive: metrics.messagesSentToday.current >= metrics.messagesSentToday.previous,
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Middle Row: Conversations Main Chart + Monthly Target Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Chart (Spans 8 cols on LG) */}
        <div className="lg:col-span-8 flex flex-col">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>

        {/* Target Gauge (Spans 4 cols on LG) */}
        <div className="lg:col-span-4 flex flex-col">
          <CubaTargetGauge data={pipeline} loading={pipelineLoading} />
        </div>
      </div>

      {/* Bottom Row: Top Contacts Table + Response Time Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Top Contacts / Activity Table (Spans 7 cols on LG) */}
        <div className="lg:col-span-7 flex flex-col">
          <CubaTopContacts items={activity} loading={activityLoading} />
        </div>

        {/* Response Time Chart (Spans 5 cols on LG) */}
        <div className="lg:col-span-5 flex flex-col">
          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
        </div>
      </div>
    </div>
  )
}
