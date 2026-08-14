"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  collapsed?: boolean;
  badgeText?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ collapsed = false, badgeText, className, size = "md" }: LogoProps) {
  const iconSizes = {
    sm: "h-8 w-8",
    md: "h-9 w-9",
    lg: "h-11 w-11",
  };

  const svgSizes = {
    sm: "h-4.5 w-4.5",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className={cn("flex items-center gap-2 select-none shrink-0", className)}>
      {/* Abbla SVG Icon Mark without text */}
      <div
        className={cn(
          "flex items-center justify-center rounded-xl cuba-gradient-primary text-white shadow-xs shrink-0 transition-transform duration-200 hover:scale-105",
          iconSizes[size]
        )}
        title="Abbla Hub"
      >
        <svg
          viewBox="0 0 100 100"
          fill="currentColor"
          className={svgSizes[size]}
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M50,8 C26.8,8 8,26.8 8,50 C8,59.5 11.2,68.2 16.6,75.2 L7,93 L26.3,86.8 C33.1,90.1 40.8,92 50,92 C73.2,92 92,73.2 92,50 C92,26.8 73.2,8 50,8 Z M32,52 L68,52 C68,61.94 59.94,70 50,70 C40.06,70 32,61.94 32,52 Z"
          />
        </svg>
      </div>

      {badgeText && !collapsed && (
        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
          {badgeText}
        </span>
      )}
    </div>
  );
}
