# Expanded Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the main dashboard (`/dashboard`) with Cuba template widgets for Funnel/Pipelines, Tasks, Appointments, and Sales/Products.

**Architecture:** Extend client-side aggregation queries in `src/lib/dashboard/queries.ts` using Supabase RLS and build Cuba-styled modular React components in `src/components/dashboard/`, placing them into a 4-row unified responsive grid in `src/app/(dashboard)/dashboard/page.tsx`.

**Tech Stack:** Next.js (App Router), React, Supabase JS Client, Tailwind CSS, Lucide React icons, date-fns.

## Global Constraints

- Preserve all existing dashboard metrics and layout options.
- Scoped to user's RLS session (never hardcode account_id).
- Match Cuba Admin Template visual design system (rounded-xl, subtle borders, slate/primary/success/warning accents).
- Handle loading and empty states gracefully.

---

### Task 1: Add Expanded TypeScript Types

**Files:**
- Modify: `src/lib/dashboard/types.ts`

**Interfaces:**
- Produces: `TasksSummary`, `TaskItem`, `AppointmentsSummary`, `AppointmentItem`, `EcommerceSummary`, `ProductItem` types for dashboard queries.

- [ ] **Step 1: Write type definitions in `src/lib/dashboard/types.ts`**

Add the following interfaces to `src/lib/dashboard/types.ts`:

```typescript
export interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'review_required' | 'completed'
  dueAt: string | null
  contactName: string | null
}

export interface TasksSummary {
  pendingCount: number
  inProgressCount: number
  reviewCount: number
  overdueCount: number
  completedTodayCount: number
  urgentTasks: TaskItem[]
}

export interface AppointmentItem {
  id: string
  startTime: string
  endTime: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  contactName: string
  serviceName: string
  meetingUrl: string | null
  locationAddress: string | null
}

export interface AppointmentsSummary {
  todayCount: number
  upcomingCount: number
  confirmedCount: number
  pendingCount: number
  cancelledCount: number
  todayAppointments: AppointmentItem[]
}

export interface ProductItem {
  id: string
  name: string
  price: number
  salesCount: number
}

export interface EcommerceSummary {
  monthlyRevenue: number
  todayRevenue: number
  paidOrdersCount: number
  pendingOrdersCount: number
  averageTicket: number
  topProducts: ProductItem[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dashboard/types.ts
git commit -m "types: add dashboard expanded summary interfaces"
```

---

### Task 2: Implement Expanded Data Queries

**Files:**
- Modify: `src/lib/dashboard/queries.ts`

**Interfaces:**
- Consumes: `TasksSummary`, `AppointmentsSummary`, `EcommerceSummary` from `src/lib/dashboard/types.ts`
- Produces: `loadTasksSummary`, `loadAppointmentsSummary`, `loadEcommerceSummary` functions.

- [ ] **Step 1: Add `loadTasksSummary`, `loadAppointmentsSummary`, `loadEcommerceSummary` to `src/lib/dashboard/queries.ts`**

Append data fetching functions to `src/lib/dashboard/queries.ts`:

```typescript
import type {
  TasksSummary,
  AppointmentsSummary,
  EcommerceSummary,
  TaskItem,
  AppointmentItem,
  ProductItem,
} from './types'

export async function loadTasksSummary(db: DB): Promise<TasksSummary> {
  const todayStart = startOfLocalDay().toISOString()
  const now = new Date().toISOString()

  const [countsRes, urgentRes] = await Promise.all([
    db.from('tasks').select('status, due_at, completed_at'),
    db
      .from('tasks')
      .select('id, title, status, due_at, contact:contacts(name, phone)')
      .neq('status', 'completed')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(5),
  ])

  const rows = (countsRes.data ?? []) as { status: string; due_at: string | null; completed_at: string | null }[]
  
  let pendingCount = 0
  let inProgressCount = 0
  let reviewCount = 0
  let overdueCount = 0
  let completedTodayCount = 0

  for (const r of rows) {
    if (r.status === 'completed') {
      if (r.completed_at && r.completed_at >= todayStart) {
        completedTodayCount++
      }
      continue
    }
    if (r.status === 'pending') pendingCount++
    if (r.status === 'in_progress') inProgressCount++
    if (r.status === 'review_required') reviewCount++
    if (r.due_at && r.due_at < now) overdueCount++
  }

  const urgentTasks: TaskItem[] = (urgentRes.data ?? []).map((t: any) => {
    const contact = Array.isArray(t.contact) ? t.contact[0] : t.contact
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.due_at,
      contactName: contact?.name || contact?.phone || null,
    }
  })

  return {
    pendingCount,
    inProgressCount,
    reviewCount,
    overdueCount,
    completedTodayCount,
    urgentTasks,
  }
}

export async function loadAppointmentsSummary(db: DB): Promise<AppointmentsSummary> {
  const todayStart = startOfLocalDay().toISOString()
  const endOfToday = daysAgoStart(-1).toISOString()
  const sevenDaysAhead = daysAgoStart(-7).toISOString()

  const [allRes, todayRes] = await Promise.all([
    db.from('appointments').select('status, start_time').gte('start_time', todayStart).lte('start_time', sevenDaysAhead),
    db
      .from('appointments')
      .select('id, start_time, end_time, status, meeting_url, location_address, contact:contacts(name, phone), service:services(name)')
      .gte('start_time', todayStart)
      .lt('start_time', endOfToday)
      .order('start_time', { ascending: true })
      .limit(4),
  ])

  const allRows = (allRes.data ?? []) as { status: string; start_time: string }[]
  let todayCount = 0
  let upcomingCount = 0
  let confirmedCount = 0
  let pendingCount = 0
  let cancelledCount = 0

  for (const r of allRows) {
    if (r.start_time >= todayStart && r.start_time < endOfToday) todayCount++
    if (r.start_time >= endOfToday) upcomingCount++
    if (r.status === 'confirmed') confirmedCount++
    if (r.status === 'pending') pendingCount++
    if (r.status === 'cancelled') cancelledCount++
  }

  const todayAppointments: AppointmentItem[] = (todayRes.data ?? []).map((a: any) => {
    const contact = Array.isArray(a.contact) ? a.contact[0] : a.contact
    const service = Array.isArray(a.service) ? a.service[0] : a.service
    return {
      id: a.id,
      startTime: a.start_time,
      endTime: a.end_time,
      status: a.status,
      contactName: contact?.name || contact?.phone || 'Cliente',
      serviceName: service?.name || 'Agendamento',
      meetingUrl: a.meeting_url || null,
      locationAddress: a.location_address || null,
    }
  })

  return {
    todayCount,
    upcomingCount,
    confirmedCount,
    pendingCount,
    cancelledCount,
    todayAppointments,
  }
}

export async function loadEcommerceSummary(db: DB): Promise<EcommerceSummary> {
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const todayStart = startOfLocalDay().toISOString()

  const [ordersRes, productsRes] = await Promise.all([
    db.from('orders').select('total_amount, status, created_at').gte('created_at', firstDayOfMonth),
    db.from('store_products').select('id, name, price').eq('is_active', true).limit(3),
  ])

  const orders = (ordersRes.data ?? []) as { total_amount: number; status: string; created_at: string }[]
  let monthlyRevenue = 0
  let todayRevenue = 0
  let paidOrdersCount = 0
  let pendingOrdersCount = 0

  for (const o of orders) {
    if (o.status === 'paid' || o.status === 'completed') {
      monthlyRevenue += o.total_amount || 0
      paidOrdersCount++
      if (o.created_at >= todayStart) {
        todayRevenue += o.total_amount || 0
      }
    } else if (o.status === 'pending' || o.status === 'awaiting_payment') {
      pendingOrdersCount++
    }
  }

  const averageTicket = paidOrdersCount > 0 ? monthlyRevenue / paidOrdersCount : 0

  const topProducts: ProductItem[] = (productsRes.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price || 0,
    salesCount: 0,
  }))

  return {
    monthlyRevenue,
    todayRevenue,
    paidOrdersCount,
    pendingOrdersCount,
    averageTicket,
    topProducts,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dashboard/queries.ts
git commit -m "feat: implement loadTasksSummary, loadAppointmentsSummary, loadEcommerceSummary"
```

---

### Task 3: Build Cuba Tasks Widget Component

**Files:**
- Create: `src/components/dashboard/cuba-tasks-widget.tsx`

**Interfaces:**
- Consumes: `TasksSummary` from `src/lib/dashboard/types.ts`
- Produces: `<CubaTasksWidget data={tasksSummary} loading={loading} onToggleTask={handleToggle} />`

- [ ] **Step 1: Create `src/components/dashboard/cuba-tasks-widget.tsx`**

```tsx
"use client"

import { CheckSquare, Clock, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { TasksSummary } from '@/lib/dashboard/types'
import { format, parseISO } from 'date-fns'

interface Props {
  data: TasksSummary | null
  loading: boolean
  onTaskCompleted?: (taskId: string) => void
}

export function CubaTasksWidget({ data, loading, onTaskCompleted }: Props) {
  if (loading || !data) {
    return (
      <Card className="h-full border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-10 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
          <div className="h-24 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Tarefas & Ações
            </CardTitle>
            <p className="text-xs text-slate-500">Resumo operacional do dia</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-xs text-indigo-600 hover:text-indigo-700">
          <Link href="/tasks">
            Ver todas <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Status Badges Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/40">
            <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Atrasadas
            </div>
            <span className="text-lg font-bold text-red-700 dark:text-red-300">{data.overdueCount}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40">
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <Clock className="w-3.5 h-3.5" /> Pendentes
            </div>
            <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{data.pendingCount}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40">
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Hoje
            </div>
            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{data.completedTodayCount}</span>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Próximas Tarefas Urgentes</h4>
          {data.urgentTasks.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Nenhuma tarefa pendente no momento 🎉</p>
          ) : (
            <div className="space-y-2">
              {data.urgentTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <Checkbox
                    id={`task-${t.id}`}
                    onCheckedChange={() => onTaskCompleted?.(t.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor={`task-${t.id}`} className="font-medium text-slate-900 dark:text-slate-200 cursor-pointer block truncate">
                      {t.title}
                    </label>
                    <div className="flex items-center gap-2 mt-1 text-slate-500 text-[11px]">
                      {t.contactName && <span>👤 {t.contactName}</span>}
                      {t.dueAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {format(parseISO(t.dueAt), 'dd/MM HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/cuba-tasks-widget.tsx
git commit -m "feat: add CubaTasksWidget component"
```

---

### Task 4: Build Cuba Appointments Widget Component

**Files:**
- Create: `src/components/dashboard/cuba-appointments-widget.tsx`

**Interfaces:**
- Consumes: `AppointmentsSummary` from `src/lib/dashboard/types.ts`
- Produces: `<CubaAppointmentsWidget data={appointmentsSummary} loading={loading} />`

- [ ] **Step 1: Create `src/components/dashboard/cuba-appointments-widget.tsx`**

```tsx
"use client"

import { Calendar, Clock, Video, MapPin, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AppointmentsSummary } from '@/lib/dashboard/types'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  data: AppointmentsSummary | null
  loading: boolean
}

export function CubaAppointmentsWidget({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <Card className="h-full border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-24 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Agenda & Agendamentos
            </CardTitle>
            <p className="text-xs text-slate-500">Compromissos agendados para hoje</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-xs text-blue-600 hover:text-blue-700">
          <Link href="/appointments">
            Ver agenda <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Counter Summary Bar */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-xs">
          <div>
            <span className="font-semibold text-blue-900 dark:text-blue-200 text-sm">{data.todayCount}</span>
            <span className="text-slate-500 ml-1">agendamentos hoje</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
              {data.confirmedCount} confirmados
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              {data.pendingCount} pendentes
            </Badge>
          </div>
        </div>

        {/* Today Timeline */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horários de Hoje</h4>
          {data.todayAppointments.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Nenhum agendamento para hoje</p>
          ) : (
            <div className="space-y-2.5">
              {data.todayAppointments.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center px-2 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-center">
                      <Clock className="w-3 h-3 text-blue-600 mb-0.5" />
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">
                        {format(parseISO(app.startTime), 'HH:mm')}
                      </span>
                    </div>

                    <div>
                      <h5 className="font-semibold text-slate-900 dark:text-slate-100">{app.contactName}</h5>
                      <span className="text-[11px] text-slate-500">{app.serviceName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {app.meetingUrl && (
                      <a
                        href={app.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 hover:opacity-80"
                        title="Link da reunião online"
                      >
                        <Video className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {app.locationAddress && (
                      <span className="p-1.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300" title={app.locationAddress}>
                        <MapPin className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/cuba-appointments-widget.tsx
git commit -m "feat: add CubaAppointmentsWidget component"
```

---

### Task 5: Build Cuba Pipeline Breakdown Widget Component

**Files:**
- Create: `src/components/dashboard/cuba-pipeline-widget.tsx`

**Interfaces:**
- Consumes: `PipelineDonutData` from `src/lib/dashboard/types.ts`
- Produces: `<CubaPipelineWidget data={pipelineData} loading={loading} />`

- [ ] **Step 1: Create `src/components/dashboard/cuba-pipeline-widget.tsx`**

```tsx
"use client"

import { Briefcase, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/currency'
import { useAuth } from '@/hooks/use-auth'
import type { PipelineDonutData } from '@/lib/dashboard/types'

interface Props {
  data: PipelineDonutData | null
  loading: boolean
}

export function CubaPipelineWidget({ data, loading }: Props) {
  const { defaultCurrency } = useAuth()

  if (loading || !data) {
    return (
      <Card className="h-full border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-32 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  const totalDeals = data.stages.reduce((sum, s) => sum + s.dealCount, 0)

  return (
    <Card className="h-full border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Funil de Vendas & Etapas
            </CardTitle>
            <p className="text-xs text-slate-500">Distribuição financeira por etapa do pipeline</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-xs text-emerald-600 hover:text-emerald-700">
          <Link href="/pipelines">
            Ver funil completo <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Total Summary Row */}
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-xs text-slate-500 block">Total em Aberto no Funil</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(data.totalValue, defaultCurrency)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500 block">Negócios Ativos</span>
            <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{totalDeals} oportunidades</span>
          </div>
        </div>

        {/* Stage breakdown list */}
        <div className="space-y-3 pt-1">
          {data.stages.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Nenhum negócio ativo no funil</p>
          ) : (
            data.stages.map((stage) => {
              const pct = data.totalValue > 0 ? (stage.totalValue / data.totalValue) * 100 : 0
              return (
                <div key={stage.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      {stage.name} ({stage.dealCount})
                    </span>
                    <span className="text-slate-900 dark:text-slate-100 font-semibold">
                      {formatCurrency(stage.totalValue, defaultCurrency)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2 bg-slate-100 dark:bg-slate-800" />
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/cuba-pipeline-widget.tsx
git commit -m "feat: add CubaPipelineWidget component"
```

---

### Task 6: Build Cuba Sales & Products Widget Component

**Files:**
- Create: `src/components/dashboard/cuba-sales-widget.tsx`

**Interfaces:**
- Consumes: `EcommerceSummary` from `src/lib/dashboard/types.ts`
- Produces: `<CubaSalesWidget data={ecommerceSummary} loading={loading} />`

- [ ] **Step 1: Create `src/components/dashboard/cuba-sales-widget.tsx`**

```tsx
"use client"

import { ShoppingBag, TrendingUp, DollarSign, Package, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { useAuth } from '@/hooks/use-auth'
import type { EcommerceSummary } from '@/lib/dashboard/types'

interface Props {
  data: EcommerceSummary | null
  loading: boolean
}

export function CubaSalesWidget({ data, loading }: Props) {
  const { defaultCurrency } = useAuth()

  if (loading || !data) {
    return (
      <Card className="h-full border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-32 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Vendas & Catálogo
            </CardTitle>
            <p className="text-xs text-slate-500">Resumo de pedidos e loja online</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-xs text-amber-600 hover:text-amber-700">
          <Link href="/ecommerce">
            Ver loja <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Sales Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30">
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium block">Faturamento Mês</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(data.monthlyRevenue, defaultCurrency)}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 font-medium block">Ticket Médio</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              {formatCurrency(data.averageTicket, defaultCurrency)}
            </span>
          </div>
        </div>

        {/* Featured Products */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Produtos / Serviços</h4>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Nenhum produto cadastrado</p>
          ) : (
            <div className="space-y-2">
              {data.topProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-medium text-slate-900 dark:text-slate-200">{p.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(p.price, defaultCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/cuba-sales-widget.tsx
git commit -m "feat: add CubaSalesWidget component"
```

---

### Task 7: Assemble Expanded Dashboard Page and Verify Build

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Update `src/app/(dashboard)/dashboard/page.tsx` to include new Cuba widgets in 4-row layout**

```tsx
"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { MessageSquare, UserPlus, DollarSign, Send, CheckSquare, Calendar as CalendarIcon } from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
  loadTasksSummary,
  loadAppointmentsSummary,
  loadEcommerceSummary,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
  TasksSummary,
  AppointmentsSummary,
  EcommerceSummary,
} from '@/lib/dashboard/types'

import { CubaWelcomeCard } from '@/components/dashboard/cuba-welcome-card'
import { CubaMetricCard } from '@/components/dashboard/cuba-metric-card'
import { CubaTopContacts } from '@/components/dashboard/cuba-top-contacts'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { CubaTasksWidget } from '@/components/dashboard/cuba-tasks-widget'
import { CubaAppointmentsWidget } from '@/components/dashboard/cuba-appointments-widget'
import { CubaPipelineWidget } from '@/components/dashboard/cuba-pipeline-widget'
import { CubaSalesWidget } from '@/components/dashboard/cuba-sales-widget'

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

  const [tasks, setTasks] = useState<TasksSummary | null>(null)
  const [tasksLoading, setTasksLoading] = useState(true)

  const [appointments, setAppointments] = useState<AppointmentsSummary | null>(null)
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)

  const [ecommerce, setEcommerce] = useState<EcommerceSummary | null>(null)
  const [ecommerceLoading, setEcommerceLoading] = useState(true)

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

  const handleTaskCompleted = useCallback((taskId: string) => {
    const db = createClient()
    void db
      .from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', taskId)
      .then(() => {
        loadTasksSummary(db).then(setTasks)
      })
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full">
      {/* Row 1: Cuba Welcome Banner + 6 KPI Metric Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 flex flex-col">
          <CubaWelcomeCard />
        </div>

        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {metricsLoading || !metrics ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <CubaMetricCard
                title="Conversas Ativas"
                value={metrics.activeConversations.current.toLocaleString()}
                icon={MessageSquare}
                variant="primary"
              />
              <CubaMetricCard
                title="Novos Leads"
                value={metrics.newContactsToday.current.toLocaleString()}
                icon={UserPlus}
                variant="success"
              />
              <CubaMetricCard
                title="Negócios"
                value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                icon={DollarSign}
                variant="secondary"
              />
              <CubaMetricCard
                title="Vendas Mês"
                value={formatCurrency(ecommerce?.monthlyRevenue || 0, defaultCurrency)}
                icon={Send}
                variant="warning"
              />
              <CubaMetricCard
                title="Tarefas"
                value={(tasks?.pendingCount || 0).toString()}
                icon={CheckSquare}
                variant="primary"
              />
              <CubaMetricCard
                title="Agenda Hoje"
                value={(appointments?.todayCount || 0).toString()}
                icon={CalendarIcon}
                variant="success"
              />
            </>
          )}
        </div>
      </div>

      {/* Row 2: Sales & Pipeline (8 cols + 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          <CubaPipelineWidget data={pipeline} loading={pipelineLoading} />
        </div>
        <div className="lg:col-span-4 flex flex-col">
          <CubaSalesWidget data={ecommerce} loading={ecommerceLoading} />
        </div>
      </div>

      {/* Row 3: Operations (6 cols Tasks + 6 cols Appointments) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 flex flex-col">
          <CubaTasksWidget data={tasks} loading={tasksLoading} onTaskCompleted={handleTaskCompleted} />
        </div>
        <div className="lg:col-span-6 flex flex-col">
          <CubaAppointmentsWidget data={appointments} loading={appointmentsLoading} />
        </div>
      </div>

      {/* Row 4: Main Charts & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 flex flex-col space-y-6">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
          <CubaTopContacts items={activity} loading={activityLoading} />
        </div>

        <div className="lg:col-span-5 flex flex-col">
          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run build / typecheck verification**

Run `npm run build` or `npx tsc --noEmit` to verify type safety and compilation.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: assemble unified expanded Cuba dashboard page"
```
