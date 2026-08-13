"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Calendar,
  ShoppingBag,
  CreditCard,
  Radio,
  Workflow,
  Zap,
  BookOpen,
  Settings,
  X,
  Sparkles,
  CheckSquare,
  Globe,
  Shield,
} from 'lucide-react'
import { Logo } from './logo'
import { useAuth } from '@/hooks/use-auth'

interface CubaSidebarProps {
  isCollapsed?: boolean
  isMobileOpen?: boolean
  onCloseMobile?: () => void
}

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  badge?: string
  badgeColor?: string
}

interface NavGroup {
  groupTitle: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    groupTitle: 'INÍCIO',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    groupTitle: 'CRM & ATENDIMENTO',
    items: [
      {
        title: 'WhatsApp Inbox',
        href: '/inbox',
        icon: MessageSquare,
        badge: 'Ao Vivo',
        badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      },
      {
        title: 'Contatos & Leads',
        href: '/contacts',
        icon: Users,
      },
      {
        title: 'Funil de Vendas',
        href: '/pipelines',
        icon: Kanban,
      },
      {
        title: 'Tarefas',
        href: '/tasks',
        icon: CheckSquare,
      },
      {
        title: 'Agendamentos',
        href: '/appointments',
        icon: Calendar,
      },
    ],
  },
  {
    groupTitle: 'E-COMMERCE & LOJA',
    items: [
      {
        title: 'Produtos & Vendas',
        href: '/ecommerce',
        icon: ShoppingBag,
        badge: 'Novo',
        badgeColor: 'cuba-badge-soft-primary',
      },
      {
        title: 'Assinaturas',
        href: '/signatures',
        icon: CreditCard,
      },
      {
        title: 'Widget do Site',
        href: '/settings/widgets',
        icon: Globe,
      },
    ],
  },
  {
    groupTitle: 'MARKETING & BOT',
    items: [
      {
        title: 'Transmissões',
        href: '/broadcasts',
        icon: Radio,
      },
      {
        title: 'Fluxos de Chat',
        href: '/flows',
        icon: Workflow,
        badge: 'Beta',
        badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      },
      {
        title: 'Automações AI',
        href: '/automations',
        icon: Zap,
      },
      {
        title: 'Base de Conhecimento',
        href: '/knowledge-base',
        icon: BookOpen,
      },
    ],
  },
  {
    groupTitle: 'CONFIGURAÇÕES',
    items: [
      {
        title: 'Configurações',
        href: '/settings',
        icon: Settings,
      },
    ],
  },
]

export function CubaSidebar({
  isCollapsed = false,
  isMobileOpen = false,
  onCloseMobile,
}: CubaSidebarProps) {
  const pathname = usePathname()
  const { profile } = useAuth()

  const displayGroups = profile?.role === 'super_admin'
    ? [
        ...navGroups,
        {
          groupTitle: 'ADMINISTRAÇÃO',
          items: [
            {
              title: 'Painel Super Admin',
              href: '/superadmin',
              icon: Shield,
            },
          ],
        },
      ]
    : navGroups

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out lg:static lg:z-auto ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        } ${
          isMobileOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Header Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/40">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 overflow-hidden"
          >
            <Logo />
          </Link>

          {/* Close button for mobile */}
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items Scroll Area */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 no-scrollbar">
          {displayGroups.map((group, idx) => (
            <div key={idx} className="space-y-2">
              {!isCollapsed && (
                <h2 className="px-3 text-xs font-bold tracking-wider text-muted-foreground/80 uppercase">
                  {group.groupTitle}
                </h2>
              )}

              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  const Icon = item.icon

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      title={isCollapsed ? item.title : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${
                        isActive
                          ? 'cuba-gradient-primary text-white shadow-md shadow-indigo-500/20 font-bold'
                          : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                      }`}
                    >
                      <Icon
                        className={`h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-white' : 'text-muted-foreground group-hover:text-primary'
                        }`}
                      />

                      {!isCollapsed && (
                        <span className="truncate flex-1 text-sm font-semibold leading-snug">{item.title}</span>
                      )}

                      {!isCollapsed && (item as any).badge && (
                        <span
                          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : (item as any).badgeColor || 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {(item as any).badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Card: Pro Upgrade / Help Badge (Cuba Style) */}
        {!isCollapsed && (
          <div className="p-3.5 m-3 rounded-2xl cuba-gradient-welcome text-white shadow-lg">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-xs">
                <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              </div>
              <span className="text-sm font-bold">ABBLA AI CRM</span>
            </div>
            <p className="text-xs text-white/90 leading-tight mb-3">
              WhatsApp API & Automação de E-commerce ativa.
            </p>
            <a
              href="/settings?tab=whatsapp"
              className="block w-full text-center py-2 px-3 rounded-xl bg-white text-indigo-700 text-xs font-bold hover:bg-opacity-95 transition-all shadow-xs"
            >
              Gerenciar Instância
            </a>
          </div>
        )}
      </aside>
    </>
  )
}
