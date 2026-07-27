# Cuba Admin Dashboard & Layout Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Transform the main ABBLA WACRM App Shell (Header & Sidebar) and Dashboard page (`/dashboard`) into an identical visual implementation of the Cuba Admin template while preserving all existing Supabase queries, real-time data, and CRM capabilities.

**Architecture:** 
1. Create Cuba-themed Shell components (`CubaHeader`, `CubaSidebar`, `CubaAnnouncementBanner`) and integrate them into `src/app/(dashboard)/layout.tsx`.
2. Enhance `src/app/globals.css` with Cuba color variables, gradient utilities, and card elevation classes.
3. Redesign `src/app/(dashboard)/dashboard/page.tsx` using a Cuba 3-column layout containing the Welcome Card, 4 KPI Metrics, Response Time card, Top Active Contacts table, Conversations & Sales Chart, and Pipeline Semi-Circle Target Gauge.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind CSS v4, Lucide React Icons, Supabase SSR Client, Recharts.

## Global Constraints
- Must preserve all existing Supabase queries in `src/lib/dashboard/queries.ts` and data types in `src/lib/dashboard/types.ts`.
- Must be fully responsive (mobile, tablet, desktop) and support Light/Dark theme switching.
- Must use TypeScript and Tailwind CSS v4 without introducing incompatible legacy CRA packages.

---

### Task 1: Cuba Theme Variables & CSS Enhancements

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: CSS utility classes `.cuba-card`, `.cuba-gradient-welcome`, `.cuba-sidebar`, `.cuba-header` and CSS color variables.

- [ ] **Step 1: Add Cuba color palette & gradient variables to `globals.css`**
- [ ] **Step 2: Add custom card shadow, border radius, and gradient background utility classes**
- [ ] **Step 3: Verify CSS build passes without syntax errors**

---

### Task 2: Cuba Header & Top Announcement Banner Components

**Files:**
- Create: `src/components/layout/cuba-header.tsx`
- Create: `src/components/layout/cuba-announcement-banner.tsx`

**Interfaces:**
- Consumes: `useAuth()` from `@/hooks/use-auth`
- Produces: `<CubaHeader toggleSidebar={...} />` and `<CubaAnnouncementBanner />`

- [ ] **Step 1: Build `CubaAnnouncementBanner` with dismissable state and update badge**
- [ ] **Step 2: Build `CubaHeader` with Cuba logo, search bar, theme toggle, notifications dropdown, and user avatar dropdown**
- [ ] **Step 3: Verify component renders clean without React 19 hydration issues**

---

### Task 3: Cuba Retractable Sidebar Navigation Component

**Files:**
- Create: `src/components/layout/cuba-sidebar.tsx`

**Interfaces:**
- Consumes: `usePathname()` from `next/navigation`
- Produces: `<CubaSidebar isOpen={boolean} onClose={...} />`

- [ ] **Step 1: Build `CubaSidebar` with categorized menu sections (Dashboard, CRM, E-commerce, Automations, Settings)**
- [ ] **Step 2: Add active route highlighting, retractable collapse mode, and badges for new items**
- [ ] **Step 3: Link all sidebar items to existing ABBLA dashboard routes (`/dashboard`, `/inbox`, `/contacts`, `/pipelines`, `/automations`, `/ecommerce`, `/settings`)**

---

### Task 4: Integrate Cuba Shell into App Router Layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `<CubaHeader />`, `<CubaSidebar />`, `<CubaAnnouncementBanner />`
- Produces: Unified Dashboard layout wrapper for all ABBLA dashboard pages.

- [ ] **Step 1: Update `src/app/(dashboard)/layout.tsx` to wrap children in the new Cuba Shell**
- [ ] **Step 2: Test sidebar collapse toggle state and mobile drawer responsive behavior**

---

### Task 5: Cuba Welcome Banner Card & Enhanced KPI Metric Cards

**Files:**
- Create: `src/components/dashboard/cuba-welcome-card.tsx`
- Create: `src/components/dashboard/cuba-metric-card.tsx`

**Interfaces:**
- Consumes: `useAuth()` user profile, `metrics` bundle from `src/lib/dashboard/queries.ts`
- Produces: `<CubaWelcomeCard />` and `<CubaMetricCard />`

- [ ] **Step 1: Build `CubaWelcomeCard` with purple gradient background, user name greeting, current time clock, and quick action buttons**
- [ ] **Step 2: Build `CubaMetricCard` matching Cuba's circular icon badges, percentage indicators, and soft card styling**
- [ ] **Step 3: Unit test rendering with mock metrics**

---

### Task 6: Cuba Top Contacts Table & Target Gauge Components

**Files:**
- Create: `src/components/dashboard/cuba-top-contacts.tsx`
- Create: `src/components/dashboard/cuba-target-gauge.tsx`

**Interfaces:**
- Consumes: `ActivityItem[]` and `PipelineDonutData`
- Produces: `<CubaTopContacts items={activity} />` and `<CubaTargetGauge data={pipeline} />`

- [ ] **Step 1: Build `CubaTopContacts` showing active contacts with avatars, purchase/deal counts, and total deal values**
- [ ] **Step 2: Build `CubaTargetGauge` rendering a semi-circular progress gauge using Recharts / SVG**

---

### Task 7: Assemble Complete Cuba Main Dashboard Page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: All Cuba dashboard widgets and Supabase loader functions (`loadMetrics`, `loadConversationsSeries`, `loadPipelineDonut`, `loadResponseTime`, `loadActivity`)

- [ ] **Step 1: Update `src/app/(dashboard)/dashboard/page.tsx` to arrange widgets according to the Cuba 3-column layout grid**
- [ ] **Step 2: Connect real-time Supabase metrics to CubaWelcomeCard, CubaMetricCard grid, ConversationsChart, CubaTopContacts, and CubaTargetGauge**
- [ ] **Step 3: Verify full page builds and typechecks cleanly**

---

### Task 8: Verification & Build Check

**Files:**
- All modified/created files

- [ ] **Step 1: Run `npm run typecheck` to verify TypeScript compliance**
- [ ] **Step 2: Run `npm run build` to verify production build succeeds**
