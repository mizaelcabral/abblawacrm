"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface KBSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}

interface KBSearchPanelProps {
  onInsert?: (content: string) => void;
  open: boolean;
  onClose: () => void;
}

export function KBSearchPanel({ onInsert, open, onClose }: KBSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KBSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge-base/search?q=${encodeURIComponent(q)}&limit=6`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setExpandedId(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <BookOpen className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-xs font-semibold text-foreground">
          Base de Conhecimento
        </span>
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted px-2 py-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar artigos..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none"
          />
          {loading && (
            <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Results */}
      <div className="max-h-72 overflow-y-auto p-2">
        {results.length === 0 && query.trim() && !loading && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhum artigo encontrado para &ldquo;{query}&rdquo;
          </p>
        )}
        {results.length === 0 && !query.trim() && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Digite para pesquisar na base de conhecimento
          </p>
        )}
        <div className="space-y-1">
          {results.map((result) => (
            <div
              key={result.id}
              className="rounded-lg border border-border bg-muted/40 p-2.5 transition-colors hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                      {result.category}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {Math.round(result.similarity * 100)}% relevante
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-foreground">
                    {result.title}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] text-muted-foreground leading-relaxed",
                      expandedId === result.id ? "" : "line-clamp-2"
                    )}
                  >
                    {result.content}
                  </p>
                  {result.content.length > 120 && (
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === result.id ? null : result.id)
                      }
                      className="mt-0.5 text-[10px] text-primary hover:underline"
                    >
                      {expandedId === result.id ? "Ver menos" : "Ver mais"}
                    </button>
                  )}
                </div>
                {onInsert && (
                  <button
                    onClick={() => {
                      onInsert(result.content);
                      onClose();
                    }}
                    className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    Inserir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border px-3 py-1.5">
        <a
          href="/knowledge-base"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Gerenciar Base de Conhecimento
        </a>
      </div>
    </div>
  );
}
