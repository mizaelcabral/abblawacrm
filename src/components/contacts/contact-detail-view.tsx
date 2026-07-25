'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import { normalizeDateToYMD } from '@/lib/signatures/contact-helper';
import type {
  Contact,
  Tag,
  ContactNote,
  CustomField,
  Deal,
  DocumentItem,
} from '@/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  DollarSign,
  FileText,
  Download,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { DocumentUploadDialog, DOCUMENT_TYPES } from './document-upload-dialog';
import { CreateSignatureDialog } from '@/components/signatures/create-signature-dialog';

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
}

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  const supabase = createClient();
  const { user, accountId, defaultCurrency } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Details tab
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Tags tab
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Notes tab
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Custom fields tab
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Deals tab
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // Documents tab
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentUploadOpen, setDocumentUploadOpen] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (data) {
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone ?? '');
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
    }
    setLoading(false);
  }, [contactId, supabase]);

  const fetchTags = useCallback(async () => {
    if (!contactId) return;

    const [tagsRes, contactTagsRes] = await Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId),
    ]);

    if (tagsRes.data) setAllTags(tagsRes.data);
    if (contactTagsRes.data) {
      setContactTagIds(contactTagsRes.data.map((ct) => ct.tag_id));
    }
  }, [contactId, supabase]);

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;
    setLoadingNotes(true);

    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (data) setNotes(data);
    setLoadingNotes(false);
  }, [contactId, supabase]);

  const fetchCustomFields = useCallback(async () => {
    if (!contactId) return;
    setLoadingCustom(true);

    const [fieldsRes, valuesRes] = await Promise.all([
      supabase
        .from('custom_fields')
        .select('*')
        .eq('is_active', true)
        .order('group_name', { ascending: true })
        .order('display_order', { ascending: true })
        .order('field_name', { ascending: true }),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contactId),
    ]);

    if (fieldsRes.data) setCustomFields(fieldsRes.data as CustomField[]);
    if (valuesRes.data) {
      const map: Record<string, string> = {};
      const fieldsList = (fieldsRes.data as CustomField[]) || [];
      valuesRes.data.forEach((v) => {
        const fieldDef = fieldsList.find((f) => f.id === v.custom_field_id);
        let rawVal = v.value ?? '';
        if (fieldDef?.field_type === 'date' || fieldDef?.field_key === 'birth_date') {
          rawVal = normalizeDateToYMD(rawVal);
        }
        map[v.custom_field_id] = rawVal;
      });
      setCustomValues(map);
    }
    setLoadingCustom(false);
  }, [contactId, supabase]);

  const fetchDeals = useCallback(async () => {
    if (!contactId) return;
    setLoadingDeals(true);
    const { data } = await supabase
      .from('deals')
      .select('*, stage:pipeline_stages(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
    setLoadingDeals(false);
  }, [contactId, supabase]);

  const fetchDocuments = useCallback(async () => {
    if (!contactId) return;
    setLoadingDocuments(true);

    const { data } = await supabase
      .from('documents')
      .select('*, deal:deals(id, title), current_version:document_versions(*)')
      .eq('contact_id', contactId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    setDocuments((data as DocumentItem[]) || []);
    setLoadingDocuments(false);
  }, [contactId, supabase]);

  useEffect(() => {
    if (open && contactId) {
      fetchContact();
      fetchTags();
      fetchNotes();
      fetchCustomFields();
      fetchDeals();
      fetchDocuments();
    }
  }, [open, contactId, fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals, fetchDocuments]);

  async function copyPhone() {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!contactId) return;

    const hasSocialId = !!(contact?.messenger_psid || contact?.instagram_igsid);
    if (!editPhone.trim() && !hasSocialId) {
      toast.error('O número de telefone é obrigatório');
      return;
    }

    setSavingDetails(true);
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editName.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    if (error) {
      toast.error('Falha ao atualizar contato');
    } else {
      toast.success('Contato atualizado');
      fetchContact();
      onUpdated();
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    if (!contactId) return;
    setSavingTags(true);

    const isSelected = contactTagIds.includes(tagId);

    if (isSelected) {
      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', contactId)
        .eq('tag_id', tagId);
      if (!error) {
        setContactTagIds((prev) => prev.filter((id) => id !== tagId));
        onUpdated();
      }
    } else {
      const { error } = await supabase
        .from('contact_tags')
        .insert({ contact_id: contactId, tag_id: tagId });
      if (!error) {
        setContactTagIds((prev) => [...prev, tagId]);
        onUpdated();
      }
    }
    setSavingTags(false);
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setSavingNote(true);

    if (!user || !accountId) {
      toast.error('Não autenticado');
      setSavingNote(false);
      return;
    }

    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      account_id: accountId,
      user_id: user.id,
      note_text: newNote.trim(),
    });

    if (error) {
      toast.error('Falha ao adicionar observação');
    } else {
      setNewNote('');
      fetchNotes();
      toast.success('Observação adicionada');
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      toast.error('Falha ao excluir observação');
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('Observação excluída');
    }
  }

  async function saveCustomFields() {
    if (!contactId) return;
    setSavingCustom(true);

    try {
      await supabase
        .from('contact_custom_values')
        .delete()
        .eq('contact_id', contactId);

      const rows = Object.entries(customValues)
        .filter(([, val]) => val && val.trim())
        .map(([fieldId, val]) => {
          const fieldDef = customFields.find((f) => f.id === fieldId);
          let finalVal = val.trim();
          if (fieldDef?.field_type === 'date' || fieldDef?.field_key === 'birth_date') {
            finalVal = normalizeDateToYMD(finalVal);
          }
          return {
            contact_id: contactId,
            custom_field_id: fieldId,
            value: finalVal,
            updated_at: new Date().toISOString(),
            updated_by_user_id: user?.id || null,
          };
        });

      if (rows.length > 0) {
        const { error } = await supabase
          .from('contact_custom_values')
          .insert(rows);
        if (error) throw error;
      }

      toast.success('Campos personalizados salvos');
      await fetchCustomFields();
      onUpdated();
    } catch {
      toast.error('Falha ao salvar campos personalizados');
    }
    setSavingCustom(false);
  }

  async function handleDownloadDocument(doc: DocumentItem) {
    setDownloadingDocId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar link seguro');

      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao acessar documento');
    } finally {
      setDownloadingDocId(null);
    }
  }

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // Active custom fields
  const activeFields = customFields.filter((f) => f.is_active !== false);

  // Resolve is_minor value
  const isMinorField = activeFields.find((f) => f.field_key === 'is_minor');
  const isMinorRaw = isMinorField ? customValues[isMinorField.id] : undefined;

  let isMinor: boolean | null = null;
  if (isMinorRaw === 'true') isMinor = true;
  if (isMinorRaw === 'false') isMinor = false;

  // Calculate incomplete custom fields with ADULT vs MINOR conditional logic
  const incompleteCount = activeFields.filter((f) => {
    let val = customValues[f.id];
    if (f.field_type === 'date' || f.field_key === 'birth_date') {
      val = normalizeDateToYMD(val);
    }
    const isMissing = !val || !val.trim();
    if (!isMissing) return false;

    const isGuardianField =
      f.group_name === 'Responsável legal' ||
      (f.field_key && f.field_key.startsWith('guardian_'));

    // Rule: If patient is an adult (is_minor === false), guardian fields do NOT count as pending/incomplete!
    if (isMinor === false && isGuardianField) {
      return false;
    }

    return true;
  }).length;

  // Group custom fields
  const groupedFields: Record<string, CustomField[]> = {};
  activeFields.forEach((f) => {
    const group = f.group_name || 'Dados Gerais';
    if (!groupedFields[group]) groupedFields[group] = [];
    groupedFields[group].push(f);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0 flex flex-col h-full"
      >
        {loading || !contact ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <SheetHeader className="p-4 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 bg-muted border border-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-popover-foreground truncate">
                    {contact.name || 'Desconhecido'}
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground text-xs mt-0.5">
                    Detalhes e documentos do contato
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <button
                      onClick={copyPhone}
                      className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                    >
                      <Phone className="size-3" />
                      {contact.phone}
                      {copiedPhone ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {contact.email}
                      </span>
                    )}
                    {contact.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" />
                        {contact.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* Tabs */}
            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              <TabsList className="bg-muted/50 border-b border-border mx-4 mt-3 shrink-0 flex-wrap h-auto p-1">
                <TabsTrigger
                  value="details"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs py-1 px-2.5"
                >
                  Detalhes
                </TabsTrigger>
                <TabsTrigger
                  value="tags"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs py-1 px-2.5"
                >
                  Tags
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs py-1 px-2.5"
                >
                  Observações
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs py-1 px-2.5 relative"
                >
                  Dados Complementares
                  {incompleteCount > 0 && (
                    <span className="ml-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 text-[10px] font-semibold">
                      {incompleteCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs py-1 px-2.5"
                >
                  Documentos
                  {documents.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({documents.length})
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="deals"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground text-xs py-1 px-2.5"
                >
                  Negócios
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Nome</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      Telefone <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">E-mail</Label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Empresa</Label>
                    <Input
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <Button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                    size="sm"
                  >
                    {savingDetails ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    Salvar Alterações
                  </Button>
                </div>
              </TabsContent>

              {/* Tags Tab */}
              <TabsContent value="tags" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Clique em uma tag para adicioná-la ou removê-la deste contato.
                  </p>
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma tag disponível. Crie tags em Configurações.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => {
                        const selected = contactTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            disabled={savingTags}
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {selected && <Check className="size-3 mr-1" />}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 px-4 py-3">
                <div className="space-y-2 mb-3">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Escrever uma observação..."
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm resize-none"
                  />
                  <Button
                    onClick={addNote}
                    disabled={!newNote.trim() || savingNote}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="sm"
                  >
                    {savingNote ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Adicionar Observação
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {loadingNotes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma observação ainda.
                    </p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg bg-muted/50 border border-border/50 p-3 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap flex-1">
                            {note.note_text}
                          </p>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all cursor-pointer shrink-0"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(note.created_at).toLocaleDateString('pt-BR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Custom Fields / Complementary Data Tab */}
              <TabsContent value="custom" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingCustom ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activeFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum campo personalizado ativo nesta conta. Crie ou ative campos em Configurações.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Action Card: Signature Request Preview */}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <ShieldCheck className="size-4 text-primary shrink-0" />
                          <span>Assinatura Eletrônica ZapSign</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Pré-visualize a procuração sem criar registros ou chamadas externas.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setSignatureDialogOpen(true)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-7 shrink-0 gap-1"
                      >
                        <FileText className="size-3.5" />
                        Pré-visualizar procuração
                      </Button>
                    </div>

                    {incompleteCount > 0 && (
                      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>
                          {incompleteCount} {incompleteCount === 1 ? 'campo pendente' : 'campos pendentes'} de preenchimento.
                        </span>
                      </div>
                    )}

                    {Object.entries(groupedFields).map(([groupName, groupFields]) => (
                      <div key={groupName} className="space-y-2.5 rounded-lg border border-border bg-card p-3">
                        <h4 className="text-xs font-semibold text-foreground border-b border-border pb-1.5 flex items-center justify-between">
                          <span>{groupName}</span>
                          {groupName === 'Responsável legal' && isMinor === false && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground font-normal">
                              Não aplicável para paciente adulto
                            </Badge>
                          )}
                          {groupName === 'Responsável legal' && isMinor === null && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30 font-normal">
                              Defina se o paciente é menor de idade
                            </Badge>
                          )}
                        </h4>
                        <div className="space-y-2">
                          {groupFields.map((field) => {
                            let val = customValues[field.id] ?? '';
                            if (field.field_type === 'date' || field.field_key === 'birth_date') {
                              val = normalizeDateToYMD(val);
                            }
                            const isMissing = !val.trim();
                            const isGuardianField =
                              groupName === 'Responsável legal' ||
                              (field.field_key && field.field_key.startsWith('guardian_'));

                            let statusBadge: React.ReactNode = null;
                            if (isGuardianField) {
                              if (isMinor === false) {
                                statusBadge = (
                                  <span className="text-[10px] text-muted-foreground font-normal">
                                    Não aplicável para paciente adulto
                                  </span>
                                );
                              } else if (isMinor === null) {
                                statusBadge = (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                    Defina se o paciente é menor de idade
                                  </span>
                                );
                              } else if (isMissing) {
                                statusBadge = (
                                  <span className="text-[10px] text-amber-500 font-medium">
                                    Incompleto
                                  </span>
                                );
                              }
                            } else if (isMissing) {
                              statusBadge = (
                                <span className="text-[10px] text-amber-500 font-medium">
                                  Incompleto
                                </span>
                              );
                            }

                            return (
                              <div key={field.id} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs text-muted-foreground">
                                    {field.field_name}
                                  </Label>
                                  {statusBadge}
                                </div>

                                {field.field_type === 'boolean' ? (
                                  <select
                                    value={val}
                                    onChange={(e) =>
                                      setCustomValues((prev) => ({
                                        ...prev,
                                        [field.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full h-8 rounded-md bg-muted border border-border px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                  >
                                    <option value="">Não informado</option>
                                    <option value="true">Sim</option>
                                    <option value="false">Não (Paciente Adulto)</option>
                                  </select>
                                ) : field.field_type === 'date' || field.field_key === 'birth_date' ? (
                                  <input
                                    type="date"
                                    value={val}
                                    onChange={(e) =>
                                      setCustomValues((prev) => ({
                                        ...prev,
                                        [field.id]: e.target.value,
                                      }))
                                    }
                                    className="bg-muted border border-border text-foreground h-8 text-xs rounded-md px-2.5 w-full focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                ) : (
                                  <Input
                                    type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
                                    value={val}
                                    onChange={(e) =>
                                      setCustomValues((prev) => ({
                                        ...prev,
                                        [field.id]: e.target.value,
                                      }))
                                    }
                                    placeholder={`Digitar ${field.field_name.toLowerCase()}...`}
                                    className="bg-muted border-border text-foreground h-8 text-xs placeholder:text-muted-foreground"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <Button
                      onClick={saveCustomFields}
                      disabled={savingCustom}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingCustom ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Save className="size-3.5 mr-1.5" />
                      )}
                      Salvar Dados Complementares
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Documentos vinculados ao contato
                    </p>
                    <Button
                      size="sm"
                      onClick={() => setDocumentUploadOpen(true)}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-7 gap-1"
                    >
                      <Plus className="size-3.5" />
                      Enviar Documento
                    </Button>
                  </div>

                  {loadingDocuments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="p-6 text-center border border-dashed rounded-lg text-muted-foreground space-y-1">
                      <FileText className="size-6 mx-auto opacity-50" />
                      <p className="text-xs font-medium">Nenhum documento enviado ainda.</p>
                      <p className="text-[11px]">Faça upload de procurações, laudos ou comprovantes.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documents.map((doc) => {
                        const typeInfo = DOCUMENT_TYPES.find((t) => t.value === doc.document_type) || {
                          label: doc.document_type,
                        };
                        return (
                          <div
                            key={doc.id}
                            className="p-3 rounded-lg border border-border bg-card flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground truncate">
                                  {doc.display_name}
                                </span>
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {typeInfo.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                {doc.deal && <span>Negócio: {doc.deal.title}</span>}
                                <span>v{doc.version}</span>
                                <span>
                                  {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadDocument(doc)}
                              disabled={downloadingDocId === doc.id}
                              className="h-7 text-xs gap-1 shrink-0"
                            >
                              {downloadingDocId === doc.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Download className="size-3" />
                              )}
                              Baixar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Deals Tab */}
              <TabsContent value="deals" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-2">
                  {loadingDeals ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : deals.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum negócio vinculado a este contato.
                    </p>
                  ) : (
                    deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-popover-foreground truncate">
                            {deal.title}
                          </p>
                          <span className="text-xs font-semibold text-primary shrink-0">
                            {formatCurrency(deal.value, defaultCurrency)}
                          </span>
                        </div>
                        {deal.stage && (
                          <Badge
                            variant="secondary"
                            className="bg-muted text-muted-foreground text-xs"
                          >
                            {deal.stage.name}
                          </Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Upload Dialog */}
        {contactId && (
          <DocumentUploadDialog
            open={documentUploadOpen}
            onOpenChange={setDocumentUploadOpen}
            contactId={contactId}
            deals={deals}
            onSuccess={fetchDocuments}
          />
        )}

        {/* Signature Request Dialog */}
        {contactId && (
          <CreateSignatureDialog
            open={signatureDialogOpen}
            onOpenChange={setSignatureDialogOpen}
            contactId={contactId}
            contactName={contact?.name}
            deals={deals.map((d) => ({ id: d.id, title: d.title }))}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
