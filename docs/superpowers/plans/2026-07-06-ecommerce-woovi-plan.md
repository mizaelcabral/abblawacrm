# E-commerce & Woovi Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete e-commerce system with products (physical and digital), variations, category support, cart drawer, public checkout integrated with the Woovi Pix API, human operator suggestions, AI agent purchase automation, an administrative e-commerce dashboard for tenants including store branding (logo and description settings), customer address saving for autopopulating returning orders, and repurchase reminders.

**Architecture:** Database tables added to Supabase, custom pages under `/shop/[tenantSlug]` for storefront, a dedicated tenant admin layout under `/ecommerce`, internal checkout routes calling Woovi, public webhooks for payment updates, and inbox integrations.

**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL & Realtime Client), Tailwind CSS, Lucide Icons, Woovi Payments API.

## Global Constraints
- Maintain database integrity using strict foreign keys referencing accounts and profiles.
- Keep components focused and responsive (optimized for mobile viewport).
- Use local translation files or Portuguese copy for tenant-facing elements.
- Never write credentials in code; use environment variables or encrypted configurations.

---

### Task 1: Supabase Migrations & Types

**Files:**
- Create: `supabase/migrations/20260706_ecommerce_woovi.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write the Supabase migration file**
Create the migration `supabase/migrations/20260706_ecommerce_woovi.sql` declaring the enum type `product_type_enum` (`physical`, `digital`) and tables `woovi_config`, `product_categories`, `products` (including `product_type` and `digital_content`), `product_variations`, `shipping_addresses`, `orders`, and `order_items` with their respective columns, RLS policies, and indexes.

- [ ] **Step 2: Update TypeScript types**
Modify `src/types/index.ts` to export interfaces corresponding to these tables: `WooviConfig`, `ProductCategory`, `Product`, `ProductVariation`, `ShippingAddress`, `Order`, and `OrderItem`.

- [ ] **Step 3: Test types build**
Run the typescript compiler to ensure there are no compilation errors.
Run: `npm run build` (or similar lint check)

---

### Task 2: Woovi API Integration Helper

**Files:**
- Create: `src/lib/woovi/client.ts`
- Create: `src/lib/woovi/client.test.ts`

- [ ] **Step 1: Implement Woovi client helper**
Create `src/lib/woovi/client.ts` containing the method `createWooviCharge` that takes credentials (`appId`, `secretKey`), order details, and generates a Pix charge request to `POST https://api.woovi.com/v1/charge`.

- [ ] **Step 2: Add client tests**
Create `src/lib/woovi/client.test.ts` to test client generation, headers structure, and mock successful and failed API responses.

- [ ] **Step 3: Run Vitest tests**
Run: `npx vitest run src/lib/woovi/client.test.ts`
Expected: PASS

---

### Task 3: Administrative E-commerce Dashboard

**Files:**
- Create: `src/app/(dashboard)/ecommerce/layout.tsx`
- Create: `src/app/(dashboard)/ecommerce/page.tsx`
- Create: `src/app/(dashboard)/ecommerce/products/page.tsx`
- Create: `src/components/ecommerce/product-form.tsx`
- Create: `src/app/(dashboard)/ecommerce/orders/page.tsx`

- [ ] **Step 1: Implement layout and overview**
Create `src/app/(dashboard)/ecommerce/layout.tsx` for panel navigation and `src/app/(dashboard)/ecommerce/page.tsx` for sales analytics, charts, average order values, and recent transaction summaries.

- [ ] **Step 2: Implement products catalog CRUD**
Create `src/app/(dashboard)/ecommerce/products/page.tsx` to list and filter products and `src/components/ecommerce/product-form.tsx` supporting title/description, physical/digital type toggle, digital content field (`digital_content`), grade variations, custom shipping fees, upsell, and repurchase reminder configurations.

- [ ] **Step 3: Implement orders management and store identity**
Create `src/app/(dashboard)/ecommerce/orders/page.tsx` listing order history and shipping details. Add store branding settings (description field and logo upload component) within the ecommerce settings panel.

---

### Task 4: Storefront Pages & Cart Drawer

**Files:**
- Create: `src/app/shop/[tenantSlug]/page.tsx`
- Create: `src/app/shop/[tenantSlug]/product/[productSlug]/page.tsx`
- Create: `src/components/shop/cart-drawer.tsx`

- [ ] **Step 1: Create main shop listing page**
Create `src/app/shop/[tenantSlug]/page.tsx` displaying the tenant storefront, custom header with logo uploader image and description display, category pills, product grid, and cart button.

- [ ] **Step 2: Create product detail page**
Create `src/app/shop/[tenantSlug]/product/[productSlug]/page.tsx` showing the gallery, variation selectors, dynamic price updates, description, and "Adicionar ao Carrinho".

- [ ] **Step 3: Create cart drawer with Upsell**
Create `src/components/shop/cart-drawer.tsx` showing the items list and check for `upsell_product_id` to render the upsell card.

---

### Task 5: Storefront Checkout & Address Saving API

**Files:**
- Create: `src/app/shop/[tenantSlug]/checkout/page.tsx`
- Create: `src/app/api/ecommerce/checkout/route.ts`
- Create: `src/app/api/ecommerce/addresses/route.ts`

- [ ] **Step 1: Implement Checkout & Address APIs**
Create `src/app/api/ecommerce/checkout/route.ts` (checkout processor, calculates shipping, skips address saving if cart only has digital products) and `src/app/api/ecommerce/addresses/route.ts` (returns past addresses associated with phone number).

- [ ] **Step 2: Build Checkout page with address autocomplete**
Create `src/app/shop/[tenantSlug]/checkout/page.tsx` to collect customer details, fetch/display saved shipping addresses upon typing phone number (if physical products present, otherwise hide address forms entirely), initiate Woovi payment, and display Pix payment QR Code with realtime listener.

---

### Task 6: Woovi Webhooks & Automations

**Files:**
- Create: `src/app/api/webhooks/woovi/route.ts`

- [ ] **Step 1: Create Webhook Endpoint**
Create `src/app/api/webhooks/woovi/route.ts` to receive `charge.completed` updates, modify order status to `'paid'`, subtract stock (only for physical items), send custom digital content download link or access text on WhatsApp, create/associate contact in CRM, and enqueue a WhatsApp message confirming the purchase.

---

### Task 7: Inbox Integration (Composer Suggestion Tool)

**Files:**
- Modify: `src/components/inbox/message-composer.tsx`
- Create: `src/components/inbox/product-selector-dialog.tsx`

- [ ] **Step 1: Add Composer product suggestion button**
Modify `src/components/inbox/message-composer.tsx` to render a shopping bag icon that triggers `<ProductSelectorDialog />`.

- [ ] **Step 2: Build Product Selector Dialog**
Create `src/components/inbox/product-selector-dialog.tsx` showing the tenant product catalog. Selecting a product generates a message link or quick payment Pix card.

---

### Task 8: AI Agent Tools & Recompra Scheduler

**Files:**
- Modify: `src/lib/ai/task-worker.ts`

- [ ] **Step 1: Add AI Agent tools**
In `src/lib/ai/task-worker.ts`, define tools `search_store_products` and `create_direct_charge` in `GEMINI_TOOLS` and implement their handlers.

- [ ] **Step 2: Add repurchase reminder task**
Implement a routine in `executePendingAITasks` (or as a separate cron worker) that fetches orders where `repurchase_reminder_at <= NOW()` and `repurchase_reminder_sent = false` and triggers a message notification.
