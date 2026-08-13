"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkMetadata {
  url: string;
  domain: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
}

interface LinkPreviewProps {
  url: string;
  isAgent?: boolean;
}

// ponytail: simple link preview card with fetch caching in React state
export function LinkPreview({ url, isAgent }: LinkPreviewProps) {
  const [meta, setMeta] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setFailed(false);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Preview fetch failed");
        return res.json();
      })
      .then((data: LinkMetadata) => {
        if (isMounted) {
          if (data.title || data.image || data.description) {
            setMeta(data);
          } else {
            setFailed(true);
          }
        }
      })
      .catch(() => {
        if (isMounted) setFailed(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div
        className={cn(
          "mt-2 flex flex-col gap-1.5 rounded-lg border p-2.5 text-xs animate-pulse min-w-[220px] max-w-full",
          isAgent
            ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
            : "border-border bg-muted/60 text-foreground"
        )}
      >
        <div className="h-3 w-2/3 rounded bg-current opacity-30" />
        <div className="h-2.5 w-full rounded bg-current opacity-20" />
      </div>
    );
  }

  if (failed || !meta) return null;

  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "mt-2 flex flex-col overflow-hidden rounded-xl border text-xs transition-all hover:opacity-95 max-w-full group/preview",
        isAgent
          ? "border-primary-foreground/25 bg-black/20 text-primary-foreground shadow-sm"
          : "border-border bg-card text-card-foreground shadow-sm"
      )}
    >
      {meta.image && (
        <div className="relative max-h-40 w-full overflow-hidden bg-black/10">
          <img
            src={meta.image}
            alt={meta.title || "Link preview"}
            className="h-36 w-full object-cover transition-transform duration-300 group-hover/preview:scale-105"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1 p-2.5 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] opacity-75 font-medium">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate">{meta.domain}</span>
          <ExternalLink className="h-2.5 w-2.5 ml-auto shrink-0 opacity-60" />
        </div>

        {meta.title && (
          <h4 className="font-semibold leading-snug line-clamp-2 text-xs">
            {meta.title}
          </h4>
        )}

        {meta.description && (
          <p className="line-clamp-2 text-[11px] opacity-85 leading-relaxed">
            {meta.description}
          </p>
        )}
      </div>
    </a>
  );
}
