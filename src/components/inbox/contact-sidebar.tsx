"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag, Task, Pipeline, PipelineStage } from "@/types";
import { KBSearchPanel } from "@/components/knowledge-base/kb-search-panel";
import { DealForm } from "@/components/pipelines/deal-form";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  CheckSquare,
  Calendar,
  Trash2,
  Sparkles,
  BookMarked,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueAt, setNewTaskDueAt] = useState("");
  const [newTaskAgentId, setNewTaskAgentId] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; full_name: string }[]>([]);

  // AI settings state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [updatingAi, setUpdatingAi] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);

  // States for dynamic tags and deals adding (ponytail: minimum logic)
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [dealFormOpen, setDealFormOpen] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    const fetchMembers = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("account_id", accountId)
        .order("full_name", { ascending: true });
      if (data) setMembers(data);
    };
    fetchMembers();
  }, [accountId]);

  // Load account tags, pipelines and stages for deals/tags management (ponytail: keep it simple)
  useEffect(() => {
    if (!accountId) return;
    const fetchTagsAndPipelines = async () => {
      const supabase = createClient();
      
      // Load all workspace tags
      const { data: tagData } = await supabase
        .from("tags")
        .select("*")
        .eq("account_id", accountId)
        .order("name");
      if (tagData) setAllTags(tagData);

      // Load pipelines
      const { data: pipelineData } = await supabase
        .from("pipelines")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at");
      
      if (pipelineData && pipelineData.length > 0) {
        setPipelines(pipelineData);
        // Load stages for the first pipeline
        const { data: stageData } = await supabase
          .from("pipeline_stages")
          .select("*")
          .eq("pipeline_id", pipelineData[0].id)
          .order("position");
        if (stageData) setStages(stageData);
      }
    };
    fetchTagsAndPipelines();
  }, [accountId]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, tags, tasks, and conversation in parallel
    const [dealsRes, notesRes, tagsRes, tasksRes, convRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("tasks")
        .select("*, assigned_agent:profiles(full_name)")
        .eq("contact_id", contact.id)
        .order("due_at", { ascending: true }),
      supabase
        .from("conversations")
        .select("id, ai_enabled, ai_system_prompt")
        .eq("contact_id", contact.id)
        .limit(1)
        .maybeSingle(),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (convRes.data) {
      setConversationId(convRes.data.id);
      setAiEnabled(convRes.data.ai_enabled);
      setAiPrompt(convRes.data.ai_system_prompt || "");
    } else {
      setConversationId(null);
      setAiEnabled(false);
      setAiPrompt("");
    }
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const handleAddTask = useCallback(async () => {
    if (!contact || !newTaskTitle.trim()) return;
    if (!accountId) return;
    setAddingTask(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        title: newTaskTitle.trim(),
        due_at: newTaskDueAt ? new Date(newTaskDueAt).toISOString() : null,
        assigned_agent_id: newTaskAgentId || null,
        status: "pending",
      })
      .select("*, assigned_agent:profiles(full_name)")
      .single();

    if (!error && data) {
      setTasks((prev) =>
        [...prev, data].sort((a, b) => {
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        })
      );
      setNewTaskTitle("");
      setNewTaskDueAt("");
      setNewTaskAgentId("");
    }
    setAddingTask(false);
  }, [contact, newTaskTitle, newTaskDueAt, newTaskAgentId, accountId]);

  const handleToggleTask = useCallback(async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
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
  }, []);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (!error) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  }, []);

  const handleToggleTag = useCallback(async (tag: Tag, isAttached: boolean) => {
    if (!contact) return;
    const supabase = createClient();
    if (isAttached) {
      const link = tags.find((t) => t.id === tag.id);
      if (link?.contact_tag_id) {
        const { error } = await supabase
          .from("contact_tags")
          .delete()
          .eq("id", link.contact_tag_id);
        
        if (!error) {
          setTags((prev) => prev.filter((t) => t.id !== tag.id));
        } else {
          toast.error("Erro ao remover tag");
        }
      }
    } else {
      const { data, error } = await supabase
        .from("contact_tags")
        .insert({
          contact_id: contact.id,
          tag_id: tag.id,
        })
        .select()
        .single();
      
      if (!error && data) {
        setTags((prev) => [...prev, { ...tag, contact_tag_id: data.id }]);
      } else {
        toast.error("Erro ao adicionar tag");
      }
    }
  }, [contact, tags]);

  const handleToggleAi = useCallback(async (enabled: boolean) => {
    if (!conversationId) return;
    setUpdatingAi(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("conversations")
      .update({ ai_enabled: enabled })
      .eq("id", conversationId);

    if (!error) {
      setAiEnabled(enabled);
      toast.success(enabled ? "IA Autopiloto ativada!" : "IA Autopiloto desativada.");
    } else {
      toast.error("Erro ao atualizar configurações da IA.");
    }
    setUpdatingAi(false);
  }, [conversationId]);

  const handleSaveAiPrompt = useCallback(async () => {
    if (!conversationId) return;
    setUpdatingAi(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("conversations")
      .update({ ai_system_prompt: aiPrompt.trim() || null })
      .eq("id", conversationId);

    if (!error) {
      toast.success("Instruções da IA salvas com sucesso!");
    } else {
      toast.error("Erro ao salvar instruções da IA.");
    }
    setUpdatingAi(false);
  }, [conversationId, aiPrompt]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone || "Desconhecido";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col overflow-hidden border-l border-border bg-card">
      <ScrollArea className="h-full">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Knowledge Base Quick Search */}
          <div className="relative">
            <button
              onClick={() => setKbOpen((v) => !v)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                kbOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <BookMarked className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">Base de Conhecimento</span>
              <span className="text-[9px] opacity-60">{kbOpen ? "Fechar" : "Pesquisar"}</span>
            </button>
            {kbOpen && (
              <div className="mt-1">
                <KBSearchPanel
                  open={kbOpen}
                  onClose={() => setKbOpen(false)}
                  inline
                />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* AI Autopilot Settings */}
          {conversationId && (

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                  IA Autopiloto
                </span>
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  disabled={updatingAi}
                  onChange={(e) => handleToggleAi(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary accent-primary cursor-pointer"
                />
              </div>
              
              {aiEnabled && (
                <div className="mt-2 space-y-2 px-1">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Instruções personalizadas para a IA (ex: tom de voz, regras do negócio)..."
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                  />
                  <Button
                    size="sm"
                    className="w-full text-[11px] h-7 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                    onClick={handleSaveAiPrompt}
                    disabled={updatingAi}
                  >
                    Salvar Instruções
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          {conversationId && <div className="my-4 border-t border-border" />}

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <TagIcon className="h-3 w-3" />
                Tags
              </span>
              {contact && allTags.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 max-h-60 overflow-y-auto">
                    {allTags.map((tag) => {
                      const isAttached = tags.some((t) => t.id === tag.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={tag.id}
                          checked={isAttached}
                          onCheckedChange={() => handleToggleTag(tag, isAttached)}
                        >
                          <span
                            className="mr-2 h-2.5 w-2.5 rounded-full inline-block"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Sem tags</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                Negócios Ativos
              </span>
              {contact && pipelines.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 hover:bg-muted"
                  onClick={() => setDealFormOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Sem negócios</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tasks */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <CheckSquare className="h-3.5 w-3.5" />
              Tarefas
            </div>
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Nova tarefa..."
                  className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddTask();
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddTask}
                  disabled={!newTaskTitle.trim() || addingTask}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newTaskDueAt}
                  onChange={(e) => setNewTaskDueAt(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground outline-none focus:border-primary/50"
                />
                <select
                  value={newTaskAgentId}
                  onChange={(e) => setNewTaskAgentId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-muted pl-2 pr-6 py-1 text-[11px] text-muted-foreground outline-none focus:border-primary/50"
                >
                  <option value="">Atendente...</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
                <div className="w-[30px] shrink-0" />
              </div>

              <div className="mt-2 space-y-1">
                {tasks.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">Sem tarefas</p>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-2 rounded-lg bg-muted px-3 py-2"
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={task.status === "completed"}
                          onChange={() => handleToggleTask(task.id, task.status)}
                          className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-border text-primary accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-xs font-medium text-foreground break-words",
                              task.status === "completed" && "line-through text-muted-foreground"
                            )}
                          >
                            {task.title}
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                            {task.due_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {format(new Date(task.due_at), "dd/MM/yyyy")}
                              </span>
                            )}
                            {task.assigned_agent?.full_name && (
                              <span>
                                Responsável: {task.assigned_agent.full_name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              Anotações
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Adicionar uma anotação..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Deal creation form sheet (ponytail: reuse existing deal sheet) */}
      {contact && pipelines.length > 0 && (
        <DealForm
          open={dealFormOpen}
          onOpenChange={setDealFormOpen}
          pipelineId={pipelines[0].id}
          stages={stages}
          preselectedContactId={contact.id}
          onSaved={fetchContactData}
        />
      )}
    </div>
  );
}
