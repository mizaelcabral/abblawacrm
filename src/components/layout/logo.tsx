"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  collapsed?: boolean;
  badgeText?: string;
  className?: string;
}

export function Logo({ collapsed = false, badgeText, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 select-none", className)}>
      {/* Dark Mode Logo (White logo text for dark backgrounds) */}
      <img
        src="/images/abbla-logo-dark.png"
        alt="Abbla"
        className={cn(
          "h-10 sm:h-11 w-auto object-contain hidden dark:block transition-all duration-200",
          collapsed && "h-8 w-8 max-w-[32px] overflow-hidden object-left"
        )}
      />

      {/* White / Light Mode Logo (Dark logo text for white/light backgrounds) */}
      <img
        src="/images/abbla-logo-light.png"
        alt="Abbla"
        className={cn(
          "h-10 sm:h-11 w-auto object-contain block dark:hidden transition-all duration-200",
          collapsed && "h-8 w-8 max-w-[32px] overflow-hidden object-left"
        )}
      />

      {badgeText && !collapsed && (
        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
          {badgeText}
        </span>
      )}
    </div>
  );
}
