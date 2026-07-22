import {
  Coins,
  FileText,
  LayoutGrid,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
  CreditCard,
  Key,
  Share2,
  Send,
  Video,
  FileCheck,
  History,
  PenTool,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'consent',
  'appearance',
  'plans',
  'whatsapp',
  'meta',
  'telegram',
  'tiktok',
  'widgets',
  'zapsign',
  'templates',
  'fields',
  'deals',
  'members',
  'mcp',
  'audit',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
  adminOnly?: boolean;
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Visão geral', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Seu perfil', icon: User, group: 'account' },
  security: { id: 'security', label: 'Segurança e login', icon: Shield, group: 'account' },
  consent: { id: 'consent', label: 'Consentimentos (LGPD)', icon: FileCheck, group: 'account' },
  appearance: { id: 'appearance', label: 'Aparência', icon: Palette, group: 'account' },
  plans: { id: 'plans', label: 'Planos & Faturamento', icon: CreditCard, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  meta: { id: 'meta', label: 'Facebook & Instagram', icon: Share2, group: 'workspace' },
  telegram: { id: 'telegram', label: 'Telegram', icon: Send, group: 'workspace' },
  tiktok: { id: 'tiktok', label: 'TikTok', icon: Video, group: 'workspace' },
  widgets: { id: 'widgets', label: 'Widget do Site', icon: MessageSquare, group: 'workspace' },
  zapsign: { id: 'zapsign', label: 'ZapSign (Assinaturas)', icon: PenTool, group: 'workspace' },
  templates: { id: 'templates', label: 'Modelos', icon: FileText, group: 'workspace' },
  fields: { id: 'fields', label: 'Campos e tags', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', label: 'Negócios e moedas', icon: Coins, group: 'workspace' },
  members: { id: 'members', label: 'Membros da equipe', icon: UsersRound, group: 'workspace' },
  mcp: { id: 'mcp', label: 'Integração MCP (IA)', icon: Key, group: 'workspace' },
  audit: { id: 'audit', label: 'Registro de auditoria', icon: History, group: 'workspace', adminOnly: true },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Conta', group: 'account' },
  { label: 'Espaço de trabalho', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
