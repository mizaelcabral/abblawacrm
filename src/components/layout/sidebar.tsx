"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import {
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
  CheckSquare,
  CreditCard,
  ChevronLeft,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";
import { Logo } from "./logo";

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; label: string; className: string }
> = {
  owner: {
    icon: Crown,
    label: "Proprietário",
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    label: "Administrador",
    // Primary-tinted: significant but not as scarce as owner.
    className:
      "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    label: "Agente",
    // Neutral slate: the operational default.
    className:
      "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    label: "Visualizador",
    // Muted slate: read-only role; visually quieter than agent.
    className:
      "border-border bg-card text-muted-foreground",
  },
};
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Mensagens", icon: MessageSquare },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/pipelines", label: "Funis", icon: GitBranch },
  { href: "/broadcasts", label: "Transmissões", icon: Radio },
  { href: "/automations", label: "Automações", icon: Zap },
  { href: "/flows", label: "Fluxos", icon: Workflow, beta: true },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/settings?tab=plans", label: "Planos", icon: CreditCard },
];

const bottomNavItems = [
  { href: "/settings", label: "Configurações", icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("abbla_sidebar_collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
    setMounted(true);
  }, []);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("abbla_sidebar_collapsed", String(next));
  };

  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible — reset all the mobile framing with width transition.
          "lg:static lg:z-0 lg:translate-x-0 lg:transition-all lg:duration-300 lg:ease-in-out",
          mounted && isCollapsed ? "lg:w-16" : "lg:w-60",
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className={cn("flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 transition-all duration-300", mounted && isCollapsed && "px-2 justify-center")}>
          <Link href="/dashboard" className="flex items-center gap-1.5 shrink-0">
            <Logo collapsed={mounted && isCollapsed} />
          </Link>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-300 cursor-pointer shrink-0",
              mounted && isCollapsed && "h-6 w-6"
            )}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300", mounted && isCollapsed && "rotate-180")} />
          </button>
          {!isCollapsed && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Main navigation */}
        <nav className={cn("flex-1 overflow-y-auto py-4 transition-all duration-300", mounted && isCollapsed ? "px-0" : "px-3")}>
          <ul className={cn("flex flex-col gap-1 transition-all duration-300", mounted && isCollapsed && "items-center")}>
            {navItems.map((item) => {
              const [itemPath, itemQuery] = item.href.split("?");
              
              let isActive = false;
              if (itemQuery) {
                const searchParamsObj = new URLSearchParams(itemQuery);
                const tab = searchParamsObj.get("tab");
                isActive = pathname === itemPath && searchParams.get("tab") === tab;
              } else {
                if (item.href === "/settings") {
                  isActive = pathname === "/settings" && searchParams.get("tab") !== "plans";
                } else {
                  isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                }
              }

              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              return (
                <li key={item.href} className={cn("w-full transition-all duration-300", mounted && isCollapsed && "flex justify-center")}>
                  <Link
                    href={item.href}
                    className={cn(
                      // Taller on mobile so fingers can hit the row reliably (≥44px).
                      "flex items-center rounded-lg text-sm font-medium transition-all duration-300 lg:py-2",
                      mounted && isCollapsed
                        ? "justify-center px-0 w-10 mx-auto py-2.5"
                        : "gap-3 px-3 py-2.5",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <div className="relative">
                      <item.icon className="h-4 w-4" />
                      {showUnreadDot && mounted && isCollapsed && (
                        <span
                          aria-hidden="true"
                          className="absolute -top-1 -right-1 flex h-2 w-2"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "flex-1 transition-all duration-300 overflow-hidden whitespace-nowrap",
                        mounted && isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.beta && !(mounted && isCollapsed) && (
                      <span
                        aria-label="Beta feature"
                        className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300"
                      >
                        Beta
                      </span>
                    )}
                    {showUnreadDot && !(mounted && isCollapsed) && (
                      <span
                        aria-label={`${totalUnread} ${totalUnread === 1 ? "conversa não lida" : "conversas não lidas"}`}
                        className="relative flex h-2 w-2"
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className={cn("my-4 border-t border-border transition-all duration-300", mounted && isCollapsed ? "mx-4 w-8" : "mx-0 w-auto")} />

          <ul className={cn("flex flex-col gap-1 transition-all duration-300", mounted && isCollapsed && "items-center")}>
            {profile?.role === 'super_admin' && (
              <li className={cn("w-full transition-all duration-300", mounted && isCollapsed && "flex justify-center")}>
                <Link
                  href="/superadmin"
                  className={cn(
                    "flex items-center rounded-lg text-sm font-medium transition-all duration-300 lg:py-2",
                    mounted && isCollapsed
                      ? "justify-center px-0 w-10 mx-auto py-2.5"
                      : "gap-3 px-3 py-2.5",
                    pathname.startsWith("/superadmin")
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-amber-500 hover:bg-muted"
                  )}
                >
                  <Shield className="h-4 w-4" />
                  <span
                    className={cn(
                      "flex-1 transition-all duration-300 overflow-hidden whitespace-nowrap",
                      mounted && isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
                    )}
                  >
                    Painel Super Admin
                  </span>
                </Link>
              </li>
            )}
            {bottomNavItems.map((item) => {
              const [itemPath, itemQuery] = item.href.split("?");
              
              let isActive = false;
              if (itemQuery) {
                const searchParamsObj = new URLSearchParams(itemQuery);
                const tab = searchParamsObj.get("tab");
                isActive = pathname === itemPath && searchParams.get("tab") === tab;
              } else {
                if (item.href === "/settings") {
                  isActive = pathname === "/settings" && searchParams.get("tab") !== "plans";
                } else {
                  isActive = pathname.startsWith(item.href);
                }
              }
              return (
                <li key={item.href} className={cn("w-full transition-all duration-300", mounted && isCollapsed && "flex justify-center")}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-all duration-300 lg:py-2",
                      mounted && isCollapsed
                        ? "justify-center px-0 w-10 mx-auto py-2.5"
                        : "gap-3 px-3 py-2.5",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span
                      className={cn(
                        "flex-1 transition-all duration-300 overflow-hidden whitespace-nowrap",
                        mounted && isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className={cn("shrink-0 border-t border-border transition-all duration-300", mounted && isCollapsed ? "p-0 py-3 flex justify-center w-full" : "p-3")}>
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name && !(mounted && isCollapsed) ? (
            <div className="mb-2 flex items-center gap-2 px-3 text-xs text-muted-foreground">
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole ? (
                // Always render the chip — owners used to be
                // invisible here, which made them indistinguishable
                // from admins at a glance. Now everyone sees their
                // role (with a colour cue) regardless of tier.
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {meta.label}
                    </span>
                  );
                })()
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex items-center text-left transition-all duration-300 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60 rounded-lg py-2",
                mounted && isCollapsed
                  ? "justify-center w-10 mx-auto px-0"
                  : "w-full gap-3 px-3"
              )}
            >
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? "Avatar"}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "min-w-0 flex-1 transition-all duration-300 overflow-hidden",
                  mounted && isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
                )}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.full_name ?? "Usuário"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
