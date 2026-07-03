"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, account, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const isTrialExpired =
    account &&
    !account.is_lifetime &&
    account.subscription_status === "trial" &&
    account.subscription_expires_at &&
    new Date(account.subscription_expires_at) < new Date();

  const isDelinquent =
    account &&
    !account.is_lifetime &&
    (account.subscription_status === "past_due" ||
      account.subscription_status === "unpaid" ||
      account.subscription_status === "canceled");

  const isBlocked = isTrialExpired || isDelinquent;

  useEffect(() => {
    if (!loading && !profileLoading) {
      if (!user) {
        router.push("/login");
        return;
      }

      if (isBlocked) {
        const currentTab = searchParams.get("tab");
        if (pathname !== "/settings" || currentTab !== "plans") {
          router.push("/settings?tab=plans");
        }
      }
    }
  }, [user, loading, profileLoading, isBlocked, pathname, searchParams, router]);

  if (loading || profileLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={<div className="w-64 bg-card border-r border-border shrink-0 hidden lg:block lg:w-60" />}>
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        </div>
      }>
        <DashboardShellInner>{children}</DashboardShellInner>
      </Suspense>
    </AuthProvider>
  );
}


