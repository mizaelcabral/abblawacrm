-- 052_chat_widgets.sql
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

ALTER TABLE public.chat_widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_widget_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_widget_configs_account_id ON public.chat_widget_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_chat_widget_configs_widget_key ON public.chat_widget_configs(widget_key);
CREATE INDEX IF NOT EXISTS idx_chat_widget_sessions_visitor_token ON public.chat_widget_sessions(visitor_token);
CREATE INDEX IF NOT EXISTS idx_chat_widget_sessions_account_id ON public.chat_widget_sessions(account_id);

CREATE POLICY "Tenants can manage their own widget configs"
ON public.chat_widget_configs
FOR ALL
USING (is_account_member(account_id));

CREATE POLICY "Public read widget configs by widget_key"
ON public.chat_widget_configs
FOR SELECT
USING (is_active = true);

CREATE POLICY "Tenants can view their widget sessions"
ON public.chat_widget_sessions
FOR ALL
USING (is_account_member(account_id));
