'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Upload, FileText, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';

interface ZapSignDialogProps {
  open: boolean;
  onClose: () => void;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactId?: string;
  conversationId?: string;
  onSendMsg: (text: string) => void;
}

interface TemplateVariable {
  key: string;
  value: string;
}

export function ZapSignDialog({
  open,
  onClose,
  contactName = '',
  contactEmail = '',
  contactPhone = '',
  contactId,
  conversationId,
  onSendMsg,
}: ZapSignDialogProps) {
  const [mode, setMode] = useState<'pdf' | 'template'>('pdf');
  const [docName, setDocName] = useState('');
  
  // Signer
  const [signerName, setSignerName] = useState(contactName);
  const [signerEmail, setSignerEmail] = useState(contactEmail);
  const [signerPhone, setSignerPhone] = useState(contactPhone);
  const [authMode, setAuthMode] = useState('assinaturaTela');

  // PDF specific
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [base64Pdf, setBase64Pdf] = useState<string | null>(null);

  // Template specific
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variables, setVariables] = useState<TemplateVariable[]>([
    { key: '{{NOME_COMPLETO}}', value: contactName },
  ]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [resolvedContactId, setResolvedContactId] = useState(contactId);

  // Load contact details dynamically if not provided but we have conversationId
  useEffect(() => {
    if (open && conversationId) {
      const supabase = createClient();
      supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('id', conversationId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error && data && data.contact) {
            const contact = data.contact;
            setSignerName(contact.name || '');
            setSignerEmail(contact.email || '');
            setSignerPhone(contact.phone || '');
            setResolvedContactId(contact.id);
            setVariables([{ key: '{{NOME_COMPLETO}}', value: contact.name || '' }]);
          }
        });
    }
  }, [open, conversationId]);

  // Load templates on open if mode is template
  useEffect(() => {
    if (open && mode === 'template' && templates.length === 0) {
      setLoadingTemplates(true);
      fetch('/api/zapsign/templates')
        .then((res) => res.json())
        .then((data) => {
          setTemplates(data.templates || []);
          if (data.templates && data.templates.length > 0) {
            setSelectedTemplateId(data.templates[0].token);
          }
        })
        .catch((err) => {
          console.error(err);
          toast.error('Erro ao carregar modelos da ZapSign.');
        })
        .finally(() => {
          setLoadingTemplates(false);
        });
    }
  }, [open, mode, templates.length]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Por favor, selecione um arquivo PDF.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('O PDF deve ter no máximo 10MB.');
        return;
      }

      setPdfFile(file);
      if (!docName) {
        // Auto fill document name with file name without extension
        setDocName(file.name.replace(/\.[^/.]+$/, ""));
      }

      const reader = new FileReader();
      reader.onload = () => {
        setBase64Pdf(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddVariable = () => {
    setVariables([...variables, { key: '', value: '' }]);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleVariableChange = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...variables];
    next[index][field] = val;
    setVariables(next);
  };

  const handleSubmit = async () => {
    if (!docName) {
      toast.error('Por favor, digite o nome do documento.');
      return;
    }
    if (!signerName) {
      toast.error('Por favor, insira o nome do signatário.');
      return;
    }

    if (mode === 'pdf' && !base64Pdf) {
      toast.error('Por favor, selecione um arquivo PDF.');
      return;
    }

    if (mode === 'template' && !selectedTemplateId) {
      toast.error('Por favor, selecione um modelo.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        mode,
        name: docName,
        contactId: resolvedContactId,
        conversationId,
        signerName,
        signerEmail,
        signerPhone,
      };

      if (mode === 'pdf') {
        payload.base64Pdf = base64Pdf;
        payload.authMode = authMode;
      } else {
        payload.templateId = selectedTemplateId;
        // Map variables format: { de: '{{KEY}}', para: 'val' }
        payload.variables = variables
          .filter((v) => v.key.trim() !== '')
          .map((v) => ({
            de: v.key.startsWith('{{') ? v.key : `{{${v.key}}}`,
            para: v.value,
          }));
      }

      const res = await fetch('/api/zapsign/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar link de assinatura.');
      }

      // Generate the message to be sent in WhatsApp chat
      const messageText = `Olá, *${signerName}*!\n\nGeramos o documento *${docName}* para sua assinatura digital na ZapSign. ✍️\n\n👉 *Para assinar, clique no link abaixo:*\n${data.signUrl}\n\nObrigado!`;
      onSendMsg(messageText);

      toast.success('Documento criado e enviado no chat!');
      onClose();

      // Reset state
      setDocName('');
      setPdfFile(null);
      setBase64Pdf(null);
      setVariables([{ key: '{{NOME_COMPLETO}}', value: contactName }]);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar integração com a ZapSign.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card text-foreground max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Enviar para Assinatura
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Crie um documento na ZapSign e envie o link de assinatura automaticamente para o cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode('pdf')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${
                mode === 'pdf' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Upload className="h-3.5 w-3.5" /> Upload PDF
            </button>
            <button
              type="button"
              onClick={() => setMode('template')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${
                mode === 'template' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutTemplate className="h-3.5 w-3.5" /> Usar Modelo
            </button>
          </div>

          {/* Nome do Documento */}
          <div className="space-y-1.5">
            <Label htmlFor="docName">Nome do Documento</Label>
            <Input
              id="docName"
              placeholder="Ex: Contrato de Prestação de Serviços"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="border-input bg-background"
            />
          </div>

          {/* PDF File Picker */}
          {mode === 'pdf' && (
            <div className="space-y-1.5">
              <Label>Arquivo PDF</Label>
              <div className="relative flex flex-col items-center justify-center rounded-lg border border-dashed border-input bg-background p-4 text-center hover:bg-muted/50 cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-xs font-medium text-foreground">
                  {pdfFile ? pdfFile.name : 'Clique para selecionar ou arraste o PDF'}
                </span>
                <span className="text-[10px] text-muted-foreground mt-1">Máximo 10MB</span>
              </div>
            </div>
          )}

          {/* Template Picker */}
          {mode === 'template' && (
            <div className="space-y-1.5">
              <Label htmlFor="templateId">Modelo da ZapSign</Label>
              {loadingTemplates ? (
                <div className="flex h-9 items-center justify-center rounded-md border border-input bg-background">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={selectedTemplateId} onValueChange={(val) => setSelectedTemplateId(val || '')}>
                  <SelectTrigger id="templateId" className="border-input bg-background">
                    <SelectValue placeholder="Selecione um modelo" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover text-foreground">
                    {templates.map((t) => (
                      <SelectItem key={t.token} value={t.token}>
                        {t.name}
                      </SelectItem>
                    ))}
                    {templates.length === 0 && (
                      <div className="p-2 text-center text-xs text-muted-foreground">
                        Nenhum modelo docx cadastrado na ZapSign.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Signer Title */}
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
              Dados do Signatário
            </h4>
          </div>

          {/* Signer fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="signerName">Nome Completo</Label>
              <Input
                id="signerName"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="border-input bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signerEmail">E-mail</Label>
              <Input
                id="signerEmail"
                type="email"
                placeholder="cliente@email.com"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="border-input bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signerPhone">WhatsApp / Celular</Label>
              <Input
                id="signerPhone"
                placeholder="5511999999999"
                value={signerPhone}
                onChange={(e) => setSignerPhone(e.target.value)}
                className="border-input bg-background"
              />
            </div>
          </div>

          {/* Auth Mode & Variables */}
          {mode === 'pdf' ? (
            <div className="space-y-1.5">
              <Label htmlFor="authMode">Modo de Autenticação</Label>
              <Select value={authMode} onValueChange={(val) => setAuthMode(val || 'assinaturaTela')}>
                <SelectTrigger id="authMode" className="border-input bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  <SelectItem value="assinaturaTela">Assinatura na Tela</SelectItem>
                  <SelectItem value="tokenEmail">Token por E-mail</SelectItem>
                  <SelectItem value="tokenSms">Token por SMS</SelectItem>
                  <SelectItem value="tokenWhatsapp">Token por WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            // Variables block for templates
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Variáveis do Modelo (Tags)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddVariable}
                  className="h-7 text-xs border-dashed gap-1"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {variables.map((variable, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      placeholder="Chave (ex: {{NOME}})"
                      value={variable.key}
                      onChange={(e) => handleVariableChange(idx, 'key', e.target.value)}
                      className="h-8 text-xs border-input bg-background flex-1"
                    />
                    <Input
                      placeholder="Valor"
                      value={variable.value}
                      onChange={(e) => handleVariableChange(idx, 'value', e.target.value)}
                      className="h-8 text-xs border-input bg-background flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveVariable(idx)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar e Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
