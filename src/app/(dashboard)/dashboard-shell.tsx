"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { CubaSidebar } from "@/components/layout/cuba-sidebar";
import { CubaHeader } from "@/components/layout/cuba-header";
import { CubaAnnouncementBanner } from "@/components/layout/cuba-announcement-banner";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, account, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    // On desktop, toggle collapse; on mobile, toggle drawer
    if (window.innerWidth < 1024) {
      setMobileSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  }, []);

  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

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
          <p className="text-sm text-muted-foreground">Carregando ABBLA CRM...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Cuba Top Announcement Bar */}
      <CubaAnnouncementBanner />

      <div className="flex flex-1 overflow-hidden">
        {/* Cuba Sidebar */}
        <Suspense fallback={<div className="w-64 bg-sidebar border-r border-border shrink-0 hidden lg:block" />}>
          <CubaSidebar
            isCollapsed={sidebarCollapsed}
            isMobileOpen={mobileSidebarOpen}
            onCloseMobile={closeMobileSidebar}
          />
        </Suspense>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Cuba Header */}
          <CubaHeader
            onToggleSidebar={toggleSidebar}
            isSidebarOpen={!sidebarCollapsed}
          />

          {/* Main Dashboard Canvas */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-muted/20">
            <div className="mx-auto max-w-7xl space-y-6">
              {children}
            </div>
          </main>
        </div>
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
            <p className="text-sm text-muted-foreground">Carregando ABBLA CRM...</p>
          </div>
        </div>
      }>
        <DashboardShellInner>{children}</DashboardShellInner>
      </Suspense>
    </AuthProvider>
  );
}



