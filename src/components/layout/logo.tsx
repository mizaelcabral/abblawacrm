"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  collapsed?: boolean;
  badgeText?: string;
  className?: string;
}

export function Logo({ collapsed = false, badgeText = "hub", className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 select-none", className)}>
      {/* SVG Speech Bubble Logo Icon */}
      <svg
        viewBox="0 0 100 100"
        className="h-8 w-8 shrink-0 fill-primary text-primary"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M50,8 C26.8,8 8,26.8 8,50 C8,59.5 11.2,68.2 16.6,75.2 L7,93 L26.3,86.8 C33.1,90.1 40.8,92 50,92 C73.2,92 92,73.2 92,50 C92,26.8 73.2,8 50,8 Z M32,52 L68,52 C68,61.94 59.94,70 50,70 C40.06,70 32,61.94 32,52 Z"
        />
      </svg>

      {/* Brand Text and Badge - Hidden when collapsed */}
      <div
        className={cn(
          "flex items-center gap-1.5 transition-all duration-300 overflow-hidden",
          collapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
        )}
      >
        <span className="font-bold text-lg tracking-tight text-black dark:text-white">
          Abbla
        </span>
        {badgeText && (
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black dark:text-white">
            {badgeText}
          </span>
        )}
      </div>
    </div>
  );
}
