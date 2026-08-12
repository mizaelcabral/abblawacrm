# Design Spec: Expanded Dashboard with Cuba Template Styling

**Date**: 2026-08-12  
**Status**: Approved  
**Topic**: Dashboard Multi-Module Enhancements (Funnel, Tasks, Appointments, Products & Sales)

---

## 1. Overview

The primary dashboard (`/dashboard`) currently displays WhatsApp conversation metrics, active contacts, general open deal value, response times, and recent activities.

This design expands the main dashboard into a unified operational command center by integrating real-time summaries for:
- **Sales Funnel (Pipelines & Deals)**
- **Tasks & Checklist**
- **Appointments & Calendar**
- **E-commerce, Products & Direct Charges**

The layout adopts **Approach 2 (Unified Section Grid)** with UI component design inspired by the **Cuba Admin Template** (`layout/html`).

---

## 2. Architecture & Data Fetching

All metrics are fetched in parallel client-side inside `src/lib/dashboard/queries.ts` using Supabase queries scoped by RLS (`account_id` implicit).

### 2.1 New Query Functions in `src/lib/dashboard/queries.ts`

1. **`loadTasksSummary(db)`**:
   - Queries `tasks` table for:
     - `pendingCount`, `inProgressCount`, `reviewCount`, `overdueCount`, `completedTodayCount`.
     - Top 5 urgent pending/overdue tasks ordered by `due_at` ascending.

2. **`loadAppointmentsSummary(db)`**:
   - Queries `appointments` table with `services` and `contacts` join for:
     - `todayCount`, `upcomingCount` (next 7 days), `confirmedCount`, `pendingCount`, `cancelledCount`.
     - Top 4 upcoming appointments scheduled for today with time, contact, service name, and meeting URL / address.

3. **`loadEcommerceSummary(db)`**:
   - Queries `orders` table (and `direct_charges` / `store_products` if applicable):
     - `monthlyRevenue` (sum of paid orders in current month), `todayRevenue`, `paidOrdersCount`, `pendingOrdersCount`, `averageTicket`.
     - Top 3 popular products / services.

4. **`loadExpandedMetrics(db)`**:
   - Aggregates existing `MetricsBundle` plus new counters for the top 6 Cuba KPI Cards.

---

## 3. UI Layout & Component Specifications

The page layout in `src/app/(dashboard)/dashboard/page.tsx` will be organized into 4 vertical rows using Cuba-inspired Tailwind UI components in `src/components/dashboard/`:

```
+-----------------------------------------------------------------------------------+
| ROW 1: Cuba Welcome Card (7 cols)  +  6 KPI Metric Cards Grid (5 cols)             |
+-----------------------------------------------------------------------------------+
| ROW 2: Cuba Sales Pipeline Gauge & Stages (8 cols) | Sales & Product Summary (4 cols) |
+-----------------------------------------------------------------------------------+
| ROW 3: Interactive Tasks Widget (6 cols)          | Today's Appointments Timeline (6 cols) |
+-----------------------------------------------------------------------------------+
| ROW 4: Conversations Chart + Activity Feed (7 cols)| Response Time Analytics (5 cols)|
+-----------------------------------------------------------------------------------+
```

### 3.1 Row 1: Banner & 6 KPI Metric Cards
- **`CubaWelcomeCard`**: Existing greeting card with date and quick actions.
- **6 KPI Metric Cards Grid**:
  1. *Active Conversations* (`MessageSquare`)
  2. *New Leads Today* (`UserPlus`)
  3. *Monthly Revenue* (`TrendingUp` / `DollarSign`)
  4. *Open Deals Value* (`Briefcase` / `Layers`)
  5. *Pending & Overdue Tasks* (`CheckSquare`)
  6. *Today's Appointments* (`Calendar`)

### 3.2 Row 2: Sales & Pipeline Section
- **`CubaPipelineWidget` (8 cols)**:
  - Visual breakdown of deals per pipeline stage (Progress bars, counts, and financial values).
  - Won vs Lost vs Open summary stats.
- **`CubaSalesProductsWidget` (4 cols)**:
  - E-commerce & billing performance card (Monthly Revenue, Paid vs Pending Orders, Average Ticket).
  - List of top featured/selling products or services.

### 3.3 Row 3: Operations Section (Tasks + Agenda)
- **`CubaTasksWidget` (6 cols)**:
  - Badge counts: *Atrasadas* (Red), *Hoje* (Amber), *Em Andamento* (Blue).
  - Interactive mini todo-list: checkbox to complete tasks directly from the dashboard, displaying contact name and due date.
- **`CubaAppointmentsWidget` (6 cols)**:
  - Timeline of today's scheduled meetings/appointments.
  - Displays start time, client name, service type, and location/online link badge.

### 3.4 Row 4: Analytics & Activity Feed
- **`ConversationsChart` & `CubaTopContacts` / `ActivityFeed` (7 cols)**.
- **`ResponseTimeChart` (5 cols)**.

---

## 4. UI Components to Create / Modify

1. `src/lib/dashboard/types.ts`: Define TypeScript types for `TasksSummary`, `AppointmentsSummary`, `EcommerceSummary`, `ExpandedMetricsBundle`.
2. `src/lib/dashboard/queries.ts`: Implement `loadTasksSummary`, `loadAppointmentsSummary`, `loadEcommerceSummary`.
3. `src/components/dashboard/cuba-tasks-widget.tsx`: New component for tasks summary & interactive completion.
4. `src/components/dashboard/cuba-appointments-widget.tsx`: New component for agenda timeline.
5. `src/components/dashboard/cuba-pipeline-widget.tsx`: New component for pipeline stages breakdown.
6. `src/components/dashboard/cuba-sales-widget.tsx`: New component for e-commerce and sales metrics.
7. `src/app/(dashboard)/dashboard/page.tsx`: Integrate new components and states into unified grid.

---

## 5. Non-Functional Requirements & UX
- **Performance**: Asynchronous parallel fetching via `Promise.all` so slow queries don't block faster widgets.
- **Loading States**: Skeleton loaders matching Cuba card shapes.
- **Empty States**: Friendly setup hints if no tasks, appointments, or products exist yet.
- **Responsiveness**: Grid adjusts cleanly from 1 column on mobile to multi-column desktop layout.
