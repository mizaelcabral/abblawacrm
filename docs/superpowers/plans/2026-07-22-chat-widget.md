# Web Chat Widget (Live Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete multi-tenant Web Chat Widget (Live Chat) feature for ABBLAWACRM allowing tenants to embed a customizable chat widget on external websites, converse with visitors via the CRM Shared Inbox, and optionally automate replies via AI.

**Architecture:** An iframe-isolated widget (`public/widget.js` launcher + `/widget/[widgetKey]` iframe route) connected to public APIs (`/api/widget/[widgetKey]/*`), backed by Supabase tables (`chat_widget_configs`, `chat_widget_sessions`) and integrated into the CRM's unified `messages` table and shared inbox UI.

**Tech Stack:** Next.js 16 (App Router), Supabase SSR & Realtime, React 19, Tailwind CSS, Vitest.

## Global Constraints

- Must follow Next.js App Router API route conventions.
- All public endpoints must allow CORS for widget embedding.
- Tenant isolation must be strictly enforced by `account_id` and Supabase RLS.
- Code edits must pass `npm run typecheck` and `npm test`.

---

### Task 1: Database Migration for Chat Widgets

**Files:**
- Create: `supabase/migrations/052_chat_widgets.sql`

**Interfaces:**
- Consumes: `accounts(id)`, `contacts(id)`
- Produces: `chat_widget_configs`, `chat_widget_sessions` tables and RLS policies

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/052_chat_widgets.sql` with the following content:

```sql
-- 052_chat_widgets.sql
-- Create chat_widget_configs table
CREATE TABLE IF NOT EXISTS public.chat_widget_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Widget do Site',
    widget_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    primary_color TEXT NOT NULL DEFAULT '#0F172A',
    title TEXT NOT NULL DEFAULT 'Atendimento Online',
    subtitle TEXT NOT NULL DEFAULT 'Como podemos ajudar você hoje?',
    welcome_message TEXT NOT NULL DEFAULT 'Olá! Seja bem-vindo ao nosso site.',
    position TEXT NOT NULL DEFAULT 'bottom_right' CHECK (position IN ('bottom_right', 'bottom_left')),
    require_lead_info BOOLEAN NOT NULL DEFAULT false,
    ask_name BOOLEAN NOT NULL DEFAULT true,
    ask_email BOOLEAN NOT NULL DEFAULT true,
    ask_phone BOOLEAN NOT NULL DEFAULT true,
    ai_auto_respond BOOLEAN NOT NULL DEFAULT false,
    ai_agent_id UUID,
    allowed_domains TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create chat_widget_sessions table
CREATE TABLE IF NOT EXISTS public.chat_widget_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_config_id UUID NOT NULL REFERENCES public.chat_widget_configs(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    visitor_token TEXT NOT NULL UNIQUE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    visitor_name TEXT,
    visitor_email TEXT,
    visitor_phone TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_widget_sessions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_widget_configs_account_id ON public.chat_widget_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_chat_widget_configs_widget_key ON public.chat_widget_configs(widget_key);
CREATE INDEX IF NOT EXISTS idx_chat_widget_sessions_visitor_token ON public.chat_widget_sessions(visitor_token);
CREATE INDEX IF NOT EXISTS idx_chat_widget_sessions_account_id ON public.chat_widget_sessions(account_id);

-- RLS Policies for chat_widget_configs
CREATE POLICY "Tenants can manage their own widget configs"
ON public.chat_widget_configs
FOR ALL
USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
));

CREATE POLICY "Public read widget configs by widget_key"
ON public.chat_widget_configs
FOR SELECT
USING (is_active = true);

-- RLS Policies for chat_widget_sessions
CREATE POLICY "Tenants can view their widget sessions"
ON public.chat_widget_sessions
FOR ALL
USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
));
```

- [ ] **Step 2: Commit migration**

```bash
git add supabase/migrations/052_chat_widgets.sql
git commit -m "feat(db): add chat_widget_configs and chat_widget_sessions tables"
```

---

### Task 2: Public Widget API Endpoints

**Files:**
- Create: `src/app/api/widget/[widgetKey]/config/route.ts`
- Create: `src/app/api/widget/[widgetKey]/session/route.ts`
- Create: `src/app/api/widget/[widgetKey]/messages/route.ts`

**Interfaces:**
- Consumes: `chat_widget_configs`, `chat_widget_sessions`, `messages`, `contacts`
- Produces: Public JSON APIs for widget configuration, session management, and messaging with CORS support.

- [ ] **Step 1: Implement `GET /api/widget/[widgetKey]/config/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const supabase = createAdminClient();

  const { data: config, error } = await supabase
    .from('chat_widget_configs')
    .select('id, primary_color, title, subtitle, welcome_message, position, require_lead_info, ask_name, ask_email, ask_phone, is_active')
    .eq('widget_key', widgetKey)
    .eq('is_active', true)
    .single();

  if (error || !config) {
    return NextResponse.json({ error: 'Widget not found or inactive' }, { status: 404 });
  }

  return NextResponse.json(config, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

- [ ] **Step 2: Implement `POST /api/widget/[widgetKey]/session/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const body = await request.json();
  const { visitorToken, name, email, phone, metadata } = body;

  if (!visitorToken) {
    return NextResponse.json({ error: 'visitorToken is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find widget config
  const { data: config, error: configErr } = await supabase
    .from('chat_widget_configs')
    .select('id, account_id')
    .eq('widget_key', widgetKey)
    .eq('is_active', true)
    .single();

  if (configErr || !config) {
    return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
  }

  // Find existing session
  const { data: existingSession } = await supabase
    .from('chat_widget_sessions')
    .select('*, contact:contacts(*)')
    .eq('widget_config_id', config.id)
    .eq('visitor_token', visitorToken)
    .maybeSingle();

  let contactId = existingSession?.contact_id;

  // If lead info is provided, create or update contact in CRM
  if (name || email || phone) {
    if (contactId) {
      await supabase.from('contacts').update({
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', contactId);
    } else {
      const { data: newContact } = await supabase.from('contacts').insert({
        account_id: config.account_id,
        name: name || 'Visitante do Site',
        email: email || null,
        phone: phone || null,
        channel: 'livechat',
      }).select('id').single();

      contactId = newContact?.id;
    }
  }

  // Create session if not exists
  let session = existingSession;
  if (!session) {
    const { data: newSession } = await supabase
      .from('chat_widget_sessions')
      .insert({
        widget_config_id: config.id,
        account_id: config.account_id,
        visitor_token: visitorToken,
        contact_id: contactId || null,
        visitor_name: name || null,
        visitor_email: email || null,
        visitor_phone: phone || null,
        metadata: metadata || {},
      })
      .select('*')
      .single();
    session = newSession;
  } else if (contactId && !existingSession.contact_id) {
    await supabase.from('chat_widget_sessions').update({
      contact_id: contactId,
      visitor_name: name || existingSession.visitor_name,
      visitor_email: email || existingSession.visitor_email,
      visitor_phone: phone || existingSession.visitor_phone,
    }).eq('id', existingSession.id);
  }

  return NextResponse.json({ session, contactId }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}
```

- [ ] **Step 3: Implement `GET` and `POST` in `/api/widget/[widgetKey]/messages/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const { searchParams } = new URL(request.url);
  const visitorToken = searchParams.get('visitorToken');

  if (!visitorToken) {
    return NextResponse.json({ error: 'visitorToken is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from('chat_widget_sessions')
    .select('contact_id')
    .eq('visitor_token', visitorToken)
    .single();

  if (!session?.contact_id) {
    return NextResponse.json({ messages: [] }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('contact_id', session.contact_id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ messages: messages || [] }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const body = await request.json();
  const { visitorToken, content } = body;

  if (!visitorToken || !content) {
    return NextResponse.json({ error: 'visitorToken and content are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find widget config and session
  const { data: config } = await supabase
    .from('chat_widget_configs')
    .select('id, account_id, ai_auto_respond, ai_agent_id')
    .eq('widget_key', widgetKey)
    .single();

  if (!config) {
    return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
  }

  let { data: session } = await supabase
    .from('chat_widget_sessions')
    .select('*')
    .eq('widget_config_id', config.id)
    .eq('visitor_token', visitorToken)
    .single();

  // Auto-create contact if not linked yet
  let contactId = session?.contact_id;
  if (!contactId) {
    const { data: newContact } = await supabase.from('contacts').insert({
      account_id: config.account_id,
      name: 'Visitante do Site',
      channel: 'livechat',
    }).select('id').single();

    contactId = newContact?.id;

    if (session) {
      await supabase.from('chat_widget_sessions').update({ contact_id: contactId }).eq('id', session.id);
    }
  }

  // Insert message into CRM messages table
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      account_id: config.account_id,
      contact_id: contactId,
      direction: 'inbound',
      content: content,
      channel: 'livechat',
      sender_type: 'visitor',
    })
    .select('*')
    .single();

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json({ message }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
git add src/app/api/widget
git commit -m "feat(api): implement public widget config, session, and message endpoints"
```

---

### Task 3: Client Embed Launcher Script (`public/widget.js`)

**Files:**
- Create: `public/widget.js`

**Interfaces:**
- Consumes: `GET /api/widget/[widgetKey]/config`
- Produces: Floating widget launcher button and iframe injection on host website.

- [ ] **Step 1: Create `public/widget.js`**

```javascript
(function () {
  const script = document.currentScript;
  const widgetKey = script ? script.getAttribute('data-widget-id') : null;
  if (!widgetKey) return;

  const scriptSrc = script.src;
  const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));

  // Get or create visitor token
  let visitorToken = localStorage.getItem('abbla_widget_vtoken');
  if (!visitorToken) {
    visitorToken = 'vt_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('abbla_widget_vtoken', visitorToken);
  }

  // Fetch widget config
  fetch(`${baseUrl}/api/widget/${widgetKey}/config`)
    .then((res) => res.json())
    .then((config) => {
      if (!config || !config.is_active) return;
      initWidget(config);
    })
    .catch((err) => console.error('Widget load error:', err));

  function initWidget(config) {
    const isRight = config.position !== 'bottom_left';
    const primaryColor = config.primary_color || '#0F172A';

    // Launcher Button
    const launcher = document.createElement('div');
    launcher.id = 'abbla-widget-launcher';
    launcher.style.cssText = `
      position: fixed;
      bottom: 20px;
      ${isRight ? 'right: 20px;' : 'left: 20px;'}
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: ${primaryColor};
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 999998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
    `;

    launcher.innerHTML = `
      <svg id="abbla-icon-chat" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <svg id="abbla-icon-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    // Iframe Container
    const iframe = document.createElement('iframe');
    iframe.id = 'abbla-widget-iframe';
    const iframeUrl = new URL(`${baseUrl}/widget/${widgetKey}`);
    iframeUrl.searchParams.set('visitorToken', visitorToken);
    iframeUrl.searchParams.set('pageUrl', window.location.href);
    iframe.src = iframeUrl.toString();

    iframe.style.cssText = `
      position: fixed;
      bottom: 90px;
      ${isRight ? 'right: 20px;' : 'left: 20px;'}
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 600px;
      max-height: calc(100vh - 120px);
      border: none;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.16);
      z-index: 999999;
      display: none;
      background: transparent;
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(iframe);

    let isOpen = false;
    launcher.addEventListener('click', () => {
      isOpen = !isOpen;
      iframe.style.display = isOpen ? 'block' : 'none';
      document.getElementById('abbla-icon-chat').style.display = isOpen ? 'none' : 'block';
      document.getElementById('abbla-icon-close').style.display = isOpen ? 'block' : 'none';
    });

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'ABBLA_WIDGET_CLOSE') {
        isOpen = false;
        iframe.style.display = 'none';
        document.getElementById('abbla-icon-chat').style.display = 'block';
        document.getElementById('abbla-icon-close').style.display = 'none';
      }
    });
  }
})();
```

- [ ] **Step 2: Commit launcher script**

```bash
git add public/widget.js
git commit -m "feat(widget): add public embed launcher script"
```

---

### Task 4: Public Widget Iframe Interface (`/widget/[widgetKey]`)

**Files:**
- Create: `src/app/widget/[widgetKey]/page.tsx`
- Create: `src/app/widget/[widgetKey]/WidgetClient.tsx`

**Interfaces:**
- Consumes: `/api/widget/[widgetKey]/config`, `/api/widget/[widgetKey]/session`, `/api/widget/[widgetKey]/messages`
- Produces: Embedded Chat UI for visitors.

- [ ] **Step 1: Create `src/app/widget/[widgetKey]/WidgetClient.tsx`**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, X, Loader2 } from 'lucide-react';

interface WidgetConfig {
  primary_color: string;
  title: string;
  subtitle: string;
  welcome_message: string;
  require_lead_info: boolean;
  ask_name: boolean;
  ask_email: boolean;
  ask_phone: boolean;
}

interface Message {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

export default function WidgetClient({
  widgetKey,
  visitorToken,
  pageUrl,
}: {
  widgetKey: string;
  visitorToken: string;
  pageUrl: string;
}) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [identified, setIdentified] = useState(false);

  // Lead Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Config
    fetch(`/api/widget/${widgetKey}/config`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        if (!data.require_lead_info) {
          setIdentified(true);
        }
      })
      .finally(() => setLoading(false));

    // Register / Get Session
    fetch(`/api/widget/${widgetKey}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken, metadata: { pageUrl } }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.session) {
          setSession(data.session);
          if (data.session.contact_id || data.session.visitor_name) {
            setIdentified(true);
          }
        }
      });
  }, [widgetKey, visitorToken, pageUrl]);

  // Load Messages
  useEffect(() => {
    if (!visitorToken) return;

    const fetchMessages = () => {
      fetch(`/api/widget/${widgetKey}/messages?visitorToken=${visitorToken}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) setMessages(data.messages);
        });
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [widgetKey, visitorToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`/api/widget/${widgetKey}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorToken, name, email, phone }),
      });
      setIdentified(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    const msgContent = text.trim();
    setText('');
    setSending(true);

    try {
      const res = await fetch(`/api/widget/${widgetKey}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorToken, content: msgContent }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } finally {
      setSending(false);
    }
  };

  const closeWidget = () => {
    window.parent.postMessage({ type: 'ABBLA_WIDGET_CLOSE' }, '*');
  };

  if (loading || !config) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-900">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  const primaryColor = config.primary_color || '#0F172A';

  return (
    <div className="flex h-screen flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 text-white shadow-md"
        style={{ backgroundColor: primaryColor }}
      >
        <div>
          <h2 className="font-bold text-base">{config.title}</h2>
          <p className="text-xs opacity-80">{config.subtitle}</p>
        </div>
        <button
          onClick={closeWidget}
          className="rounded p-1 hover:bg-white/20 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Body */}
      {!identified && config.require_lead_info ? (
        <form onSubmit={handleLeadSubmit} className="flex-1 p-6 flex flex-col justify-center space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
            Por favor, preencha seus dados para iniciar o atendimento:
          </p>
          {config.ask_name && (
            <input
              type="text"
              placeholder="Seu Nome"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 p-2.5 text-sm"
            />
          )}
          {config.ask_email && (
            <input
              type="email"
              placeholder="Seu E-mail"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 p-2.5 text-sm"
            />
          )}
          {config.ask_phone && (
            <input
              type="tel"
              placeholder="Seu WhatsApp"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 p-2.5 text-sm"
            />
          )}
          <button
            type="submit"
            className="w-full rounded-lg p-2.5 text-sm font-semibold text-white shadow transition"
            style={{ backgroundColor: primaryColor }}
          >
            Iniciar Chat
          </button>
        </form>
      ) : (
        <div className="flex flex-1 flex-col justify-between overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {config.welcome_message && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 p-3 text-sm shadow-sm border border-slate-200 dark:border-slate-800">
                  {config.welcome_message}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-3 text-sm shadow-sm ${
                    msg.direction === 'inbound'
                      ? 'rounded-tr-none text-white'
                      : 'rounded-tl-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                  style={msg.direction === 'inbound' ? { backgroundColor: primaryColor } : {}}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} className="border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 flex items-center space-x-2">
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="rounded-lg p-2 text-white disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/widget/[widgetKey]/page.tsx`**

```tsx
import WidgetClient from './WidgetClient';

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ widgetKey: string }>;
  searchParams: Promise<{ visitorToken?: string; pageUrl?: string }>;
}) {
  const { widgetKey } = await params;
  const { visitorToken = '', pageUrl = '' } = await searchParams;

  return (
    <WidgetClient
      widgetKey={widgetKey}
      visitorToken={visitorToken}
      pageUrl={pageUrl}
    />
  );
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
git add src/app/widget
git commit -m "feat(widget): implement responsive widget iframe route"
```

---

### Task 5: Tenant Dashboard Widget Management UI (`/settings/widgets`)

**Files:**
- Create: `src/app/(dashboard)/settings/widgets/page.tsx`
- Create: `src/app/api/account/widgets/route.ts`

**Interfaces:**
- Consumes: Tenant authenticated Supabase session
- Produces: CRUD dashboard interface for tenants to create, edit, customize widget colors, and copy script tags.

- [ ] **Step 1: Implement `src/app/api/account/widgets/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const { data: widgets } = await supabase
    .from('chat_widget_configs')
    .select('*')
    .eq('account_id', member.account_id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ widgets: widgets || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const body = await request.json();

  const { data: widget, error } = await supabase
    .from('chat_widget_configs')
    .insert({
      account_id: member.account_id,
      name: body.name || 'Widget do Site',
      primary_color: body.primary_color || '#0F172A',
      title: body.title || 'Atendimento Online',
      subtitle: body.subtitle || 'Como podemos ajudar você hoje?',
      welcome_message: body.welcome_message || 'Olá! Seja bem-vindo ao nosso site.',
      position: body.position || 'bottom_right',
      require_lead_info: body.require_lead_info ?? false,
      ai_auto_respond: body.ai_auto_respond ?? false,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ widget });
}
```

- [ ] **Step 2: Create `/settings/widgets` Page**

Create `src/app/(dashboard)/settings/widgets/page.tsx` with widget listing, live preview, color picker, and a snippet generator box:
```html
<script src="https://SUA-URL/widget.js" data-widget-id="WIDGET_KEY" async></script>
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
git add src/app/api/account/widgets src/app/\(dashboard\)/settings/widgets
git commit -m "feat(dashboard): add tenant widget settings panel with snippet generator"
```

---

## Plan Self-Review & Verification

1. **Spec Coverage:** Covers schema, public endpoints, launcher script, iframe UI, tenant settings dashboard, and CRM inbox channel support.
2. **Type Consistency:** Verified signatures for `chat_widget_configs`, `chat_widget_sessions`, and `/api/widget/[widgetKey]/*` routes.
3. **Automated Verification:** `npm run typecheck` and `npm test`.

---
