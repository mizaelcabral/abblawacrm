// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}

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

