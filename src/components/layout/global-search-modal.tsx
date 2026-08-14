"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Users,
  MessageSquare,
  Package,
  Kanban,
  CheckSquare,
  LayoutDashboard,
  Radio,
  Bot,
  ShoppingCart,
  FileSignature,
  Calendar,
  BookOpen,
  Settings,
  X,
  Loader2,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

interface NavResult {
  title: string;
  category: string;
  href: string;
  icon: any;
  keywords?: string[];
}

const NAV_ITEMS: NavResult[] = [
  {
    title: "Visão Geral (Dashboard)",
    category: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    keywords: ["dashboard", "painel", "métricas", "relatório", "inicio"],
  },
  {
    title: "Mensagens (Inbox)",
    category: "CRM",
    href: "/inbox",
    icon: MessageSquare,
    keywords: ["chat", "inbox", "whatsapp", "mensagens", "conversas", "atendimento"],
  },
  {
    title: "Contatos & Leads",
    category: "CRM",
    href: "/contacts",
    icon: Users,
    keywords: ["contatos", "leads", "clientes", "agenda", "telefones"],
  },
  {
    title: "Funil de Vendas (Pipelines)",
    category: "Vendas",
    href: "/pipelines",
    icon: Kanban,
    keywords: ["funil", "pipeline", "vendas", "deals", "oportunidades", "kanban"],
  },
  {
    title: "Transmissões & Campanhas",
    category: "Marketing",
    href: "/broadcasts",
    icon: Radio,
    keywords: ["transmissão", "broadcast", "disparo", "massivo", "campanha"],
  },
  {
    title: "Automações & Bots",
    category: "Automação",
    href: "/automations",
    icon: Bot,
    keywords: ["automação", "bot", "fluxo", "chatbots", "trigger"],
  },
  {
    title: "E-commerce & Loja",
    category: "E-commerce",
    href: "/ecommerce",
    icon: ShoppingCart,
    keywords: ["loja", "ecommerce", "produtos", "vendas"],
  },
  {
    title: "Catálogo de Produtos",
    category: "E-commerce",
    href: "/ecommerce/products",
    icon: Package,
    keywords: ["produtos", "catalogo", "estoque", "preços"],
  },
  {
    title: "Pedidos de Venda",
    category: "E-commerce",
    href: "/ecommerce/orders",
    icon: ShoppingCart,
    keywords: ["pedidos", "compras", "faturamento", "orders"],
  },
  {
    title: "Tarefas & Lembretes",
    category: "Produtividade",
    href: "/tasks",
    icon: CheckSquare,
    keywords: ["tarefas", "tasks", "lembretes", "pendencias", "todo"],
  },
  {
    title: "Assinaturas & Documentos",
    category: "Documentos",
    href: "/signatures",
    icon: FileSignature,
    keywords: ["assinatura", "contrato", "documento", "pdf"],
  },
  {
    title: "Agendamentos & Reuniões",
    category: "Agenda",
    href: "/appointments",
    icon: Calendar,
    keywords: ["agendamento", "reunião", "compromissos", "calendario"],
  },
  {
    title: "Base de Conhecimento",
    category: "Suporte",
    href: "/knowledge-base",
    icon: BookOpen,
    keywords: ["conhecimento", "faq", "ajuda", "artigos", "tutoriais"],
  },
  {
    title: "Configurações do CRM",
    category: "Sistema",
    href: "/settings",
    icon: Settings,
    keywords: ["configurações", "settings", "whatsapp", "conta", "equipe", "perfil"],
  },
];

export function GlobalSearchModal({
  isOpen,
  onClose,
  initialQuery = "",
}: GlobalSearchModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  // Live query from Supabase
  useEffect(() => {
    if (!query.trim() || !isOpen) {
      setContacts([]);
      setProducts([]);
      setDeals([]);
      setTasks([]);
      setLoading(false);
      return;
    }

    const searchTerm = `%${query.trim()}%`;
    let isCancelled = false;

    async function fetchSearch() {
      setLoading(true);
      try {
        const [resContacts, resProducts, resDeals, resTasks] = await Promise.all([
          supabase
            .from("contacts")
            .select("id, name, phone, email")
            .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm}`)
            .limit(5),

          supabase
            .from("products")
            .select("id, name, price, slug")
            .or(`name.ilike.${searchTerm},slug.ilike.${searchTerm}`)
            .limit(5),

          supabase
            .from("deals")
            .select("id, title, value")
            .or(`title.ilike.${searchTerm}`)
            .limit(5),

          supabase
            .from("tasks")
            .select("id, title, status")
            .or(`title.ilike.${searchTerm}`)
            .limit(5),
        ]);

        if (isCancelled) return;

        setContacts(resContacts.data || []);
        setProducts(resProducts.data || []);
        setDeals(resDeals.data || []);
        setTasks(resTasks.data || []);
      } catch (err) {
        console.error("Global search error:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    const timer = setTimeout(fetchSearch, 250);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen, supabase]);

  // Filtered Navigation pages
  const filteredNav = NAV_ITEMS.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  });

  const handleSelect = (href: string) => {
    onClose();
    router.push(href);
  };

  const hasAnyResults =
    filteredNav.length > 0 ||
    contacts.length > 0 ||
    products.length > 0 ||
    deals.length > 0 ||
    tasks.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden border border-border/80 shadow-2xl rounded-2xl bg-background/95 backdrop-blur-md">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60 bg-muted/20">
          <Search className="w-5 h-5 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contatos, conversas, produtos, páginas ou tarefas..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none focus:outline-none border-none focus:ring-0"
          />
          {loading ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          )}
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-4">
          {/* 1. Contatos / Leads */}
          {contacts.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                Contatos & Leads
              </div>
              <div className="space-y-0.5 mt-1">
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(`/inbox?c=${c.id}`)}
                    className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-accent/70 hover:text-foreground transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {c.name?.charAt(0)?.toUpperCase() || "C"}
                      </div>
                      <div className="truncate">
                        <p className="font-medium text-foreground truncate">
                          {c.name || "Contato sem nome"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.phone || c.email || "Sem dados de contato"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Produtos */}
          {products.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-emerald-500" />
                Produtos (E-commerce)
              </div>
              <div className="space-y-0.5 mt-1">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(`/ecommerce/products`)}
                    className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-accent/70 hover:text-foreground transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="font-medium text-foreground truncate">
                          {p.name}
                        </p>
                        {p.price && (
                          <p className="text-[10px] text-muted-foreground">
                            R$ {Number(p.price).toFixed(2).replace(".", ",")}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Oportunidades / Vendas */}
          {deals.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Kanban className="w-3.5 h-3.5 text-amber-500" />
                Oportunidades no Funil
              </div>
              <div className="space-y-0.5 mt-1">
                {deals.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleSelect(`/pipelines`)}
                    className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-accent/70 hover:text-foreground transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Kanban className="w-4 h-4" />
                      </div>
                      <p className="font-medium text-foreground truncate">
                        {d.title}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Tarefas */}
          {tasks.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-purple-500" />
                Tarefas
              </div>
              <div className="space-y-0.5 mt-1">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelect(`/tasks`)}
                    className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-accent/70 hover:text-foreground transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <p className="font-medium text-foreground truncate">
                        {t.title}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Páginas & Atalhos */}
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-primary" />
                {query.trim() ? "Navegação Rápida" : "Atalhos Principais"}
              </div>
              <div className="space-y-0.5 mt-1">
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => handleSelect(item.href)}
                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-accent/70 hover:text-foreground transition-all group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground truncate">
                            {item.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.category}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasAnyResults && !loading && (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-medium">Nenhum resultado encontrado</p>
              <p className="text-[11px] opacity-75 mt-0.5">
                Tente buscar por outro nome de contato, produto ou página.
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-border/40 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>ABBLA CRM Global Search</span>
          <div className="flex items-center gap-3">
            <span>
              Use <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">⌘K</kbd> para abrir a qualquer momento
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
