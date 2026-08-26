"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  CheckSquare,
  Calendar,
  User,
  Trash2,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle,
  FileText,
  UserCheck,
  Search,
  ChevronRight,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

// Dnd Kit Imports
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

interface TaskWithRelations {
  id: string;
  account_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "review_required" | "completed";
  due_at: string | null;
  assigned_agent_id: string | null;
  is_ai_task?: boolean;
  ai_agent_type?: "billing" | "followup" | "onboarding" | "general" | null;
  execution_mode?: "approval" | "autonomous" | null;
  billing_config?: {
    product_id?: string;
    amount?: number;
    tone?: string;
    send_pix?: boolean;
    notes?: string;
  } | null;
  ai_draft?: string | null;
  executed_at?: string | null;
  created_at: string;
  updated_at: string;
  assigned_agent?: {
    full_name: string;
  } | null;
  contact?: {
    name: string | null;
    phone: string;
  } | null;
}

export default function TasksPage() {
  const { accountId, user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [members, setMembers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string | null; phone: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");

  // Modal States
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formDueAt, setFormDueAt] = useState("");
  const [formStatus, setFormStatus] = useState<"pending" | "in_progress" | "review_required" | "completed">("pending");

  // AI & Billing Agent Form Fields
  const [formIsAiTask, setFormIsAiTask] = useState(false);
  const [formAiAgentType, setFormAiAgentType] = useState<"billing" | "followup" | "onboarding" | "general">("billing");
  const [formExecutionMode, setFormExecutionMode] = useState<"approval" | "autonomous">("approval");
  const [formBillingProductId, setFormBillingProductId] = useState("");
  const [formBillingAmount, setFormBillingAmount] = useState("");
  const [formBillingTone, setFormBillingTone] = useState("Amigável e profissional");

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const supabase = createClient();

    // Query tasks, profiles, contacts, and store products in parallel
    const [tasksRes, membersRes, contactsRes, productsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*, assigned_agent:profiles(full_name), contact:contacts(name, phone)")
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("account_id", accountId)
        .order("full_name"),
      supabase
        .from("contacts")
        .select("id, name, phone")
        .eq("account_id", accountId)
        .order("name"),
      supabase
        .from("products")
        .select("id, name, price")
        .eq("account_id", accountId)
        .order("name"),
    ]);

    if (tasksRes.data) setTasks(tasksRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    if (contactsRes.data) setContacts(contactsRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open edit modal
  const handleOpenEdit = (task: TaskWithRelations) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || "");
    setFormContactId(task.contact_id || "");
    setFormAgentId(task.assigned_agent_id || "");
    setFormDueAt(task.due_at ? format(new Date(task.due_at), "yyyy-MM-dd") : "");
    setFormStatus(task.status);
    setFormIsAiTask(!!task.is_ai_task);
    setFormAiAgentType(task.ai_agent_type || "general");
    setFormExecutionMode(task.execution_mode || "approval");
    setFormBillingProductId(task.billing_config?.product_id || "");
    setFormBillingAmount(task.billing_config?.amount ? String(task.billing_config.amount) : "");
    setFormBillingTone(task.billing_config?.tone || "Amigável e profissional");
  };

  // Close modals & reset forms
  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormContactId("");
    setFormAgentId("");
    setFormDueAt("");
    setFormStatus("pending");
    setFormIsAiTask(false);
    setFormAiAgentType("billing");
    setFormExecutionMode("approval");
    setFormBillingProductId("");
    setFormBillingAmount("");
    setFormBillingTone("Amigável e profissional");
    setEditingTask(null);
    setIsNewTaskOpen(false);
  };

  // Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !formTitle.trim()) return;

    const supabase = createClient();

    // Find conversation_id for contact if selected
    let convId: string | null = null;
    if (formContactId) {
      const { data: convData } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", formContactId)
        .limit(1)
        .maybeSingle();
      if (convData) convId = convData.id;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        account_id: accountId,
        contact_id: formContactId || null,
        conversation_id: convId,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        status: formStatus,
        due_at: formDueAt ? new Date(`${formDueAt}T12:00:00`).toISOString() : null,
        assigned_agent_id: formAgentId || null,
        is_ai_task: formIsAiTask,
        ai_agent_type: formIsAiTask ? formAiAgentType : 'general',
        execution_mode: formExecutionMode,
        billing_config: formIsAiTask && formAiAgentType === 'billing' ? {
          product_id: formBillingProductId || null,
          amount: formBillingAmount ? parseFloat(formBillingAmount) : null,
          tone: formBillingTone,
          send_pix: true,
        } : {},
      })
      .select("*, assigned_agent:profiles(full_name), contact:contacts(name, phone)")
      .single();

    if (error) {
      console.error("[Create Task Error]:", error);
      toast.error(`Erro ao criar tarefa: ${error.message || 'Verifique as permissões ou conexões.'}`);
      return;
    }

    if (data) {
      setTasks((prev) => [data, ...prev]);
      resetForm();
      toast.success(data.is_ai_task ? 'Tarefa do Agente IA criada!' : 'Tarefa criada com sucesso!');

      // Trigger AI task worker execution immediately if this is an AI task
      if (data.is_ai_task) {
        fetch("/api/tasks/worker", { method: "POST" })
          .then((res) => res.json())
          .then((workerRes) => {
            console.log("[AI Task Worker Instant Execution]:", workerRes);
          })
          .catch((err) => console.error("[AI Task Worker Instant Error]:", err));
      }
    }
  };

  // Approve AI task draft with 1-click
  const handleApproveTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? data.task || { ...t, status: "completed" } : t))
        );
        if (data.messageSent) {
          toast.success("Tarefa Aprovada com Sucesso!", {
            description: "Mensagem enviada no WhatsApp do cliente e tarefa movida para Concluído.",
          });
        } else {
          toast.warning("Tarefa movida para Concluído", {
            description: data.sendError || "Não foi possível disparar no WhatsApp. Verifique as configurações.",
          });
        }
      } else {
        toast.error(`Erro ao aprovar tarefa: ${data.error || 'Falha ao processar'}`);
      }
    } catch (err) {
      console.error("Failed to approve task:", err);
      toast.error("Falha ao comunicar com o servidor.");
    }
  };

  // Update Task (Full Edit)
  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !formTitle.trim()) return;

    const supabase = createClient();

    // Find conversation_id for contact if changed
    let convId: string | null = null;
    if (formContactId) {
      const { data: convData } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", formContactId)
        .limit(1)
        .maybeSingle();
      if (convData) convId = convData.id;
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        contact_id: formContactId || null,
        conversation_id: convId,
        assigned_agent_id: formAgentId || null,
        due_at: formDueAt ? new Date(`${formDueAt}T12:00:00`).toISOString() : null,
        status: formStatus,
        is_ai_task: formIsAiTask,
        ai_agent_type: formIsAiTask ? formAiAgentType : 'general',
        execution_mode: formExecutionMode,
        billing_config: formIsAiTask && formAiAgentType === 'billing' ? {
          product_id: formBillingProductId || null,
          amount: formBillingAmount ? parseFloat(formBillingAmount) : null,
          tone: formBillingTone,
          send_pix: true,
        } : {},
      })
      .eq("id", editingTask.id)
      .select("*, assigned_agent:profiles(full_name), contact:contacts(name, phone)")
      .single();

    if (error) {
      console.error("[Update Task Error]:", error);
      toast.error(`Erro ao atualizar tarefa: ${error.message}`);
      return;
    }

    if (data) {
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? data : t)));
      resetForm();
      toast.success("Tarefa atualizada com sucesso!");
    }
  };

  // Quick update status
  const handleUpdateStatus = async (taskId: string, newStatus: "pending" | "in_progress" | "review_required" | "completed") => {
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Deseja realmente excluir esta tarefa?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (!error) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  };

  // Filter Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(query);
        const matchDesc = task.description?.toLowerCase().includes(query);
        const matchContact = task.contact?.name?.toLowerCase().includes(query) || task.contact?.phone?.includes(query);
        if (!matchTitle && !matchDesc && !matchContact) return false;
      }

      // 2. Assignee Filter
      if (assigneeFilter === "mine") {
        if (task.assigned_agent_id !== user?.id) return false;
      } else if (assigneeFilter === "unassigned") {
        if (task.assigned_agent_id !== null) return false;
      } else if (assigneeFilter !== "all" && task.assigned_agent_id !== assigneeFilter) {
        return false;
      }

      // 3. Due Date Filter
      if (dueDateFilter === "overdue") {
        if (task.status === "completed" || !task.due_at || new Date(task.due_at) >= new Date()) return false;
      } else if (dueDateFilter === "today") {
        if (!task.due_at) return false;
        const today = new Date().toDateString();
        const taskDate = new Date(task.due_at).toDateString();
        if (taskDate !== today) return false;
      } else if (dueDateFilter === "week") {
        if (!task.due_at) return false;
        const diffTime = new Date(task.due_at).getTime() - new Date().getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays > 7) return false;
      }

      return true;
    });
  }, [tasks, searchQuery, assigneeFilter, dueDateFilter, user]);

  const activeTask = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTaskId(null);
    const { active, over } = event;
    if (!over) return;
    
    const taskId = String(active.id);
    const targetStatus = String(over.id) as "pending" | "in_progress" | "review_required" | "completed";

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    await handleUpdateStatus(taskId, targetStatus);
  };

  function handleDragCancel() {
    setActiveTaskId(null);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Tarefas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerenciamento e acompanhamento de tarefas e retornos com clientes.
          </p>
        </div>

        <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/95 text-primary-foreground gap-2 self-start sm:self-auto" />
            }
          >
            <Plus className="h-4 w-4" /> Nova Tarefa
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Criar Nova Tarefa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Título</label>
                <Input
                  placeholder="Ex: Enviar cobrança da mensalidade via WhatsApp"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Descrição (Opcional)</label>
                <Textarea
                  placeholder="Adicione detalhes sobre a tarefa..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {/* AI Agent Configuration Block */}
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="is_ai_task" className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 cursor-pointer">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    Atribuir a Agente de IA AGI
                  </label>
                  <input
                    id="is_ai_task"
                    type="checkbox"
                    checked={formIsAiTask}
                    onChange={(e) => setFormIsAiTask(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </div>

                {formIsAiTask && (
                  <div className="space-y-3 pt-2 border-t border-violet-500/20 text-xs">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-muted-foreground">Tipo de Agente IA</label>
                      <select
                        value={formAiAgentType}
                        onChange={(e) => setFormAiAgentType(e.target.value as any)}
                        className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-xs focus-visible:outline-none"
                      >
                        <option value="billing">💳 Agente de Cobrança WhatsApp (Pix / Lembrete)</option>
                        <option value="followup">🔄 Agente de Recompra / Follow-up</option>
                        <option value="onboarding">📋 Agente de Boas-Vindas / Documentos</option>
                        <option value="general">🤖 Agente Executor Geral</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-semibold text-muted-foreground">Modo de Execução</label>
                      <select
                        value={formExecutionMode}
                        onChange={(e) => setFormExecutionMode(e.target.value as any)}
                        className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-xs focus-visible:outline-none"
                      >
                        <option value="approval">👤 Rascunho / Aprovação Humana (1-Click Approve)</option>
                        <option value="autonomous">⚡ Modo Autônomo (Enviar Direto no WhatsApp)</option>
                      </select>
                    </div>

                    {formAiAgentType === "billing" && (
                      <div className="space-y-2 pt-2 border-t border-violet-500/20">
                        <span className="font-semibold text-violet-700 dark:text-violet-300 block text-[11px]">Configurações da Cobrança:</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Produto da Loja</label>
                            <select
                              value={formBillingProductId}
                              onChange={(e) => setFormBillingProductId(e.target.value)}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-[11px]"
                            >
                              <option value="">Nenhum produto (Valor livre)...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (R$ {p.price})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Valor do Débito (R$)</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Ex: 150.00"
                              value={formBillingAmount}
                              onChange={(e) => setFormBillingAmount(e.target.value)}
                              className="h-8 text-[11px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Tom de Voz</label>
                          <select
                            value={formBillingTone}
                            onChange={(e) => setFormBillingTone(e.target.value)}
                            className="w-full h-8 px-2 rounded border border-input bg-background text-[11px]"
                          >
                            <option value="Amigável e profissional">Amigável e profissional</option>
                            <option value="Formal e direto">Formal e direto</option>
                            <option value="Urgente / Lembrete de vencimento">Urgente / Lembrete de vencimento</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Prazo de Execução</label>
                  <Input
                    type="date"
                    value={formDueAt}
                    onChange={(e) => setFormDueAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="review_required">Revisão necessária</option>
                    <option value="completed">Concluído</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Cliente Associado</label>
                  <select
                    value={formContactId}
                    onChange={(e) => setFormContactId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none"
                  >
                    <option value="">Nenhum...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.phone}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Atendente Responsável</label>
                  <select
                    value={formAgentId}
                    onChange={(e) => setFormAgentId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none"
                  >
                    <option value="">Sem responsável...</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit">Criar Tarefa</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, descrição ou cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/50 focus:bg-background"
          />
        </div>

        <div className="flex flex-wrap gap-2 sm:items-center">
          {/* Assignee Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            >
              <option value="all">Todos Atendentes</option>
              <option value="mine">Minhas Tarefas</option>
              <option value="unassigned">Sem Responsável</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={dueDateFilter}
              onChange={(e) => setDueDateFilter(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            >
              <option value="all">Qualquer Prazo</option>
              <option value="overdue">Vencidas</option>
              <option value="today">Hoje</option>
              <option value="week">Próximos 7 dias</option>
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board View */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="h-32 bg-muted rounded-lg animate-pulse" />
              <div className="h-32 bg-muted rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="tasks-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:snap-none md:grid md:grid-cols-4 md:items-start">
            <TaskColumn
              status="pending"
              title="Pendente"
              colorClass="bg-amber-500"
              badgeColorClass="bg-amber-500/10 text-amber-500"
              tasks={filteredTasks.filter((t) => t.status === "pending")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
              onApproveTask={handleApproveTask}
            />

            <TaskColumn
              status="in_progress"
              title="Em andamento"
              colorClass="bg-primary"
              badgeColorClass="bg-primary/10 text-primary"
              tasks={filteredTasks.filter((t) => t.status === "in_progress")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
              onApproveTask={handleApproveTask}
            />

            <TaskColumn
              status="review_required"
              title="Revisão necessária"
              colorClass="bg-violet-500"
              badgeColorClass="bg-violet-500/10 text-violet-500"
              tasks={filteredTasks.filter((t) => t.status === "review_required")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
              onApproveTask={handleApproveTask}
            />

            <TaskColumn
              status="completed"
              title="Concluído"
              colorClass="bg-emerald-500"
              badgeColorClass="bg-emerald-500/10 text-emerald-500"
              tasks={filteredTasks.filter((t) => t.status === "completed")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
              onApproveTask={handleApproveTask}
            />
          </div>

          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
            }}
          >
            {activeTask ? (
              <div className="opacity-90 shadow-2xl rotate-2">
                <TaskCard
                  task={activeTask}
                  onOpenEdit={() => {}}
                  onUpdateStatus={() => {}}
                  onDelete={() => {}}
                  onApproveTask={() => {}}
                  isOverlay
                />
              </div>
            ) : null}
          </DragOverlay>

          <style jsx>{`
            .tasks-scroll {
              scroll-behavior: smooth;
            }
            @media (hover: none), (pointer: coarse) {
              .tasks-scroll::-webkit-scrollbar {
                height: 0;
                display: none;
              }
              .tasks-scroll {
                scrollbar-width: none;
              }
            }
            @media (hover: hover) and (pointer: fine) {
              .tasks-scroll {
                scrollbar-width: thin;
                scrollbar-color: var(--border) transparent;
              }
              .tasks-scroll::-webkit-scrollbar {
                height: 8px;
              }
              .tasks-scroll::-webkit-scrollbar-track {
                background: transparent;
              }
              .tasks-scroll::-webkit-scrollbar-thumb {
                background-color: var(--border);
                border-radius: 9999px;
              }
              .tasks-scroll::-webkit-scrollbar-thumb:hover {
                background-color: var(--muted-foreground);
              }
            }
          `}</style>
        </DndContext>
      )}

      {/* Edit Task Dialog */}
      {editingTask && (
        <Dialog open={!!editingTask} onOpenChange={(open) => !open && resetForm()}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Editar Tarefa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateTask} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Título</label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Descrição (Opcional)</label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {/* AI Agent Configuration Block */}
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="edit_is_ai_task" className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 cursor-pointer">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    Atribuir a Agente de IA AGI
                  </label>
                  <input
                    id="edit_is_ai_task"
                    type="checkbox"
                    checked={formIsAiTask}
                    onChange={(e) => setFormIsAiTask(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </div>

                {formIsAiTask && (
                  <div className="space-y-3 pt-2 border-t border-violet-500/20 text-xs">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-muted-foreground">Tipo de Agente IA</label>
                      <select
                        value={formAiAgentType}
                        onChange={(e) => setFormAiAgentType(e.target.value as any)}
                        className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-xs focus-visible:outline-none"
                      >
                        <option value="billing">💳 Agente de Cobrança WhatsApp (Pix / Lembrete)</option>
                        <option value="followup">🔄 Agente de Recompra / Follow-up</option>
                        <option value="onboarding">📋 Agente de Boas-Vindas / Documentos</option>
                        <option value="general">🤖 Agente Executor Geral</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-semibold text-muted-foreground">Modo de Execução</label>
                      <select
                        value={formExecutionMode}
                        onChange={(e) => setFormExecutionMode(e.target.value as any)}
                        className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-xs focus-visible:outline-none"
                      >
                        <option value="approval">👤 Rascunho / Aprovação Humana (1-Click Approve)</option>
                        <option value="autonomous">⚡ Modo Autônomo (Enviar Direto no WhatsApp)</option>
                      </select>
                    </div>

                    {formAiAgentType === "billing" && (
                      <div className="space-y-2 pt-2 border-t border-violet-500/20">
                        <span className="font-semibold text-violet-700 dark:text-violet-300 block text-[11px]">Configurações da Cobrança:</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Produto da Loja</label>
                            <select
                              value={formBillingProductId}
                              onChange={(e) => setFormBillingProductId(e.target.value)}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-[11px]"
                            >
                              <option value="">Nenhum produto (Valor livre)...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (R$ {p.price})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Valor do Débito (R$)</label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Ex: 150.00"
                              value={formBillingAmount}
                              onChange={(e) => setFormBillingAmount(e.target.value)}
                              className="h-8 text-[11px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Tom de Voz</label>
                          <select
                            value={formBillingTone}
                            onChange={(e) => setFormBillingTone(e.target.value)}
                            className="w-full h-8 px-2 rounded border border-input bg-background text-[11px]"
                          >
                            <option value="Amigável e profissional">Amigável e profissional</option>
                            <option value="Formal e direto">Formal e direto</option>
                            <option value="Urgente / Lembrete de vencimento">Urgente / Lembrete de vencimento</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Prazo</label>
                  <Input
                    type="date"
                    value={formDueAt}
                    onChange={(e) => setFormDueAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none"
                  >
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="review_required">Revisão necessária</option>
                    <option value="completed">Concluído</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Cliente Associado</label>
                  <select
                    value={formContactId}
                    onChange={(e) => setFormContactId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none"
                  >
                    <option value="">Nenhum...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.phone}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Atendente</label>
                  <select
                    value={formAgentId}
                    onChange={(e) => setFormAgentId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none"
                  >
                    <option value="">Sem responsável...</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar Alterações</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Kanban Column Component
// ------------------------------------------------------------
function TaskColumn({
  status,
  title,
  colorClass,
  badgeColorClass,
  tasks,
  onOpenEdit,
  onUpdateStatus,
  onDelete,
  onApproveTask,
}: {
  status: "pending" | "in_progress" | "review_required" | "completed";
  title: string;
  colorClass: string;
  badgeColorClass: string;
  tasks: TaskWithRelations[];
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: any) => void;
  onDelete: (taskId: string) => void;
  onApproveTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-[80vw] min-w-[280px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-border bg-card/60 p-4 md:w-auto md:max-w-none md:flex-1 md:basis-[250px] md:shrink md:snap-none">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", colorClass)} />
          {title}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeColorClass)}>
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "mt-4 flex-1 space-y-3 overflow-y-auto max-h-[600px] rounded-lg transition-all min-h-[400px] pb-10",
          isOver ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2" : ""
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-12 text-xs text-muted-foreground select-none">
            Solte uma tarefa aqui
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              onOpenEdit={onOpenEdit}
              onUpdateStatus={onUpdateStatus}
              onDelete={onDelete}
              onApproveTask={onApproveTask}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Draggable Card Wrapper
// ------------------------------------------------------------
function DraggableTaskCard({
  task,
  onOpenEdit,
  onUpdateStatus,
  onDelete,
  onApproveTask,
}: {
  task: TaskWithRelations;
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: any) => void;
  onDelete: (taskId: string) => void;
  onApproveTask: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <TaskCard
        task={task}
        onOpenEdit={onOpenEdit}
        onUpdateStatus={onUpdateStatus}
        onDelete={onDelete}
        onApproveTask={onApproveTask}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Inner Card Component
// ------------------------------------------------------------
function TaskCard({
  task,
  onOpenEdit,
  onUpdateStatus,
  onDelete,
  onApproveTask,
  isOverlay = false,
}: {
  task: TaskWithRelations;
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: any) => void;
  onDelete: (taskId: string) => void;
  onApproveTask: (taskId: string) => void;
  isOverlay?: boolean;
}) {
  const isOverdue =
    task.due_at &&
    new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0)) &&
    task.status !== "completed";

  return (
    <div
      onClick={() => !isOverlay && onOpenEdit(task)}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer select-none",
        isOverlay ? "border-primary/40 shadow-xl" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm text-foreground leading-tight group-hover:text-primary transition-colors pr-6">
          {task.title}
        </h4>
        {!isOverlay && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Badges/Associations */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {task.contact && (
          <Link
            href={`/inbox?c=${task.conversation_id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded bg-muted/60 hover:bg-muted text-[10px] text-muted-foreground px-2 py-0.5 border border-border/50"
          >
            <MessageSquare className="h-2.5 w-2.5" />
            <span className="truncate max-w-[120px]">{task.contact.name || task.contact.phone}</span>
          </Link>
        )}

        {task.ai_agent_type === "billing" ? (
          <span className="flex items-center gap-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-semibold text-emerald-600 px-2 py-0.5 dark:text-emerald-400">
            <Sparkles className="h-2.5 w-2.5 text-emerald-500" />
            Cobrança IA
          </span>
        ) : task.is_ai_task ? (
          <span className="flex items-center gap-1.5 rounded bg-violet-500/10 border border-violet-500/20 text-[9px] font-medium text-violet-600 px-2 py-0.5 dark:text-violet-400">
            <Sparkles className="h-2.5 w-2.5 text-violet-500" />
            Agente IA
          </span>
        ) : null}
      </div>

      {/* Draft Preview for review_required */}
      {task.status === "review_required" && task.ai_draft && (
        <div className="rounded-md bg-violet-50/70 dark:bg-violet-950/30 p-2 border border-violet-200/60 dark:border-violet-800/40 text-[11px] text-foreground space-y-1">
          <span className="font-semibold text-violet-700 dark:text-violet-300 text-[10px] flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-500" /> Proposta de Cobrança / Rascunho:
          </span>
          <p className="line-clamp-3 text-muted-foreground whitespace-pre-wrap leading-tight text-[10px] italic">{task.ai_draft}</p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/50 pt-3 text-[10px] text-muted-foreground">
        <span
          className={cn(
            "flex items-center gap-1.5",
            isOverdue ? "text-rose-500 font-medium" : "text-muted-foreground"
          )}
        >
          <Calendar className="h-3 w-3" />
          {task.due_at ? format(new Date(task.due_at), "dd/MM/yyyy") : "Sem prazo"}
          {isOverdue && <span className="text-[9px] uppercase tracking-wider bg-rose-500/10 text-rose-500 px-1 rounded">Atrasado</span>}
        </span>

        {task.assigned_agent ? (
          <span className="flex items-center gap-1 font-medium bg-muted/50 px-2 py-0.5 rounded border border-border/20">
            <User className="h-2.5 w-2.5 text-muted-foreground" />
            {task.assigned_agent.full_name.split(" ")[0]}
          </span>
        ) : (
          <span className="text-muted-foreground italic">Sem atendente</span>
        )}
      </div>

      {/* Quick Move/Approve actions (Not displayed during drag overlay) */}
      {!isOverlay && (
        <div className="flex justify-end gap-1.5 mt-1 border-t border-border/30 pt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {task.status === "review_required" && (
            <Button
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onApproveTask(task.id);
              }}
              className="text-[10px] h-6 px-2.5 text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-600 font-medium shadow-sm"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Aprovar & Enviar WhatsApp
            </Button>
          )}
          {task.status !== "pending" && task.status !== "review_required" && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onUpdateStatus(task.id, "pending")}
              className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
            >
              Pendente
            </Button>
          )}
          {task.status !== "in_progress" && task.status !== "review_required" && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onUpdateStatus(task.id, "in_progress")}
              className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
            >
              Em andamento
            </Button>
          )}
          {task.status !== "completed" && task.status !== "review_required" && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onUpdateStatus(task.id, "completed")}
              className="text-[10px] h-6 px-2 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            >
              Concluir
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
