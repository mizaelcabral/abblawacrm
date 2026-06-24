"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
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
  ai_draft?: string | null;
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

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const supabase = createClient();

    // Query tasks, profiles, and contacts in parallel
    const [tasksRes, membersRes, contactsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*, assigned_agent:profiles(full_name), contact:contacts(name, phone)")
        .order("due_at", { ascending: true, nullsFirst: false }),
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
    ]);

    if (tasksRes.data) setTasks(tasksRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    if (contactsRes.data) setContacts(contactsRes.data);
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
  };

  // Close modals & reset forms
  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormContactId("");
    setFormAgentId("");
    setFormDueAt("");
    setFormStatus("pending");
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
        due_at: formDueAt ? new Date(formDueAt).toISOString() : null,
        assigned_agent_id: formAgentId || null,
      })
      .select("*, assigned_agent:profiles(full_name), contact:contacts(name, phone)")
      .single();

    if (!error && data) {
      setTasks((prev) => [...prev, data]);
      resetForm();
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
        due_at: formDueAt ? new Date(formDueAt).toISOString() : null,
        status: formStatus,
      })
      .eq("id", editingTask.id)
      .select("*, assigned_agent:profiles(full_name), contact:contacts(name, phone)")
      .single();

    if (!error && data) {
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? data : t)));
      resetForm();
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
    <div className="space-y-6 p-1">
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Criar Nova Tarefa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Título</label>
                <Input
                  placeholder="Ex: Ligar para tirar dúvidas do contrato"
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
                  rows={3}
                />
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
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em Andamento</option>
                    <option value="review_required">Aguardando Revisão</option>
                    <option value="completed">Concluída</option>
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
                <Button type="submit">Criar</Button>
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
              title="Pendentes"
              colorClass="bg-amber-500"
              badgeColorClass="bg-amber-500/10 text-amber-500"
              tasks={filteredTasks.filter((t) => t.status === "pending")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
            />

            <TaskColumn
              status="in_progress"
              title="Em Andamento"
              colorClass="bg-primary"
              badgeColorClass="bg-primary/10 text-primary"
              tasks={filteredTasks.filter((t) => t.status === "in_progress")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
            />

            <TaskColumn
              status="review_required"
              title="Aguardando Revisão"
              colorClass="bg-violet-500"
              badgeColorClass="bg-violet-500/10 text-violet-500"
              tasks={filteredTasks.filter((t) => t.status === "review_required")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
            />

            <TaskColumn
              status="completed"
              title="Concluídas"
              colorClass="bg-emerald-500"
              badgeColorClass="bg-emerald-500/10 text-emerald-500"
              tasks={filteredTasks.filter((t) => t.status === "completed")}
              onOpenEdit={handleOpenEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteTask}
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar Tarefa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateTask} className="space-y-4 py-4">
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
                  rows={3}
                />
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
                    <option value="in_progress">Em Andamento</option>
                    <option value="review_required">Aguardando Revisão</option>
                    <option value="completed">Concluída</option>
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
}: {
  status: "pending" | "in_progress" | "review_required" | "completed";
  title: string;
  colorClass: string;
  badgeColorClass: string;
  tasks: TaskWithRelations[];
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: any) => void;
  onDelete: (taskId: string) => void;
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
}: {
  task: TaskWithRelations;
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: any) => void;
  onDelete: (taskId: string) => void;
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
  isOverlay = false,
}: {
  task: TaskWithRelations;
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: any) => void;
  onDelete: (taskId: string) => void;
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

        {task.is_ai_task && (
          <span className="flex items-center gap-1.5 rounded bg-violet-500/10 border border-violet-500/20 text-[9px] font-medium text-violet-600 px-2 py-0.5 dark:text-violet-400">
            <Sparkles className="h-2.5 w-2.5 text-violet-500" />
            Agente IA
          </span>
        )}
      </div>

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
              onClick={() => onUpdateStatus(task.id, "completed")}
              className="text-[10px] h-6 px-2 text-violet-700 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200"
            >
              Aprovar e Concluir
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
              Em Andamento
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
