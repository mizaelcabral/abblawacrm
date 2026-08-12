"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  TrendingUp,
  CheckSquare,
  Calendar,
} from 'lucide-react'

import {
  loadActivity,
  loadAppointmentsSummary,
  loadConversationsSeries,
  loadEcommerceSummary,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
  loadTasksSummary,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  AppointmentsSummary,
  ConversationsSeriesPoint,
  EcommerceSummary,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
  TasksSummary,
} from '@/lib/dashboard/types'

import { CubaWelcomeCard } from '@/components/dashboard/cuba-welcome-card'
import { CubaMetricCard } from '@/components/dashboard/cuba-metric-card'
import { CubaTopContacts } from '@/components/dashboard/cuba-top-contacts'
import { CubaPipelineWidget } from '@/components/dashboard/cuba-pipeline-widget'
import { CubaSalesWidget } from '@/components/dashboard/cuba-sales-widget'
import { CubaTasksWidget } from '@/components/dashboard/cuba-tasks-widget'
import { CubaAppointmentsWidget } from '@/components/dashboard/cuba-appointments-widget'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { CubaTargetGauge } from '@/components/dashboard/cuba-target-gauge'
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

  const [tasks, setTasks] = useState<TasksSummary | null>(null)
  const [tasksLoading, setTasksLoading] = useState(true)

  const [appointments, setAppointments] = useState<AppointmentsSummary | null>(null)
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)

  const [ecommerce, setEcommerce] = useState<EcommerceSummary | null>(null)
  const [ecommerceLoading, setEcommerceLoading] = useState(true)

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

    void loadTasksSummary(db)
      .then((t) => setTasks(t))
      .catch((err) => console.error('[dashboard] tasks failed:', err))
      .finally(() => setTasksLoading(false))

    void loadAppointmentsSummary(db)
      .then((a) => setAppointments(a))
      .catch((err) => console.error('[dashboard] appointments failed:', err))
      .finally(() => setAppointmentsLoading(false))

    void loadEcommerceSummary(db)
      .then((e) => setEcommerce(e))
      .catch((err) => console.error('[dashboard] ecommerce failed:', err))
      .finally(() => setEcommerceLoading(false))
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

  const handleTaskCompleted = useCallback((taskId: string) => {
    const db = createClient()
    void (async () => {
      try {
        const { error } = await db
          .from('tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', taskId)
        if (error) {
          console.error('[dashboard] update task failed:', error)
          return
        }
        const t = await loadTasksSummary(db)
        setTasks(t)
      } catch (err) {
        console.error('[dashboard] handleTaskCompleted failed:', err)
      }
    })()
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full">
      {/* Row 1: Cuba Welcome Banner + 6 KPI Metric Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Welcome Card (Spans 5 cols on LG) */}
        <div className="lg:col-span-5 flex flex-col">
          <CubaWelcomeCard />
        </div>

        {/* 6 Metric Cards (Spans 7 cols on LG in 3x2 grid) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metricsLoading || !metrics ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
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
                title="Receita Mensal"
                value={formatCurrency(ecommerce?.monthlyRevenue ?? 0, defaultCurrency)}
                icon={TrendingUp}
                variant="warning"
                subtitle={`${ecommerce?.paidOrdersCount ?? 0} pedido${(ecommerce?.paidOrdersCount ?? 0) === 1 ? '' : 's'} pago${(ecommerce?.paidOrdersCount ?? 0) === 1 ? '' : 's'}`}
              />
              <CubaMetricCard
                title="Tarefas Pendentes"
                value={(tasks?.pendingCount ?? 0).toLocaleString()}
                icon={CheckSquare}
                variant="primary"
                subtitle={`${tasks?.overdueCount ?? 0} atrasada${(tasks?.overdueCount ?? 0) === 1 ? '' : 's'}`}
              />
              <CubaMetricCard
                title="Agendamentos Hoje"
                value={(appointments?.todayCount ?? 0).toLocaleString()}
                icon={Calendar}
                variant="success"
                subtitle={`${appointments?.confirmedCount ?? 0} confirmado${(appointments?.confirmedCount ?? 0) === 1 ? '' : 's'}`}
              />
            </>
          )}
        </div>
      </div>

      {/* Row 2: Sales & Pipeline (CubaPipelineWidget 8 cols + CubaSalesWidget 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          <CubaPipelineWidget data={pipeline} loading={pipelineLoading} currency={defaultCurrency} />
        </div>
        <div className="lg:col-span-4 flex flex-col">
          <CubaSalesWidget data={ecommerce} loading={ecommerceLoading} currency={defaultCurrency} />
        </div>
      </div>

      {/* Row 3: Operations (CubaTasksWidget 6 cols + CubaAppointmentsWidget 6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 flex flex-col">
          <CubaTasksWidget data={tasks} loading={tasksLoading} onTaskCompleted={handleTaskCompleted} />
        </div>
        <div className="lg:col-span-6 flex flex-col">
          <CubaAppointmentsWidget data={appointments} loading={appointmentsLoading} />
        </div>
      </div>

      {/* Row 4: Analytics & Activity (7 cols Left + 5 cols Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Conversations Chart + Top Contacts / Activity Table */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
          <CubaTopContacts items={activity} loading={activityLoading} />
        </div>

        {/* Right Column (5 cols): Response Time Chart + Target Gauge */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
          <CubaTargetGauge data={pipeline} loading={pipelineLoading} />
        </div>
      </div>
    </div>
  )
}

