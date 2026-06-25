"use client";

import { useState } from "react";
import {
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  BookOpen,
  ExternalLink,
  Loader2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { KBArticle } from "./kb-editor";

const CATEGORY_COLORS: Record<string, string> = {
  "FAQ": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Produto / Serviço": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "Preços e Planos": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Processo Interno": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Política da Empresa": "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Scripts de Venda": "bg-primary/10 text-primary border-primary/20",
  "Suporte Técnico": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

function getCategoryStyle(category: string): string {
  return CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border";
}

interface KBListProps {
  articles: KBArticle[];
  loading: boolean;
  onEdit: (article: KBArticle) => void;
  onDeleted: (id: string) => void;
  onToggled: (id: string, isActive: boolean) => void;
}

export function KBList({ articles, loading, onEdit, onDeleted, onToggled }: KBListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDelete = async (article: KBArticle) => {
    if (!confirm(`Deletar "${article.title}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(article.id);
    try {
      const res = await fetch(`/api/knowledge-base/${article.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar");
      toast.success("Artigo removido.");
      onDeleted(article.id);
    } catch {
      toast.error("Erro ao deletar artigo.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (article: KBArticle) => {
    setTogglingId(article.id);
    try {
      const res = await fetch(`/api/knowledge-base/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !article.is_active }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      toast.success(!article.is_active ? "Artigo ativado." : "Artigo desativado.");
      onToggled(article.id, !article.is_active);
    } catch {
      toast.error("Erro ao atualizar status.");
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando artigos...</p>
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">Nenhum artigo encontrado</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Crie o primeiro artigo para alimentar a IA com conhecimento da sua empresa
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <div
          key={article.id}
          className={cn(
            "rounded-xl border bg-card p-4 transition-all duration-200",
            article.is_active
              ? "border-border hover:border-primary/30"
              : "border-border/50 opacity-60"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Category + badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    getCategoryStyle(article.category)
                  )}
                >
                  {article.category}
                </span>
                {!article.is_active && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    Inativo
                  </span>
                )}
                {article.view_count > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Eye className="h-2.5 w-2.5" />
                    Usado {article.view_count}x pela IA
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="mt-1.5 text-sm font-semibold text-foreground">{article.title}</h3>

              {/* Content preview */}
              <p
                className={cn(
                  "mt-1 text-xs text-muted-foreground leading-relaxed",
                  expandedId === article.id ? "" : "line-clamp-2"
                )}
              >
                {article.content}
              </p>
              {article.content.length > 160 && (
                <button
                  onClick={() => setExpandedId(expandedId === article.id ? null : article.id)}
                  className="mt-0.5 text-[10px] text-primary hover:underline"
                >
                  {expandedId === article.id ? "Ver menos" : "Ver mais"}
                </button>
              )}

              {/* Tags */}
              {article.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta */}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                <span>
                  Criado em{" "}
                  {format(new Date(article.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                {article.updated_at !== article.created_at && (
                  <span>
                    Atualizado em{" "}
                    {format(new Date(article.updated_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                )}
                {article.source_url && (
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    Fonte
                  </a>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                title={article.is_active ? "Desativar" : "Ativar"}
                onClick={() => handleToggle(article)}
                disabled={togglingId === article.id}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                {togglingId === article.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : article.is_active ? (
                  <ToggleRight className="h-4 w-4 text-primary" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
              </button>
              <button
                title="Editar"
                onClick={() => onEdit(article)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                title="Deletar"
                onClick={() => handleDelete(article)}
                disabled={deletingId === article.id}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50"
              >
                {deletingId === article.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
