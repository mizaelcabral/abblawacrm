"use client";

import { useState, useEffect, useRef } from "react";
import { X, Save, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const KB_CATEGORIES = [
  "FAQ",
  "Produto / Serviço",
  "Preços e Planos",
  "Processo Interno",
  "Política da Empresa",
  "Scripts de Venda",
  "Suporte Técnico",
];

export interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_active: boolean;
  source: string;
  source_url: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface KBEditorProps {
  article?: KBArticle | null;
  open: boolean;
  onClose: () => void;
  onSaved: (article: KBArticle) => void;
}

export function KBEditor({ article, open, onClose, onSaved }: KBEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("FAQ");
  const [customCategory, setCustomCategory] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCategoryDrop, setShowCategoryDrop] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && article) {
      setTitle(article.title);
      setContent(article.content);
      const isPreset = KB_CATEGORIES.includes(article.category);
      setCategory(isPreset ? article.category : "_custom");
      setCustomCategory(isPreset ? "" : article.category);
      setTags(article.tags ?? []);
      setSourceUrl(article.source_url ?? "");
    } else if (open && !article) {
      setTitle("");
      setContent("");
      setCategory("FAQ");
      setCustomCategory("");
      setTags([]);
      setSourceUrl("");
    }
    setTagInput("");
    setSaving(false);
  }, [open, article]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowCategoryDrop(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Título e conteúdo são obrigatórios.");
      return;
    }
    const finalCategory =
      category === "_custom" ? customCategory.trim() || "FAQ" : category;

    setSaving(true);
    try {
      const url = article
        ? `/api/knowledge-base/${article.id}`
        : "/api/knowledge-base";
      const method = article ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category: finalCategory,
          tags,
          source_url: sourceUrl || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");

      toast.success(
        article
          ? "Artigo atualizado e embedding regenerado!"
          : "Artigo criado com embedding gerado pela IA!"
      );
      onSaved(data.item);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar artigo");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {article ? "Editar Artigo" : "Novo Artigo"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {article
                ? "Salvar irá regenerar automaticamente o embedding da IA"
                : "O embedding vetorial será gerado automaticamente ao salvar"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Título *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Como funciona o prazo de entrega?"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
            />
          </div>

          {/* Category + Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Categoria
              </label>
              <div className="relative" ref={dropRef}>
                <button
                  type="button"
                  onClick={() => setShowCategoryDrop((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none hover:border-primary/50"
                >
                  <span>
                    {category === "_custom"
                      ? customCategory || "Categoria personalizada"
                      : category}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                {showCategoryDrop && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-border bg-popover py-1 shadow-lg">
                    {KB_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setCategory(cat);
                          setShowCategoryDrop(false);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted",
                          category === cat && "bg-primary/10 text-primary"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => {
                        setCategory("_custom");
                        setShowCategoryDrop(false);
                      }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted",
                        category === "_custom" && "bg-primary/10 text-primary"
                      )}
                    >
                      + Categoria personalizada
                    </button>
                  </div>
                )}
              </div>
              {category === "_custom" && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Nome da categoria"
                  className="mt-2 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Tags
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Ex: frete, entrega"
                  className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button size="sm" variant="outline" onClick={addTag} className="h-auto px-2 py-2">
                  +
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Conteúdo *
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escreva o conteúdo do artigo. Seja claro e objetivo — a IA usará este texto para responder clientes automaticamente."
              rows={8}
              className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 leading-relaxed"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {content.length} caracteres
            </p>
          </div>

          {/* Source URL */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              URL de Origem{" "}
              <span className="font-normal text-muted-foreground/60">(opcional)</span>
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://seusite.com/artigo"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted-foreground">
            💡 Embedding vetorial gerado automaticamente pelo Gemini ao salvar
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !title.trim() || !content.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Gerando embedding...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-3 w-3" />
                  {article ? "Salvar Alterações" : "Criar Artigo"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
