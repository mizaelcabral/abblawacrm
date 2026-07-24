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
import { SignatureTemplate, FieldMapping, ALLOWED_CONTACT_PROPERTIES } from '@/types/signatures';

export function SignatureTemplatesConfig() {
  const { accountRole } = useAuth();
  const isAdmin = accountRole === 'owner' || accountRole === 'admin';

  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [customFieldKeys, setCustomFieldKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal State
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

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, cfRes] = await Promise.all([
        fetch('/api/signature-templates'),
        fetch('/api/account/members'), // Or custom fields endpoint
      ]);

      if (tplRes.ok) {
        const data = await tplRes.json();
        setTemplates(data.templates || []);
      }
    } catch (err: any) {
      console.error('Error fetching signature templates:', err);
      setError('Falha ao carregar modelos de assinatura.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setTemplateId('');
    setTemplateName('');
    setCategory('procuracao');
    setDescription('');
    setSignatoryRule('contact_only');
    setDeliveryMode('manual_link');
    setFieldMappings([
      { zapsign_var: 'NOME_PACIENTE', source_type: 'contact_property', source_key: 'name', is_required: true },
      { zapsign_var: 'CPF_PACIENTE', source_type: 'contact_property', source_key: 'cpf', is_required: true },
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
    setFieldMappings([
      ...fieldMappings,
      { zapsign_var: '', source_type: 'contact_property', source_key: 'name', is_required: false },
    ]);
  };

  const handleRemoveFieldMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const handleMappingChange = (index: number, key: keyof FieldMapping, value: any) => {
    const updated = [...fieldMappings];
    updated[index] = { ...updated[index], [key]: value };
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
      fetchTemplates();
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
        fetchTemplates();
      }
    } catch (err) {
      console.error('Error toggling template status:', err);
    }
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
            Gerencie os modelos da ZapSign e o mapeamento de variáveis para preenchimento automático.
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
              Cadastre modelos da ZapSign para permitir o envio automatizado de procurações e contratos.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((tpl) => (
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
            ))}
          </div>
        )}
      </CardContent>

      {/* Modal Dialog for Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Modelo de Assinatura' : 'Novo Modelo de Assinatura'}
            </DialogTitle>
            <DialogDescription>
              Configure a integração do modelo da ZapSign com as propriedades do contato e campos personalizados.
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
                placeholder="Ex: Procuração RDC 660"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ID do Modelo na ZapSign (template_id)</Label>
              <Input
                placeholder="Ex: tpl_abc123xyz"
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

          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">Mapeamento de Variáveis (de/para)</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddFieldMapping} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar Campo
              </Button>
            </div>

            {fieldMappings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum mapeamento adicionado.</p>
            ) : (
              <div className="space-y-2">
                {fieldMappings.map((mapping, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center border p-2 rounded-md bg-muted/30 text-xs">
                    <div className="col-span-3">
                      <Input
                        placeholder="Variável ZapSign"
                        className="h-8 text-xs font-mono"
                        value={mapping.zapsign_var}
                        onChange={(e) => handleMappingChange(idx, 'zapsign_var', e.target.value)}
                      />
                    </div>
                    <div className="col-span-3">
                      <select
                        className="w-full border rounded h-8 text-xs bg-background px-1"
                        value={mapping.source_type}
                        onChange={(e: any) => handleMappingChange(idx, 'source_type', e.target.value)}
                      >
                        <option value="contact_property">Propriedade do Contato</option>
                        <option value="custom_field">Campo Personalizado</option>
                        <option value="fixed_value">Valor Fixo</option>
                      </select>
                    </div>
                    <div className="col-span-4">
                      {mapping.source_type === 'contact_property' ? (
                        <select
                          className="w-full border rounded h-8 text-xs bg-background px-1"
                          value={mapping.source_key}
                          onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                        >
                          {Array.from(ALLOWED_CONTACT_PROPERTIES).map((prop) => (
                            <option key={prop} value={prop}>
                              {prop}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder={mapping.source_type === 'custom_field' ? 'field_key (ex: cpf)' : 'Valor fixo'}
                          className="h-8 text-xs"
                          value={mapping.source_key}
                          onChange={(e) => handleMappingChange(idx, 'source_key', e.target.value)}
                        />
                      )}
                    </div>
                    <div className="col-span-1 text-center">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mapping.is_required}
                          onChange={(e) => handleMappingChange(idx, 'is_required', e.target.checked)}
                        />
                        <span className="text-[10px]">Obr</span>
                      </label>
                    </div>
                    <div className="col-span-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFieldMapping(idx)}
                        className="h-7 w-7 p-0 text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
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
    </Card>
  );
}
