# Web Chat Widget (Live Chat) Design Specification

## Overview
This document specifies the design for the embeddable Web Chat Widget (Live Chat) feature in ABBLAWACRM. 
The feature allows tenants to configure customized chat widgets, obtain an embeddable JavaScript snippet, and place it on external websites. Visitors on the website can converse in real time with human agents via the CRM Shared Inbox or with an AI Agent leveraging the tenant's knowledge base.

---

## 1. Database Schema (`supabase/migrations/052_chat_widgets.sql`)

### 1.1 `chat_widget_configs`
Stores tenant widget configurations and branding settings.

- `id`: UUID (Primary Key, default `gen_random_uuid()`)
- `account_id`: UUID (FK to `accounts.id`, ON DELETE CASCADE)
- `name`: TEXT (Widget label in tenant dashboard, e.g. "Site Principal")
- `widget_key`: UUID (Unique public key for external embedding, default `gen_random_uuid()`)
- `primary_color`: TEXT (Hex color code, default `#0F172A`)
- `title`: TEXT (Header title, e.g. "Atendimento Online")
- `subtitle`: TEXT (Header subtitle, e.g. "Como podemos ajudar você?")
- `welcome_message`: TEXT (Initial automated welcome bubble, e.g. "Olá! Em que podemos ajudar?")
- `position`: TEXT (`'bottom_right'` | `'bottom_left'`, default `'bottom_right'`)
- `require_lead_info`: BOOLEAN (If true, forces visitor to complete lead capture before chatting; default `false`)
- `ask_name`: BOOLEAN (Default `true`)
- `ask_email`: BOOLEAN (Default `true`)
- `ask_phone`: BOOLEAN (Default `true`)
- `ai_auto_respond`: BOOLEAN (If true, incoming visitor messages trigger the tenant's AI Agent; default `false`)
- `ai_agent_id`: UUID (Nullable FK to AI agent configuration/profile)
- `allowed_domains`: TEXT[] (Array of allowed domain origins for security CORS check, nullable)
- `is_active`: BOOLEAN (Default `true`)
- `created_at`: TIMESTAMPTZ (Default `now()`)
- `updated_at`: TIMESTAMPTZ (Default `now()`)

### 1.2 `chat_widget_sessions`
Tracks visitor chat sessions.

- `id`: UUID (Primary Key)
- `widget_config_id`: UUID (FK to `chat_widget_configs.id`, ON DELETE CASCADE)
- `account_id`: UUID (FK to `accounts.id`, ON DELETE CASCADE)
- `visitor_token`: TEXT (Unique token generated on visitor client and stored in visitor `localStorage`)
- `contact_id`: UUID (FK to `contacts.id`, linked when visitor provides details or created anonymously)
- `visitor_name`: TEXT (Nullable)
- `visitor_email`: TEXT (Nullable)
- `visitor_phone`: TEXT (Nullable)
- `metadata`: JSONB (Stores client page URL, referrer, user agent, IP)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### 1.3 Message Schema Integration
Visitor messages will be stored in the standard CRM `messages` table with:
- `account_id`: Tenant account ID
- `contact_id`: Visitor's contact ID
- `channel`: `'livechat'` (or `'web_widget'`)
- `direction`: `'inbound'` (visitor -> CRM) or `'outbound'` (CRM -> visitor)
- `content`: Message text
- `sender_type`: `'visitor'` | `'agent'` | `'ai'`

---

## 2. Public Embed Script & Widget Iframe Page

### 2.1 Public Script (`public/widget.js`)
A lightweight, dependency-free JavaScript file loaded by external websites:
```html
<script src="https://crm-domain.com/widget.js" data-widget-id="WIDGET_KEY" async></script>
```

**Responsibilities:**
- Reads `data-widget-id` from its script tag.
- Retrieves or generates a persistent `visitor_token` stored in the visitor site's `localStorage`.
- Injects a small CSS stylesheet and floating launcher button (styled dynamically according to tenant settings fetched via `/api/widget/[widgetKey]/config`).
- Injects an `<iframe>` container pointing to `https://crm-domain.com/widget/[widgetKey]?visitor_token=XYZ&url=CURRENT_URL`.
- Listens to `window.postMessage` events for iframe resize/open/close actions.

### 2.2 Public Widget Page (`/src/app/widget/[widgetKey]/page.tsx`)
A dedicated, responsive public Next.js page loaded inside the widget iframe.

**Flow & Features:**
- **Configuration Load:** Fetches public widget settings from `/api/widget/[widgetKey]/config`.
- **Pre-Registration Gate:** If `require_lead_info` is `true` and session is unidentifed, renders a crisp lead collection form asking for Name/Email/Phone before entering chat mode.
- **Chat Interface:** Renders header (title, subtitle, avatar, close button), message history list, and input area (text, emoji, send button).
- **Real-Time Synchronisation:** Uses Supabase Realtime subscription on `messages` filtered by `contact_id` to render incoming responses immediately.
- **Local Persistence:** Stores ongoing conversation state so refreshing or navigating external pages preserves the chat history.

---

## 3. Backend APIs & Integrations

### 3.1 Public API Endpoints
- `GET /api/widget/[widgetKey]/config` — Returns public widget configuration (color, title, fields, welcome message) and CORS headers.
- `POST /api/widget/[widgetKey]/session` — Creates or updates a visitor session, linking or creating a `contact` record.
- `GET /api/widget/[widgetKey]/messages` — Fetches history for a given `visitor_token`.
- `POST /api/widget/[widgetKey]/messages` — Receives visitor message:
  1. Saves message to `messages` table under channel `livechat`.
  2. Updates contact last message timestamp.
  3. Triggers Supabase Realtime broadcast to CRM agents.
  4. If `ai_auto_respond` is enabled, triggers AI process to evaluate knowledge base and reply asynchronously.

### 3.2 CRM Shared Inbox Integration
- In `/chats` (Shared Inbox), livechat conversations appear with a distinct "Web Chat" icon/badge.
- CRM operators can select the livechat contact, view visitor metadata (origin URL, referrer), and send replies.
- Outbound operator messages write to `messages` (`direction='outbound'`), which immediately pushes to the widget iframe via Supabase Realtime.

---

## 4. Tenant Management UI (`/settings/widgets`)

A management tab under Settings in the tenant dashboard allowing users to:
1. View a list of created widgets.
2. Create and edit widget settings (Colors, Title, Subtitle, Welcome Message, Lead Capture requirements, AI auto-reply toggle).
3. **Live Interactive Preview**: A split-screen preview panel showing real-time updates of the launcher bubble and iframe chat window as options are changed.
4. **Code Generator**: Provides a one-click "Copy Embed Script" snippet with instructions.

---

## 5. Security & Isolation
- **Iframe Sandboxing:** CSS and JS scope isolation between customer site and CRM.
- **Domain Whitelisting:** Optional origin restriction in config (`allowed_domains`).
- **Public API Rate Limiting & Validation:** Input sanitization on message endpoints.
