"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  BookOpen,
  Sparkles,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KBList } from "@/components/knowledge-base/kb-list";
import { KBEditor, type KBArticle } from "@/components/knowledge-base/kb-editor";
import { cn } from "@/lib/utils";

const KB_CATEGORIES = [
  "Todos",
  "FAQ",
  "Produto / Serviço",
  "Preços e Planos",
  "Processo Interno",
  "Política da Empresa",
  "Scripts de Venda",
  "Suporte Técnico",
];

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KBArticle | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all");

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge-base");
      if (res.ok) {
        const data = await res.json();
        setArticles(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleEdit = (article: KBArticle) => {
    setEditingArticle(article);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setEditingArticle(null);
    setEditorOpen(true);
  };

  const handleSaved = (saved: KBArticle) => {
    setArticles((prev) => {
      const exists = prev.find((a) => a.id === saved.id);
      if (exists) return prev.map((a) => (a.id === saved.id ? saved : a));
      return [saved, ...prev];
    });
  };

  const handleDeleted = (id: string) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
  };

  const handleToggled = (id: string, isActive: boolean) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_active: isActive } : a))
    );
  };

  // Filter articles
  const filtered = articles.filter((a) => {
    const matchesSearch =
      !searchQuery ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      activeCategory === "Todos" || a.category === activeCategory;
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "active" && a.is_active) ||
      (activeTab === "inactive" && !a.is_active);
    return matchesSearch && matchesCategory && matchesTab;
  });

  const activeCount = articles.filter((a) => a.is_active).length;
  const inactiveCount = articles.filter((a) => !a.is_active).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">
              Base de Conhecimento
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os artigos que alimentam a IA Autopiloto com o conhecimento da sua empresa
          </p>
        </div>
        <Button
          onClick={handleNew}
          className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Artigo
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Total de Artigos</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{articles.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            <span className="text-emerald-400">●</span> Ativos (visíveis pela IA)
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            <Sparkles className="inline h-3 w-3 text-primary" /> IA Autopiloto
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {activeCount > 0
              ? `Consultando ${activeCount} artigo${activeCount !== 1 ? "s" : ""}`
              : "Nenhum artigo ativo"}
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="rounded-xl border border-border bg-card p-4">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar artigos por título, conteúdo ou tags..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="mt-3 flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(["all", "active", "inactive"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "all" && `Todos (${articles.length})`}
              {tab === "active" && `Ativos (${activeCount})`}
              {tab === "inactive" && `Inativos (${inactiveCount})`}
            </button>
          ))}
        </div>

        {/* Category chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {KB_CATEGORIES.map((cat) => {
            const count =
              cat === "Todos"
                ? articles.length
                : articles.filter((a) => a.category === cat).length;
            if (cat !== "Todos" && count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  activeCategory === cat
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:border-primary/20 hover:text-foreground"
                )}
              >
                {cat}
                {count > 0 && (
                  <span className="ml-1 opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <KBList
        articles={filtered}
        loading={loading}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
        onToggled={handleToggled}
      />

      {/* Editor Modal */}
      <KBEditor
        article={editingArticle}
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingArticle(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}
