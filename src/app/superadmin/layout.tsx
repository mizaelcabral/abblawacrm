'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Shield, LayoutDashboard, Users, ArrowLeft, Loader2, Menu, X } from 'lucide-react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/layout/mode-toggle';

function SuperAdminLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, profileLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!profileLoading && (!profile || profile.role !== 'super_admin')) {
      router.push('/dashboard');
    }
  }, [profile, profileLoading, router]);

  if (profileLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Carregando painel...</p>
        </div>
      </div>
    );
  }

  // Double check role
  if (!profile || profile.role !== 'super_admin') {
    return null; // Let the redirect do its work
  }

  const menuItems = [
    { href: '/superadmin', label: 'Visão Geral', icon: LayoutDashboard },
    { href: '/superadmin/accounts', label: 'Contas (Tenants)', icon: Users },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card/60 backdrop-blur-md sticky top-0 h-screen">
        <div className="flex h-16 items-center justify-between px-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg tracking-tight text-foreground uppercase">Abbla Admin</span>
          </div>
          <ModeToggle />
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <Link href="/dashboard" className="w-full">
            <Button variant="outline" className="w-full gap-2 border-border text-muted-foreground hover:text-foreground hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao CRM
            </Button>
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex h-16 items-center justify-between px-6 border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-base tracking-tight text-foreground uppercase">Abbla Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} className="text-muted-foreground hover:text-foreground">
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-background/95 backdrop-blur-md flex flex-col pt-20 px-6">
            <nav className="space-y-3 flex-1">
              {menuItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-base font-semibold rounded-lg transition-all',
                      isActive
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="py-6 border-t border-border">
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full gap-2 border-border py-6 text-base text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                  Voltar ao CRM
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SuperAdminLayoutInner>{children}</SuperAdminLayoutInner>
    </AuthProvider>
  );
}
