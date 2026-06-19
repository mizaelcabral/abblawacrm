"use client";

import { useCallback, useEffect, useState } from "react";
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
  Filter,
  CheckCircle,
  FileText,
  UserCheck,
  Search,
  ChevronRight,
  ClipboardList,
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

interface TaskWithRelations {
  id: string;
  account_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed";
  due_at: string | null;
  assigned_agent_id: string | null;
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

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
  const [formStatus, setFormStatus] = useState<"pending" | "in_progress" | "completed">("pending");

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
  const handleUpdateStatus = async (taskId: string, newStatus: "pending" | "in_progress" | "completed") => {
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
  const filteredTasks = tasks.filter((task) => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(query);
      const matchDesc = task.description?.toLowerCase().includes(query);
      const matchContact = task.contact?.name?.toLowerCase().includes(query) || task.contact?.phone.includes(query);
      if (!matchTitle && !matchDesc && !matchContact) return false;
    }

    // 2. Status Filter
    if (statusFilter !== "all" && task.status !== statusFilter) return false;

    // 3. Assignee Filter
    if (assigneeFilter === "mine") {
      if (task.assigned_agent_id !== user?.id) return false;
    } else if (assigneeFilter === "unassigned") {
      if (task.assigned_agent_id !== null) return false;
    } else if (assigneeFilter !== "all" && task.assigned_agent_id !== assigneeFilter) {
      return false;
    }

    // 4. Due Date Filter
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

  // Group tasks by status for columns
  const getTasksByStatus = (status: "pending" | "in_progress" | "completed") => {
    return filteredTasks.filter((t) => t.status === status);
  };

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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="h-32 bg-muted rounded-lg animate-pulse" />
              <div className="h-32 bg-muted rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 items-stretch">
          {/* 1. Pending Column */}
          <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4 min-h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Pendentes
              </span>
              <span className="rounded-full bg-amber-500/10 text-amber-500 px-2.5 py-0.5 text-xs font-semibold">
                {getTasksByStatus("pending").length}
              </span>
            </div>
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-[600px]">
              {getTasksByStatus("pending").length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-8">Nenhuma tarefa pendente</p>
              ) : (
                getTasksByStatus("pending").map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpenEdit={handleOpenEdit}
                    onUpdateStatus={handleUpdateStatus}
                    onDelete={handleDeleteTask}
                  />
                ))
              )}
            </div>
          </div>

          {/* 2. In Progress Column */}
          <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4 min-h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Em Andamento
              </span>
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">
                {getTasksByStatus("in_progress").length}
              </span>
            </div>
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-[600px]">
              {getTasksByStatus("in_progress").length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-8">Nenhuma tarefa em andamento</p>
              ) : (
                getTasksByStatus("in_progress").map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpenEdit={handleOpenEdit}
                    onUpdateStatus={handleUpdateStatus}
                    onDelete={handleDeleteTask}
                  />
                ))
              )}
            </div>
          </div>

          {/* 3. Completed Column */}
          <div className="flex flex-col rounded-xl border border-border bg-card/60 p-4 min-h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Concluídas
              </span>
              <span className="rounded-full bg-emerald-500/10 text-emerald-500 px-2.5 py-0.5 text-xs font-semibold">
                {getTasksByStatus("completed").length}
              </span>
            </div>
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-[600px]">
              {getTasksByStatus("completed").length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-8">Nenhuma tarefa concluída</p>
              ) : (
                getTasksByStatus("completed").map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpenEdit={handleOpenEdit}
                    onUpdateStatus={handleUpdateStatus}
                    onDelete={handleDeleteTask}
                  />
                ))
              )}
            </div>
          </div>
        </div>
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
// Inner Card Component
// ------------------------------------------------------------
function TaskCard({
  task,
  onOpenEdit,
  onUpdateStatus,
  onDelete,
}: {
  task: TaskWithRelations;
  onOpenEdit: (task: TaskWithRelations) => void;
  onUpdateStatus: (taskId: string, newStatus: "pending" | "in_progress" | "completed") => void;
  onDelete: (taskId: string) => void;
}) {
  const isOverdue =
    task.due_at &&
    new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0)) &&
    task.status !== "completed";

  return (
    <div
      onClick={() => onOpenEdit(task)}
      className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm text-foreground leading-tight group-hover:text-primary transition-colors pr-6">
          {task.title}
        </h4>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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

      {/* Quick Move actions */}
      <div className="flex justify-end gap-1.5 mt-1 border-t border-border/30 pt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {task.status !== "pending" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onUpdateStatus(task.id, "pending")}
            className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
          >
            Pendente
          </Button>
        )}
        {task.status !== "in_progress" && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onUpdateStatus(task.id, "in_progress")}
            className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
          >
            Em Andamento
          </Button>
        )}
        {task.status !== "completed" && (
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
    </div>
  );
}
