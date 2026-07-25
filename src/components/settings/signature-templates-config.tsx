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
    setDialogOpen(true);
  };

  const handleAddFieldMapping = () => {
    if (fieldMappings.length >= 50) return;
    const defaultCustomKey = activeCustomFields[0]?.field_key || 'cpf';
    setFieldMappings([
      ...fieldMappings,
      { zapsign_var: '', source_type: 'custom_field', source_key: defaultCustomKey, is_required: false },
    ]);
  };

  const handleRemoveFieldMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const handleMappingChange = (index: number, key: keyof FieldMapping, value: any) => {
    const updated = [...fieldMappings];
    const item = { ...updated[index], [key]: value };

    // Set sensible default source_key when switching source_type
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

  // Group active custom fields by group_name for display in select dropdowns
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

    // Check if user pasted JSON array
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
      } catch (e) {
        // Fallback to pipe parsing
      }
    }

    // Pipe format parsing: VARIÁVEL | ORIGEM | CAMPO | OBRIGATÓRIO
    const lines = rawText.split('\n').filter((l) => l.trim().length > 0);
    const seenVars = new Set<string>();

    const items: BatchParseItem[] = lines.map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < 3) {
        return { rawLine: line, isValid: false, errorReason: 'Linha deve conter no mínimo 3 colunas separadas por pipe (|).' };
      }

      let varName = parts[0];
      // Keep variable name clean (remove surrounding {{ and }} if present)
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
      // Append non-duplicate mappings
      const existingVars = new Set(fieldMappings.map((m) => m.zapsign_var));
      const newToAppend = validMappings.filter((m) => !existingVars.has(m.zapsign_var));
      setFieldMappings([...fieldMappings, ...newToAppend]);
    }

    setBatchModalOpen(false);
    setBatchRawText('');
    setBatchStep('input');
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Modelos de Assinatura Configurados
          </CardTitle>
          <CardDescription>
            Gerencie os modelos da ZapSign e o mapeamento dinâmico de variáveis com o CRM.
          </CardDescription>
        </div>
        {isAdmin && (
          <Button onClick={openCreateDialog} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Modelo
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando modelos de assinatura...
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground space-y-3">
            <Settings2 className="w-8 h-8 mx-auto opacity-50" />
            <p className="text-sm font-medium">Nenhum modelo de assinatura configurado.</p>
            <p className="text-xs">
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
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{tpl.template_name}</span>
                      <Badge variant={tpl.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {tpl.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {tpl.category}
                      </Badge>
                      {hasInvalidFields && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertTriangle className="w-3 h-3" /> Campo Desativado
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-4">
                      <span>ID Externo: <code className="bg-muted px-1 py-0.5 rounded">{tpl.template_id}</code></span>
                      <span>Signatário: <strong>{tpl.signatory_rule}</strong></span>
                      <span>Modo: <strong>{tpl.delivery_mode}</strong></span>
                      <span>Campos: {tpl.field_mappings?.length || 0}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(tpl)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(tpl)}
                        className="h-8 w-8 p-0 text-destructive"
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

      {/* Main Create/Edit Dialog - Wide Responsive Layout */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Modelo de Assinatura' : 'Novo Modelo de Assinatura'}
            </DialogTitle>
            <DialogDescription>
              Configure o modelo da ZapSign e vincule as variáveis às colunas nativas do contato ou aos campos personalizados ativos.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Nome Interno do Modelo</Label>
              <Input
                placeholder="Ex: Procuração Anvisa Desertmoon"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ID do Modelo na ZapSign (template_id)</Label>
              <Input
                placeholder="Ex: b416fa71-4466-4bb0-901a-6ea66b988d2f"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input
                placeholder="Ex: procuracao, contrato"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Regra do Signatário</Label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={signatoryRule}
                onChange={(e: any) => setSignatoryRule(e.target.value)}
              >
                <option value="contact_only">Somente o Contato</option>
                <option value="guardian_if_minor">Responsável se Menor de Idade (is_minor=true)</option>
                <option value="guardian_only">Somente o Responsável Legal</option>
              </select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Modo de Envio Padrão</Label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={deliveryMode}
                onChange={(e: any) => setDeliveryMode(e.target.value)}
              >
                <option value="manual_link">Apenas Link Manual (Cópia pela equipe)</option>
                <option value="zapsign_email">E-mail Automático pela ZapSign</option>
                <option value="zapsign_whatsapp">WhatsApp Automático pela ZapSign</option>
              </select>
            </div>
          </div>

          {/* Mappings Section */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="font-semibold text-sm">Mapeamento de Variáveis (de/para)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fetchCustomFields}
                  disabled={refreshingFields}
                  title="Atualizar lista de campos personalizados"
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshingFields ? 'animate-spin' : ''}`} />
                  Atualizar campos
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBatchStep('input');
                    setBatchRawText('');
                    setBatchModalOpen(true);
                  }}
                  className="gap-1 text-xs"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Colar Vários Campos
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleAddFieldMapping} className="gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Adicionar Campo
                </Button>
              </div>
            </div>

            {fieldMappings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum mapeamento adicionado.</p>
            ) : (
              <div className="space-y-2">
                {fieldMappings.map((mapping, idx) => {
                  const isInvalidCustomField =
                    mapping.source_type === 'custom_field' && !activeCustomKeysSet.has(mapping.source_key);

                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-12 gap-2 items-center border p-2.5 rounded-md bg-muted/20 text-xs ${
                        isInvalidCustomField ? 'border-destructive/60 bg-destructive/5' : ''
                      }`}
                    >
                      {/* Column 1: Variable Name */}
                      <div className="col-span-3">
                        <Input
                          placeholder="Variável (ex: CPF:)"
                          className="h-8 text-xs font-mono"
                          value={mapping.zapsign_var}
                          onChange={(e) => handleMappingChange(idx, 'zapsign_var', e.target.value)}
                        />
                      </div>

                      {/* Column 2: Source Type */}
                      <div className="col-span-3">
                        <select
                          className="w-full border rounded h-8 text-xs bg-background px-2"
                          value={mapping.source_type}
                          onChange={(e: any) => handleMappingChange(idx, 'source_type', e.target.value)}
                        >
                          <option value="contact_property">Coluna Nativa do Contato</option>
                          <option value="custom_field">Campo Personalizado</option>
                          <option value="system_value">Valor do Sistema</option>
                          <option value="fixed_value">Valor Fixo</option>
                        </select>
                      </div>

                      {/* Column 3: Source Key Selector (Dropdown for custom_fields cleanly lists all active options below) */}
                      <div className="col-span-4">
                        {mapping.source_type === 'contact_property' ? (
                          <select
                            className="w-full border rounded h-8 text-xs bg-background px-2"
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
                            className={`w-full border rounded h-8 text-xs bg-background px-2 ${
                              isInvalidCustomField ? 'border-destructive text-destructive font-semibold' : ''
                            }`}
                            value={mapping.source_key}
                            onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                          >
                            {/* If current mapping points to an invalid/deactivated custom_field, render warning option at top */}
                            {isInvalidCustomField && (
                              <option value={mapping.source_key}>
                                ⚠️ {mapping.source_key} (Desativado/Inválido)
                              </option>
                            )}

                            {/* Render ALL active custom field optgroups below so the user can easily select a valid option */}
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
                            className="w-full border rounded h-8 text-xs bg-background px-2"
                            value={mapping.source_key}
                            onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                          >
                            <option value="contact_city_current_date_ptbr">
                              Cidade + Data Atual (PT-BR)
                            </option>
                          </select>
                        ) : (
                          <Input
                            placeholder="Valor fixo"
                            className="h-8 text-xs"
                            value={mapping.default_value || ''}
                            onChange={(e) => handleMappingChange(idx, 'default_value', e.target.value)}
                          />
                        )}
                      </div>

                      {/* Column 4: Required Flag */}
                      <div className="col-span-1 text-center">
                        <label className="flex items-center gap-1 cursor-pointer justify-center">
                          <input
                            type="checkbox"
                            checked={mapping.is_required}
                            onChange={(e) => handleMappingChange(idx, 'is_required', e.target.checked)}
                          />
                          <span className="text-[10px]">Obr</span>
                        </label>
                      </div>

                      {/* Column 5: Delete */}
                      <div className="col-span-1 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFieldMapping(idx)}
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingTemplate ? 'Salvar Alterações' : 'Criar Modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Paste Modal ("Colar vários campos") */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Colar Vários Campos em Lote
            </DialogTitle>
            <DialogDescription>
              Cole as definições das variáveis (uma por linha) no formato pipe (<code className="bg-muted px-1">VARIÁVEL | ORIGEM | CAMPO | OBRIGATÓRIO</code>) ou JSON estruturado.
            </DialogDescription>
          </DialogHeader>

          {batchStep === 'input' ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Conteúdo das Variáveis</Label>
                <textarea
                  rows={10}
                  className="w-full text-xs font-mono border rounded-md p-3 bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={`Exemplo (1 linha por variável):\n{{Nome completo:}} | contact_property | name | true\n{{CPF:}} | custom_field | cpf | true\n{{RG:}} | custom_field | rg | true\n{{Local e data:}} | system_value | contact_city_current_date_ptbr | true`}
                  value={batchRawText}
                  onChange={(e) => setBatchRawText(e.target.value)}
                />
              </div>

              <div className="p-3 rounded bg-muted/40 text-xs space-y-1 text-muted-foreground">
                <span className="font-semibold text-foreground">Origens Permitidas:</span>
                <p><code className="text-primary font-mono">contact_property</code>: name, phone, email, company</p>
                <p><code className="text-primary font-mono">custom_field</code>: cpf, rg, birth_date, address_line, city, state, postal_code, guardian_*</p>
                <p><code className="text-primary font-mono">system_value</code>: contact_city_current_date_ptbr</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between text-xs border-b pb-2">
                <span className="font-semibold">Resultado da Análise da Colagem</span>
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
                    className={`p-2 rounded border text-xs flex items-center justify-between font-mono ${
                      item.isValid ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-destructive/5 border-destructive/30 text-destructive'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-semibold">
                        {item.isValid ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        )}
                        <span>{item.mapping?.zapsign_var || item.rawLine}</span>
                      </div>
                      {item.isValid && item.mapping && (
                        <p className="text-[11px] text-muted-foreground">
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
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="batchMode"
                      value="append"
                      checked={batchImportMode === 'append'}
                      onChange={() => setBatchImportMode('append')}
                    />
                    <span>Adicionar aos mapeamentos existentes (Padrão)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
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

          <DialogFooter className="pt-4 flex justify-between">
            {batchStep === 'input' ? (
              <>
                <Button variant="outline" onClick={() => setBatchModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleParseBatchText} disabled={!batchRawText.trim()}>
                  Analisar Colagem
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBatchStep('input')}>
                  Voltar ao Texto
                </Button>
                <Button
                  onClick={handleApplyBatchImport}
                  disabled={batchParsedItems.filter((i) => i.isValid).length === 0}
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
