'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Loader2, Lock } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { THEMES } from '@/lib/themes';
import { CURRENCIES } from '@/lib/currency';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { SECTION_META, type SettingsSection } from './settings-sections';
import { SettingsChip, StatusDot } from './settings-chip';
import { ROLE_META } from './role-meta';

interface OverviewCounts {
  members: number | null;
  pendingInvites: number | null;
  templates: number | null;
  templatesPending: number | null;
  tags: number | null;
  customFields: number | null;
  mcpKeys: number | null;
}

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
}

export function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { user, profile, accountId, accountRole, defaultCurrency, canManageMembers, account } =
    useAuth();
  const { mode, theme } = useTheme();

  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  // WhatsApp status is tracked separately: its health check decrypts the
  // token and pings Meta, which is far slower than the cheap count
  // queries. Gating it independently keeps a slow/flaky Meta round-trip
  // from blanking the rest of the landing.
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [metaStatus, setMetaStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [telegramStatus, setTelegramStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [tiktokStatus, setTiktokStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [tiktokLoading, setTiktokLoading] = useState(true);

  useEffect(() => {
    if (!user || !accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const userId = user.id;
    const acctId = accountId;

    // Cheap counts — resolve fast, render immediately.
    (async () => {
      setCountsLoading(true);
      const [membersRes, invitesRes, templatesTotal, templatesPending, tagsRes, fieldsRes, mcpKeysRes] =
        await Promise.allSettled([
          fetch('/api/account/members', { cache: 'no-store' }).then((r) => r.json()),
          canManageMembers
            ? fetch('/api/account/invitations', { cache: 'no-store' }).then((r) =>
                r.json(),
              )
            : Promise.resolve(null),
          supabase
            .from('message_templates')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase
            .from('message_templates')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'PENDING'),
          supabase
            .from('tags')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase.from('custom_fields').select('id', { count: 'exact', head: true }),
          supabase
            .from('mcp_api_keys')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', acctId),
        ]);

      if (cancelled) return;

      const members =
        membersRes.status === 'fulfilled' && Array.isArray(membersRes.value?.members)
          ? membersRes.value.members.length
          : null;
      const pendingInvites =
        invitesRes.status === 'fulfilled' &&
        invitesRes.value &&
        Array.isArray(invitesRes.value.invitations)
          ? invitesRes.value.invitations.length
          : null;

      setCounts({
        members,
        pendingInvites,
        templates:
          templatesTotal.status === 'fulfilled'
            ? templatesTotal.value.count ?? null
            : null,
        templatesPending:
          templatesPending.status === 'fulfilled'
            ? templatesPending.value.count ?? null
            : null,
        tags: tagsRes.status === 'fulfilled' ? tagsRes.value.count ?? null : null,
        customFields:
          fieldsRes.status === 'fulfilled' ? fieldsRes.value.count ?? null : null,
        mcpKeys:
          mcpKeysRes.status === 'fulfilled' ? mcpKeysRes.value.count ?? null : null,
      });
      setCountsLoading(false);
    })();

    // WhatsApp connection status — slower, independent.
    (async () => {
      setWhatsappLoading(true);
      const [row, health] = await Promise.allSettled([
        supabase
          .from('whatsapp_config')
          .select('phone_number_id')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/whatsapp/config', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setWhatsapp({
        configured: row.status === 'fulfilled' && !!row.value.data?.phone_number_id,
        connected: health.status === 'fulfilled' && !!health.value?.connected,
      });
      setWhatsappLoading(false);
    })();

    // Meta Page / Instagram connection status.
    (async () => {
      setMetaLoading(true);
      const [row, health] = await Promise.allSettled([
        supabase
          .from('meta_integration_config')
          .select('facebook_page_id')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/meta/config', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setMetaStatus({
        configured: row.status === 'fulfilled' && !!row.value.data?.facebook_page_id,
        connected: health.status === 'fulfilled' && !!health.value?.connected,
      });
      setMetaLoading(false);
    })();

    // Telegram connection status.
    (async () => {
      setTelegramLoading(true);
      const [row, health] = await Promise.allSettled([
        supabase
          .from('telegram_integration_config')
          .select('bot_token')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/telegram/config', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setTelegramStatus({
        configured: row.status === 'fulfilled' && !!row.value.data?.bot_token,
        connected: health.status === 'fulfilled' && !!health.value?.connected,
      });
      setTelegramLoading(false);
    })();

    // TikTok connection status.
    (async () => {
      setTiktokLoading(true);
      const [row, health] = await Promise.allSettled([
        supabase
          .from('tiktok_integration_config')
          .select('access_token')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/tiktok/config', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setTiktokStatus({
        configured: row.status === 'fulfilled' && !!row.value.data?.access_token,
        connected: health.status === 'fulfilled' && !!health.value?.connected,
      });
      setTiktokLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, accountId, canManageMembers]);

  const displayName = profile?.full_name || profile?.email || 'Sua conta';
  const initial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;

  const currencyLabel =
    CURRENCIES.find((c) => c.code === defaultCurrency)?.label ?? defaultCurrency;
  const themeName = THEMES.find((t) => t.id === theme)?.name ?? theme;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Per-tile loading + subtitle. `null` counts render as a graceful
  // fallback so a single failed query never blanks a tile.
  const tiles: {
    section: SettingsSection;
    loading: boolean;
    subtitle: ReactNode;
  }[] = [
    {
      section: 'whatsapp',
      loading: whatsappLoading,
      subtitle: !whatsapp?.configured ? (
        'Não configurado'
      ) : whatsapp.connected ? (
        <>
          <StatusDot tone="ok" /> Conectado
        </>
      ) : (
        <>
          <StatusDot tone="muted" /> Necessita reconexão
        </>
      ),
    },
    {
      section: 'meta',
      loading: metaLoading,
      subtitle: !metaStatus?.configured ? (
        'Não configurado'
      ) : metaStatus.connected ? (
        <>
          <StatusDot tone="ok" /> Conectado
        </>
      ) : (
        <>
          <StatusDot tone="muted" /> Necessita reconexão
        </>
      ),
    },
    {
      section: 'telegram',
      loading: telegramLoading,
      subtitle: !telegramStatus?.configured ? (
        'Não configurado'
      ) : telegramStatus.connected ? (
        <>
          <StatusDot tone="ok" /> Conectado
        </>
      ) : (
        <>
          <StatusDot tone="muted" /> Necessita reconexão
        </>
      ),
    },
    {
      section: 'tiktok',
      loading: tiktokLoading,
      subtitle: !tiktokStatus?.configured ? (
        'Não configurado'
      ) : tiktokStatus.connected ? (
        <>
          <StatusDot tone="ok" /> Conectado
        </>
      ) : (
        <>
          <StatusDot tone="muted" /> Necessita reconexão
        </>
      ),
    },
    {
      section: 'members',
      loading: countsLoading,
      subtitle:
        counts?.members == null
          ? 'Ver membros da equipe'
          : `${counts.members} ${counts.members === 1 ? 'membro' : 'membros'}${
              counts.pendingInvites
                ? ` · ${counts.pendingInvites} ${counts.pendingInvites === 1 ? 'convite pendente' : 'convites pendentes'}`
                : ''
            }`,
    },
    {
      section: 'templates',
      loading: countsLoading,
      subtitle:
        counts?.templates == null
          ? 'Gerenciar modelos de mensagens'
          : `${counts.templates} ${counts.templates === 1 ? 'modelo' : 'modelos'}${
              counts.templatesPending
                ? ` · ${counts.templatesPending} ${counts.templatesPending === 1 ? 'pendente de revisão' : 'pendentes de revisão'}`
                : ''
            }`,
    },
    {
      section: 'deals',
      loading: false,
      subtitle: `${defaultCurrency} — ${currencyLabel}`,
    },
    {
      section: 'fields',
      loading: countsLoading,
      subtitle:
        counts?.tags == null && counts?.customFields == null
          ? 'Tags e campos personalizados'
          : `${counts?.tags ?? 0} ${counts?.tags === 1 ? 'tag' : 'tags'} · ${
              counts?.customFields ?? 0
            } ${counts?.customFields === 1 ? 'campo personalizado' : 'campos personalizados'}`,
    },
    {
      section: 'appearance',
      loading: false,
      subtitle: `Modo ${mode === 'light' ? 'Claro' : 'Escuro'} · Tema ${themeName}`,
    },
    {
      section: 'plans',
      loading: false,
      subtitle: account?.subscription_plan
        ? `${account.subscription_plan.charAt(0).toUpperCase()}${account.subscription_plan.slice(1)}`
        : 'Starter',
    },
    {
      section: 'mcp',
      loading: countsLoading,
      subtitle:
        account?.subscription_plan !== 'scale' ? (
          <span className="flex items-center gap-1 text-amber-500 font-medium">
            <Lock className="size-3 shrink-0" /> Exclusivo no plano Scale
          </span>
        ) : counts?.mcpKeys == null ? (
          'Chaves de integração de IA'
        ) : (
          `${counts.mcpKeys} ${counts.mcpKeys === 1 ? 'chave ativa' : 'chaves ativas'}`
        ),
    },
  ];

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Identity */}
      <Card className="flex-row items-center gap-4 px-5 py-5">
        <Avatar size="lg" className="size-14">
          {profile?.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-xl text-primary">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">
            {displayName}
          </div>
          {profile?.email ? (
            <div className="truncate text-sm text-muted-foreground">
              {profile.email}
            </div>
          ) : null}
        </div>
        {roleMeta && RoleIcon ? (
          <SettingsChip variant={roleMeta.variant}>
            <RoleIcon />
            {roleMeta.label}
          </SettingsChip>
        ) : null}
      </Card>

      {/* Status tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ section, loading, subtitle }) => {
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onSelect(section)}
              className={cn(
                'group flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left transition-colors',
                'hover:border-primary-soft-2 hover:bg-card-2',
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {meta.label}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {loading ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> Carregando…
                    </>
                  ) : (
                    subtitle
                  )}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
