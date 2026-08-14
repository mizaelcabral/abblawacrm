"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import {
  Menu,
  Search,
  Maximize2,
  Minimize2,
  ShoppingCart,
  User,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  Globe,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModeToggle } from '@/components/layout/mode-toggle'
import { NotificationMenu } from '@/components/layout/notification-menu'
import { GlobalSearchModal } from '@/components/layout/global-search-modal'
import { Logo } from './logo'

interface CubaHeaderProps {
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
}

const routeBreadcrumbs: Record<string, { category: string; page: string }> = {
  '/dashboard': { category: 'Dashboard', page: 'Visão Geral' },
  '/inbox': { category: 'CRM', page: 'Mensagens' },
  '/contacts': { category: 'CRM', page: 'Contatos & Leads' },
  '/pipelines': { category: 'Vendas', page: 'Funil & Pipelines' },
  '/broadcasts': { category: 'Marketing', page: 'Transmissões' },
  '/automations': { category: 'Automação', page: 'Fluxos & Bots' },
  '/ecommerce': { category: 'E-commerce', page: 'Loja & Pedidos' },
  '/settings': { category: 'Sistema', page: 'Configurações' },
}

export function CubaHeader({ onToggleSidebar }: CubaHeaderProps) {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const breadcrumb = routeBreadcrumbs[pathname] || {
    category: 'Dashboard',
    page: 'Painel',
  }

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'A'

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err)
      })
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
        setIsFullscreen(false)
      }
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 sm:gap-4 border-b border-border/60 bg-background/95 backdrop-blur-md px-4 lg:px-6 shadow-xs transition-all duration-200">
      {/* Left side: Toggle button, Logo & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Alternar menu lateral"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus:outline-none shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/dashboard" className="flex items-center lg:hidden shrink-0">
          <Logo />
        </Link>

        {/* Cuba Style Breadcrumbs */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          <span className="hover:text-foreground transition-colors">
            {breadcrumb.category}
          </span>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          <span className="font-semibold text-foreground">
            {breadcrumb.page}
          </span>
        </div>
      </div>

      {/* Center: Search Bar (Fluid flex max-w so it never overlaps breadcrumbs or controls on 13"-15" laptops) */}
      <div className="hidden md:flex items-center flex-1 max-w-xs lg:max-w-sm xl:max-w-md mx-2 lg:mx-4 min-w-0">
        <div
          onClick={() => setIsSearchOpen(true)}
          className="relative w-full cursor-pointer group"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors pointer-events-none" />
          <input
            type="text"
            readOnly
            placeholder="Buscar contatos, conversas, produtos..."
            className="w-full h-9 pl-9 pr-12 rounded-full border border-border/80 bg-muted/40 text-xs text-foreground placeholder:text-muted-foreground cursor-pointer hover:bg-muted/70 hover:border-primary/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-80 group-hover:border-primary/40">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Mobile / Tablet Search Trigger Button */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex md:hidden h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Pesquisar"
          aria-label="Abrir pesquisa"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Language Indicator */}
        <div className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer" title="Idioma: Português (Brasil)">
          <Globe className="w-3.5 h-3.5 text-indigo-500" />
          <span>PT-BR</span>
        </div>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>

        {/* E-commerce Store / Cart Quick Link */}
        <Link
          href="/ecommerce"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Ver Loja & E-commerce"
        >
          <ShoppingCart className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
        </Link>

        {/* Notification Bell */}
        <NotificationMenu />

        {/* Light / Dark Mode Toggle */}
        <ModeToggle />

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2.5 rounded-full p-1 pl-1 pr-2 hover:bg-muted/60 transition-all focus:outline-none"
            aria-label="Abrir menu da conta"
          >
            <Avatar className="h-8 w-8 ring-2 ring-primary/20">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? 'Avatar'}
                />
              ) : null}
              <AvatarFallback className="cuba-gradient-primary text-white text-xs font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left lg:block">
              <p className="text-xs font-semibold text-foreground leading-tight">
                {profile?.full_name ?? 'Admin ABBLA'}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Administrador
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="min-w-56 rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-xl border border-border/80"
          >
            <div className="px-3 py-2 bg-muted/40 rounded-xl mb-1">
              <p className="truncate text-xs font-bold text-foreground">
                {profile?.full_name ?? 'Usuário ABBLA'}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {profile?.email ?? 'admin@abbla.ai'}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border/60" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="flex items-center gap-2 text-xs font-medium"
                />
              }
            >
              <User className="size-4 text-indigo-500" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=whatsapp"
                  className="flex items-center gap-2 text-xs font-medium"
                />
              }
            >
              <SettingsIcon className="size-4 text-indigo-500" />
              Configurações do CRM
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/60" />
            <DropdownMenuItem
              onClick={signOut}
              className="flex items-center gap-2 text-xs font-medium text-rose-500 focus:bg-rose-500/10 focus:text-rose-600"
            >
              <LogOut className="size-4" />
              Sair da Conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </header>
  )
}
