'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Settings2,
  RefreshCw,
  ClipboardList,
  Check,
  HelpCircle,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  SignatureTemplate,
  FieldMapping,
  ALLOWED_CONTACT_PROPERTIES,
  ALLOWED_SYSTEM_VALUES,
} from '@/types/signatures';

interface CustomFieldOption {
  id: string;
  field_key: string;
  label: string;
  group_name: string;
  field_type: string;
}

interface BatchParseItem {
  rawLine: string;
  isValid: boolean;
  errorReason?: string;
  mapping?: FieldMapping;
}

export function SignatureTemplatesConfig() {
  const { accountRole } = useAuth();
  const isAdmin = accountRole === 'owner' || accountRole === 'admin';

  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [activeCustomFields, setActiveCustomFields] = useState<CustomFieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshingFields, setRefreshingFields] = useState(false);

  // Main Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SignatureTemplate | null>(null);

  // Form State
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState('procuracao');
  const [description, setDescription] = useState('');
  const [signatoryRule, setSignatoryRule] = useState<'contact_only' | 'guardian_if_minor' | 'guardian_only'>('contact_only');
  const [deliveryMode, setDeliveryMode] = useState<'manual_link' | 'zapsign_email' | 'zapsign_whatsapp'>('manual_link');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Batch Import Modal State
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchRawText, setBatchRawText] = useState('');
  const [batchImportMode, setBatchImportMode] = useState<'append' | 'replace'>('append');
  const [batchParsedItems, setBatchParsedItems] = useState<BatchParseItem[]>([]);
  const [batchStep, setBatchStep] = useState<'input' | 'preview'>('input');

  const fetchCustomFields = async () => {
    setRefreshingFields(true);
    try {
      const res = await fetch('/api/signature-templates/custom-fields');
      if (res.ok) {
        const data = await res.json();
        setActiveCustomFields(data.custom_fields || []);
      }
    } catch (err) {
      console.error('Error fetching custom fields:', err);
    } finally {
      setRefreshingFields(false);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, cfRes] = await Promise.all([
        fetch('/api/signature-templates'),
        fetch('/api/signature-templates/custom-fields'),
      ]);

      if (tplRes.ok) {
        const data = await tplRes.json();
        setTemplates(data.templates || []);
      }

      if (cfRes.ok) {
        const cfData = await cfRes.json();
        setActiveCustomFields(cfData.custom_fields || []);
      }
    } catch (err: any) {
      console.error('Error fetching signature templates:', err);
      setError('Falha ao carregar modelos de assinatura.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const activeCustomKeysSet = new Set(activeCustomFields.map((cf) => cf.field_key));

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setTemplateId('');
    setTemplateName('');
    setCategory('procuracao');
    setDescription('');
    setSignatoryRule('contact_only');
    setDeliveryMode('manual_link');
    setFieldMappings([
      { zapsign_var: 'Nome completo:', source_type: 'contact_property', source_key: 'name', is_required: true },
      { zapsign_var: 'CPF:', source_type: 'custom_field', source_key: 'cpf', is_required: true },
    ]);
    setFormError(null);
    setHasUnsavedChanges(false);
    setDialogOpen(true);
  };

  const openEditDialog = (tpl: SignatureTemplate) => {
    setEditingTemplate(tpl);
    setTemplateId(tpl.template_id);
    setTemplateName(tpl.template_name);
    setCategory(tpl.category);
    setDescription(tpl.description || '');
    setSignatoryRule(tpl.signatory_rule);
    setDeliveryMode(tpl.delivery_mode);
    setFieldMappings(tpl.field_mappings || []);
    setFormError(null);
    setHasUnsavedChanges(false);
    setDialogOpen(true);
  };

  const handleAttemptClose = () => {
    if (hasUnsavedChanges) {
      if (confirm('Existem alterações não salvas no modelo. Deseja realmente fechar sem salvar?')) {
        setDialogOpen(false);
        setHasUnsavedChanges(false);
      }
    } else {
      setDialogOpen(false);
    }
  };

  const handleAddFieldMapping = () => {
    if (fieldMappings.length >= 50) return;
    const defaultCustomKey = activeCustomFields[0]?.field_key || 'cpf';
    setFieldMappings([
      ...fieldMappings,
      { zapsign_var: '', source_type: 'custom_field', source_key: defaultCustomKey, is_required: false },
    ]);
    setHasUnsavedChanges(true);
  };

  const handleRemoveFieldMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const handleMappingChange = (index: number, key: keyof FieldMapping, value: any) => {
    const updated = [...fieldMappings];
    const item = { ...updated[index], [key]: value };

    if (key === 'source_type') {
      if (value === 'contact_property') {
        item.source_key = 'name';
      } else if (value === 'custom_field') {
        item.source_key = activeCustomFields[0]?.field_key || 'cpf';
      } else if (value === 'system_value') {
        item.source_key = 'contact_city_current_date_ptbr';
      } else if (value === 'fixed_value') {
        item.source_key = 'fixed';
      }
    }

    updated[index] = item;
    setFieldMappings(updated);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setFormError(null);

    const payload = {
      template_id: templateId,
      template_name: templateName,
      category,
      description: description || null,
      signatory_rule: signatoryRule,
      delivery_mode: deliveryMode,
      field_mappings: fieldMappings,
    };

    try {
      const url = editingTemplate
        ? `/api/signature-templates/${editingTemplate.id}`
        : '/api/signature-templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao salvar modelo.');
      }

      setHasUnsavedChanges(false);
      setDialogOpen(false);
      fetchInitialData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (tpl: SignatureTemplate) => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/signature-templates/${tpl.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchInitialData();
      }
    } catch (err) {
      console.error('Error toggling template status:', err);
    }
  };

  const customFieldsByGroup = activeCustomFields.reduce((acc, cf) => {
    const group = cf.group_name || 'Gerais';
    if (!acc[group]) acc[group] = [];
    acc[group].push(cf);
    return acc;
  }, {} as Record<string, CustomFieldOption[]>);

  // --- BATCH IMPORT PARSER LOGIC ---
  const handleParseBatchText = () => {
    const rawText = batchRawText.trim();
    if (!rawText) return;

    if (rawText.startsWith('[') && rawText.endsWith(']')) {
      try {
        const parsedJson = JSON.parse(rawText);
        if (Array.isArray(parsedJson)) {
          const items: BatchParseItem[] = parsedJson.map((item: any) => {
            const varName = (item.zapsign_var || '').trim();
            const sourceType = item.source_type;
            const sourceKey = (item.source_key || '').trim();
            const isReq = Boolean(item.is_required);

            if (!varName) return { rawLine: JSON.stringify(item), isValid: false, errorReason: 'Nome da variável em branco.' };
            if (!['contact_property', 'custom_field', 'system_value', 'fixed_value'].includes(sourceType)) {
              return { rawLine: JSON.stringify(item), isValid: false, errorReason: `source_type inválido '${sourceType}'.` };
            }
            if (sourceType === 'contact_property' && !ALLOWED_CONTACT_PROPERTIES.has(sourceKey)) {
              return { rawLine: JSON.stringify(item), isValid: false, errorReason: `contact_property '${sourceKey}' não permitida.` };
            }
            if (sourceType === 'custom_field' && !activeCustomKeysSet.has(sourceKey)) {
              return { rawLine: JSON.stringify(item), isValid: false, errorReason: `custom_field '${sourceKey}' não existe ou está inativo.` };
            }
            if (sourceType === 'system_value' && !ALLOWED_SYSTEM_VALUES.has(sourceKey)) {
              return { rawLine: JSON.stringify(item), isValid: false, errorReason: `system_value '${sourceKey}' não permitido.` };
            }

            return {
              rawLine: JSON.stringify(item),
              isValid: true,
              mapping: {
                zapsign_var: varName,
                source_type: sourceType,
                source_key: sourceKey,
                is_required: isReq,
                default_value: item.default_value,
              },
            };
          });

          setBatchParsedItems(items);
          setBatchStep('preview');
          return;
        }
      } catch (e) {}
    }

    const lines = rawText.split('\n').filter((l) => l.trim().length > 0);
    const seenVars = new Set<string>();

    const items: BatchParseItem[] = lines.map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < 3) {
        return { rawLine: line, isValid: false, errorReason: 'Linha deve conter no mínimo 3 colunas separadas por pipe (|).' };
      }

      let varName = parts[0];
      if (varName.startsWith('{{') && varName.endsWith('}}')) {
        varName = varName.substring(2, varName.length - 2).trim();
      }

      const sourceType = parts[1] as any;
      const sourceKey = parts[2];
      const reqRaw = parts[3] ? parts[3].toLowerCase() : 'false';
      const isReq = reqRaw === 'true' || reqRaw === '1' || reqRaw === 'sim';

      if (!varName) return { rawLine: line, isValid: false, errorReason: 'Nome da variável é obrigatório.' };

      if (seenVars.has(varName)) {
        return { rawLine: line, isValid: false, errorReason: `Variável duplicada '{{${varName}}}' na colagem.` };
      }
      seenVars.add(varName);

      if (!['contact_property', 'custom_field', 'system_value', 'fixed_value'].includes(sourceType)) {
        return { rawLine: line, isValid: false, errorReason: `Origem inválida '${sourceType}'. Permitidas: contact_property, custom_field, system_value, fixed_value` };
      }

      if (sourceType === 'contact_property' && !ALLOWED_CONTACT_PROPERTIES.has(sourceKey)) {
        return { rawLine: line, isValid: false, errorReason: `Coluna nativa '${sourceKey}' não permitida. Permitidas: name, phone, email, company` };
      }

      if (sourceType === 'custom_field' && !activeCustomKeysSet.has(sourceKey)) {
        return { rawLine: line, isValid: false, errorReason: `Campo personalizado '${sourceKey}' não está ativo na conta.` };
      }

      if (sourceType === 'system_value' && !ALLOWED_SYSTEM_VALUES.has(sourceKey)) {
        return { rawLine: line, isValid: false, errorReason: `system_value '${sourceKey}' não permitido. Permitido: contact_city_current_date_ptbr` };
      }

      return {
        rawLine: line,
        isValid: true,
        mapping: {
          zapsign_var: varName,
          source_type: sourceType,
          source_key: sourceKey,
          is_required: isReq,
        },
      };
    });

    setBatchParsedItems(items);
    setBatchStep('preview');
  };

  const handleApplyBatchImport = () => {
    const validMappings = batchParsedItems.filter((i) => i.isValid && i.mapping).map((i) => i.mapping!);
    if (validMappings.length === 0) return;

    if (batchImportMode === 'replace') {
      setFieldMappings(validMappings);
    } else {
      const existingVars = new Set(fieldMappings.map((m) => m.zapsign_var));
      const newToAppend = validMappings.filter((m) => !existingVars.has(m.zapsign_var));
      setFieldMappings([...fieldMappings, ...newToAppend]);
    }

    setHasUnsavedChanges(true);
    setBatchModalOpen(false);
    setBatchRawText('');
    setBatchStep('input');
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            Modelos de Assinatura Configurados
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Gerencie os modelos da ZapSign e o mapeamento dinâmico de variáveis com o CRM.
          </CardDescription>
        </div>
        {isAdmin && (
          <Button onClick={openCreateDialog} size="sm" className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Novo Modelo
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando modelos de assinatura...
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground space-y-3">
            <Settings2 className="w-8 h-8 mx-auto opacity-50" />
            <p className="text-sm font-medium">Nenhum modelo de assinatura configurado.</p>
            <p className="text-xs max-w-md mx-auto">
              Cadastre modelos da ZapSign para permitir a geração de procurações e contratos.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((tpl) => {
              const hasInvalidFields = tpl.field_mappings?.some(
                (m) => m.source_type === 'custom_field' && !activeCustomKeysSet.has(m.source_key)
              );

              return (
                <div
                  key={tpl.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors gap-3"
                >
                  <div className="space-y-1.5 min-w-0 w-full sm:w-auto">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm truncate">{tpl.template_name}</span>
                      <Badge variant={tpl.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {tpl.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {tpl.category}
                      </Badge>
                      {hasInvalidFields && (
                        <Badge variant="destructive" className="text-[10px] gap-1 shrink-0">
                          <AlertTriangle className="w-3 h-3" /> Campo Desativado
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>ID: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{tpl.template_id}</code></span>
                      <span>Signatário: <strong>{tpl.signatory_rule}</strong></span>
                      <span>Modo: <strong>{tpl.delivery_mode}</strong></span>
                      <span>Mapeamentos: {tpl.field_mappings?.length || 0}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(tpl)}
                        className="h-8 w-8 p-0"
                        title="Editar modelo"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(tpl)}
                        className="h-8 w-8 p-0 text-destructive"
                        title={tpl.is_active ? 'Desativar modelo' : 'Ativar modelo'}
                      >
                        {tpl.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* --- REDESIGNED MAIN DIALOG ---
          Override sm:max-w-sm locally with w-[96vw] max-w-[1100px] sm:max-w-[1100px] max-h-[90vh]
          Pinned Header & Footer, Scrollable Central Form Body, Responsive 3-Section Layout */}
      <Dialog open={dialogOpen} onOpenChange={handleAttemptClose}>
        <DialogContent
          showCloseButton={false}
          className="w-[96vw] max-w-[1100px] sm:max-w-[1100px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl border bg-background shadow-2xl"
        >
          {/* Fixed Header */}
          <DialogHeader className="p-5 sm:p-6 pb-4 border-b bg-muted/20 shrink-0 flex flex-row items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                {editingTemplate ? 'Editar Modelo de Assinatura' : 'Novo Modelo de Assinatura'}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground truncate">
                Configure o modelo externo da ZapSign e mapeie suas variáveis com o CRM.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleAttemptClose}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 min-w-0">
            {formError && (
              <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs sm:text-sm flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-medium">{formError}</span>
              </div>
            )}

            {/* SECTION 1: Identificação do Modelo */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Identificação do Modelo
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Informe o nome interno no CRM e o ID do modelo cadastrado na ZapSign.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="tpl-name" className="text-xs font-medium">Nome Interno do Modelo *</Label>
                  <Input
                    id="tpl-name"
                    placeholder="Ex: Procuração Anvisa Desertmoon"
                    className="h-9 text-xs"
                    value={templateName}
                    onChange={(e) => {
                      setTemplateName(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="tpl-id" className="text-xs font-medium">ID na ZapSign (template_id) *</Label>
                  <Input
                    id="tpl-id"
                    placeholder="Ex: b416fa71-4466-4bb0-901a-6ea66b988d2f"
                    className="h-9 text-xs font-mono"
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="tpl-cat" className="text-xs font-medium">Categoria</Label>
                  <Input
                    id="tpl-cat"
                    placeholder="Ex: procuracao, contrato"
                    className="h-9 text-xs"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: Regras de Assinatura e Envio */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                  Regras de Assinatura e Envio
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Defina quem deve assinar o documento e o modo de entrega dos links.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="signatory-rule" className="text-xs font-medium">Regra do Signatário</Label>
                  <select
                    id="signatory-rule"
                    className="w-full border rounded-md h-9 text-xs bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary"
                    value={signatoryRule}
                    onChange={(e: any) => {
                      setSignatoryRule(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                  >
                    <option value="contact_only">Somente o Contato / Paciente</option>
                    <option value="guardian_if_minor">Responsável Legal se Menor (is_minor=true)</option>
                    <option value="guardian_only">Somente o Responsável Legal</option>
                  </select>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="delivery-mode" className="text-xs font-medium">Modo de Envio Padrão</Label>
                  <select
                    id="delivery-mode"
                    className="w-full border rounded-md h-9 text-xs bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary"
                    value={deliveryMode}
                    onChange={(e: any) => {
                      setDeliveryMode(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                  >
                    <option value="manual_link">Apenas Link Manual (Cópia pela equipe)</option>
                    <option value="zapsign_email">E-mail Automático pela ZapSign</option>
                    <option value="zapsign_whatsapp">WhatsApp Automático pela ZapSign</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 3: Mapeamento de Variáveis */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                    Mapeamento de Variáveis (de/para)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Associe cada variável <code className="bg-muted px-1 rounded">{`{{variavel}}`}</code> do modelo aos campos do contato.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={fetchCustomFields}
                    disabled={refreshingFields}
                    title="Atualizar lista de campos personalizados ativos"
                    className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingFields ? 'animate-spin' : ''}`} />
                    <span>Atualizar campos</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBatchStep('input');
                      setBatchRawText('');
                      setBatchModalOpen(true);
                    }}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Colar Vários Campos</span>
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleAddFieldMapping}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Campo</span>
                  </Button>
                </div>
              </div>

              {fieldMappings.length === 0 ? (
                <div className="p-6 text-center border border-dashed rounded-lg text-muted-foreground space-y-1">
                  <p className="text-xs font-medium">Nenhum mapeamento de variável cadastrado neste modelo.</p>
                  <p className="text-[11px]">Clique em "Adicionar Campo" ou "Colar Vários Campos" para começar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Header Row for Desktop */}
                  <div className="hidden md:grid md:grid-cols-12 gap-3 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-3">Variável ZapSign</div>
                    <div className="col-span-3">Origem do Dado</div>
                    <div className="col-span-4">Campo de Origem</div>
                    <div className="col-span-1 text-center">Obrig.</div>
                    <div className="col-span-1 text-right">Ação</div>
                  </div>

                  {/* Mapping Rows - Responsive Grid on Desktop, Card on Mobile */}
                  {fieldMappings.map((mapping, idx) => {
                    const isInvalidCustomField =
                      mapping.source_type === 'custom_field' && !activeCustomKeysSet.has(mapping.source_key);

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border bg-card/60 transition-colors space-y-2 md:space-y-0 md:grid md:grid-cols-12 md:gap-3 md:items-center ${
                          isInvalidCustomField ? 'border-destructive/60 bg-destructive/5' : 'hover:border-border'
                        }`}
                      >
                        {/* 1. Variable Name */}
                        <div className="md:col-span-3 min-w-0">
                          <span className="md:hidden text-[10px] font-semibold text-muted-foreground uppercase">Variável ZapSign</span>
                          <Input
                            placeholder="Ex: Nome completo:"
                            className="h-8 text-xs font-mono w-full min-w-0"
                            value={mapping.zapsign_var}
                            onChange={(e) => handleMappingChange(idx, 'zapsign_var', e.target.value)}
                          />
                        </div>

                        {/* 2. Source Type */}
                        <div className="md:col-span-3 min-w-0">
                          <span className="md:hidden text-[10px] font-semibold text-muted-foreground uppercase">Origem</span>
                          <select
                            className="w-full border rounded h-8 text-xs bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary min-w-0 truncate"
                            value={mapping.source_type}
                            onChange={(e: any) => handleMappingChange(idx, 'source_type', e.target.value)}
                          >
                            <option value="contact_property">Coluna Nativa do Contato</option>
                            <option value="custom_field">Campo Personalizado</option>
                            <option value="system_value">Valor do Sistema</option>
                            <option value="fixed_value">Valor Fixo</option>
                          </select>
                        </div>

                        {/* 3. Source Key / Selector */}
                        <div className="md:col-span-4 min-w-0">
                          <span className="md:hidden text-[10px] font-semibold text-muted-foreground uppercase">Campo Selecionado</span>
                          {mapping.source_type === 'contact_property' ? (
                            <select
                              className="w-full border rounded h-8 text-xs bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary min-w-0 truncate"
                              value={mapping.source_key}
                              onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                            >
                              {Array.from(ALLOWED_CONTACT_PROPERTIES).map((prop) => (
                                <option key={prop} value={prop}>
                                  {prop} (Nativa)
                                </option>
                              ))}
                            </select>
                          ) : mapping.source_type === 'custom_field' ? (
                            <select
                              className={`w-full border rounded h-8 text-xs bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary min-w-0 truncate ${
                                isInvalidCustomField ? 'border-destructive text-destructive font-semibold' : ''
                              }`}
                              value={mapping.source_key}
                              onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                            >
                              {isInvalidCustomField && (
                                <option value={mapping.source_key}>
                                  ⚠️ {mapping.source_key} (Desativado/Inválido)
                                </option>
                              )}
                              {Object.entries(customFieldsByGroup).map(([group, fields]) => (
                                <optgroup key={group} label={group}>
                                  {fields.map((f) => (
                                    <option key={f.id || f.field_key} value={f.field_key}>
                                      {f.label} ({f.field_key})
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          ) : mapping.source_type === 'system_value' ? (
                            <select
                              className="w-full border rounded h-8 text-xs bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary min-w-0 truncate"
                              value={mapping.source_key}
                              onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                            >
                              <option value="contact_city_current_date_ptbr">
                                Cidade + Data Atual (PT-BR)
                              </option>
                            </select>
                          ) : (
                            <Input
                              placeholder="Valor fixo estático"
                              className="h-8 text-xs w-full min-w-0"
                              value={mapping.default_value || ''}
                              onChange={(e) => handleMappingChange(idx, 'default_value', e.target.value)}
                            />
                          )}
                        </div>

                        {/* 4. Required & Delete Action */}
                        <div className="flex items-center justify-between md:contents pt-1 md:pt-0">
                          <div className="md:col-span-1 text-center min-w-0">
                            <label className="flex items-center gap-1.5 cursor-pointer justify-start md:justify-center">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                checked={mapping.is_required}
                                onChange={(e) => handleMappingChange(idx, 'is_required', e.target.checked)}
                              />
                              <span className="text-xs font-medium md:text-[11px]">Obriga.</span>
                            </label>
                          </div>

                          <div className="md:col-span-1 text-right min-w-0 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFieldMapping(idx)}
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                              title="Remover mapeamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Fixed Footer */}
          <DialogFooter className="p-4 sm:px-6 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-3">
            <Button variant="outline" onClick={handleAttemptClose} size="sm">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTemplate ? 'Salvar Alterações' : 'Criar Modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- REDESIGNED BATCH PASTE MODAL ---
          w-[96vw] max-w-[850px] sm:max-w-[850px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[96vw] max-w-[850px] sm:max-w-[850px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl border bg-background shadow-2xl"
        >
          <DialogHeader className="p-5 sm:p-6 pb-4 border-b bg-muted/20 shrink-0 flex flex-row items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary shrink-0" />
                Colar Vários Campos em Lote
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground truncate">
                Cole múltiplas linhas no formato pipe ou JSON estruturado.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setBatchModalOpen(false)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 min-w-0">
            {batchStep === 'input' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Conteúdo das Variáveis (Pipe ou JSON)</Label>
                  <textarea
                    rows={10}
                    className="w-full text-xs font-mono border rounded-lg p-3 bg-muted/10 focus:outline-none focus:ring-1 focus:ring-primary min-w-0 resize-y"
                    placeholder={`Formato Pipe (1 linha por variável):\n{{Nome completo:}} | contact_property | name | true\n{{CPF:}} | custom_field | cpf | true\n{{RG:}} | custom_field | rg | true\n{{Local e data:}} | system_value | contact_city_current_date_ptbr | true`}
                    value={batchRawText}
                    onChange={(e) => setBatchRawText(e.target.value)}
                  />
                </div>

                <div className="p-3 rounded-lg bg-muted/30 border text-xs space-y-1 text-muted-foreground">
                  <span className="font-semibold text-foreground">Sintaxe Esperada:</span>
                  <p><code className="text-primary font-mono font-semibold">VARIÁVEL | ORIGEM | CAMPO | OBRIGATÓRIO</code></p>
                  <p className="text-[11px]">Origens permitidas: <code className="font-mono text-foreground">contact_property</code>, <code className="font-mono text-foreground">custom_field</code>, <code className="font-mono text-foreground">system_value</code>, <code className="font-mono text-foreground">fixed_value</code></p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs border-b pb-2">
                  <span className="font-semibold text-foreground">Resultado da Análise da Colagem</span>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">
                      {batchParsedItems.filter((i) => i.isValid).length} Válidos
                    </Badge>
                    {batchParsedItems.some((i) => !i.isValid) && (
                      <Badge variant="destructive">
                        {batchParsedItems.filter((i) => !i.isValid).length} Erros
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {batchParsedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between font-mono ${
                        item.isValid
                          ? 'bg-emerald-500/5 border-emerald-500/30 text-foreground'
                          : 'bg-destructive/5 border-destructive/30 text-destructive'
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 font-semibold truncate">
                          {item.isValid ? (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                          )}
                          <span className="truncate">{item.mapping?.zapsign_var || item.rawLine}</span>
                        </div>
                        {item.isValid && item.mapping && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {item.mapping.source_type} &rarr; {item.mapping.source_key} (Obr: {item.mapping.is_required ? 'Sim' : 'Não'})
                          </p>
                        )}
                        {!item.isValid && <p className="text-[11px] text-destructive">{item.errorReason}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-semibold">Modo de Aplicação no Formulário</Label>
                  <div className="flex flex-col sm:flex-row gap-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="batchMode"
                        value="append"
                        checked={batchImportMode === 'append'}
                        onChange={() => setBatchImportMode('append')}
                      />
                      <span>Adicionar aos mapeamentos existentes (Padrão)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="batchMode"
                        value="replace"
                        checked={batchImportMode === 'replace'}
                        onChange={() => setBatchImportMode('replace')}
                      />
                      <span className="text-destructive font-medium">Substituir todos os mapeamentos atuais</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 sm:px-6 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-3">
            {batchStep === 'input' ? (
              <>
                <Button variant="outline" onClick={() => setBatchModalOpen(false)} size="sm">
                  Cancelar
                </Button>
                <Button onClick={handleParseBatchText} disabled={!batchRawText.trim()} size="sm">
                  Analisar Colagem
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBatchStep('input')} size="sm">
                  Voltar ao Texto
                </Button>
                <Button
                  onClick={handleApplyBatchImport}
                  disabled={batchParsedItems.filter((i) => i.isValid).length === 0}
                  size="sm"
                >
                  Aplicar {batchParsedItems.filter((i) => i.isValid).length} Mapeamentos
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
