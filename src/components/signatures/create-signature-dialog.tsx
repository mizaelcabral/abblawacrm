'use client';

import { useState, useEffect } from 'react';
import {
  FileCheck,
  Loader2,
  AlertTriangle,
  Lock,
  UserCheck,
  ShieldAlert,
  Eye,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SignatureTemplate } from '@/types/signatures';

interface CreateSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName?: string;
  deals?: Array<{ id: string; title: string }>;
}

export function maskCpf(cpf?: string | null): string {
  if (!cpf) return '***.***.***-**';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

export function maskRg(rg?: string | null): string {
  if (!rg) return '**.***.***-*';
  const digits = rg.replace(/\D/g, '');
  if (digits.length < 5) return '**.***.***-*';
  const firstTwo = digits.slice(0, 2);
  const lastOne = digits.slice(-1);
  return `${firstTwo}.***.***-${lastOne}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return '(**) *****-****';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '(**) *****-****';
  const ddd = digits.slice(0, 2);
  const lastFour = digits.slice(-4);
  return `(${ddd}) *****-${lastFour}`;
}

export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '***@***.com';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0] || '*'}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

export function CreateSignatureDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  deals = [],
}: CreateSignatureDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SignatureTemplate | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview Result State (Pure Read-Only)
  const [previewResult, setPreviewResult] = useState<{
    isValid: boolean;
    blockReason?: string;
    missingFields?: string[];
    signatory?: any;
    totalMappings?: number;
    filledCount?: number;
    nonApplicableCount?: number;
    variablesCount?: number;
    instructionMessage?: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setSelectedTemplate(null);
      setPreviewResult(null);
      setSelectedDealId(deals[0]?.id || '');
      fetchActiveTemplates();
    }
  }, [open, deals]);

  const fetchActiveTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/signature-templates');
      if (res.ok) {
        const data = await res.json();
        const activeOnly = (data.templates || []).filter((t: SignatureTemplate) => t.is_active);
        setTemplates(activeOnly);
        if (activeOnly.length > 0) {
          setSelectedTemplate(activeOnly[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError('Falha ao carregar modelos de assinatura.');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchPreview = async (template: SignatureTemplate) => {
    setSelectedTemplate(template);
    setPreviewing(true);
    setError(null);

    try {
      // Calls Read-Only Preview endpoint (Zero DB side effects, Zero Idempotency consumption)
      const res = await fetch('/api/signature-requests/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          signature_template_id: template.id,
          deal_id: selectedDealId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao gerar pré-visualização.');
      }

      setPreviewResult({
        isValid: data.is_valid,
        blockReason: data.block_reason,
        missingFields: data.missing_fields,
        signatory: data.signatory,
        totalMappings: data.total_mappings,
        filledCount: data.filled_variables_count,
        nonApplicableCount: data.non_applicable_variables_count,
        variablesCount: data.variables_count,
        instructionMessage: data.instruction_message,
      });
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Erro ao pré-visualizar solicitação.');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Conferência e Pré-visualização do Documento
          </DialogTitle>
          <DialogDescription>
            Confira o signatário e as variáveis do modelo sem gerar efeitos ou chamadas externas.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-2">
            {deals.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Vincular Negócio (Opcional)</label>
                <select
                  className="w-full border rounded h-8 text-xs bg-background px-2"
                  value={selectedDealId}
                  onChange={(e) => setSelectedDealId(e.target.value)}
                >
                  <option value="">Nenhum negócio selecionado</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando modelos...
              </div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-center border border-dashed rounded-lg text-muted-foreground space-y-2">
                <ShieldAlert className="w-8 h-8 mx-auto opacity-50 text-amber-500" />
                <p className="text-sm font-medium">Nenhum modelo de assinatura ativo cadastrado.</p>
                <p className="text-xs">Cadastre e ative modelos em Configurações &gt; ZapSign.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selecione o Modelo de Documento para Pré-visualizar
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => handleFetchPreview(tpl)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedTemplate?.id === tpl.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{tpl.template_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {tpl.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-primary" /> Clique para conferir dados e variáveis
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && selectedTemplate && (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded bg-muted/40 text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground">Modelo: {selectedTemplate.template_name}</span>
                <p className="text-muted-foreground text-[11px]">ID Externo: {selectedTemplate.template_id}</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Pré-visualização (Somente Leitura)
              </Badge>
            </div>

            {/* Signatory Preview */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">Resultado da Conferência</span>
              {!previewResult?.isValid ? (
                <div className="p-3 rounded border border-destructive/50 bg-destructive/5 text-destructive text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Geração Bloqueada - Dados Incompletos no CRM
                  </div>
                  <p>{previewResult?.blockReason}</p>
                  {previewResult?.missingFields && previewResult.missingFields.length > 0 && (
                    <div className="font-mono bg-destructive/10 p-2 rounded text-[11px]">
                      Campos ausentes: {previewResult.missingFields.join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded border bg-card text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                    <UserCheck className="w-4 h-4" />
                    {previewResult.signatory?.signatory_type === 'contact'
                      ? 'Signatário: Paciente Adulto (Próprio Contato)'
                      : 'Signatário: Responsável Legal (Paciente Menor)'}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                    <div>
                      Nome: <strong className="text-foreground">{previewResult.signatory?.name}</strong>
                    </div>
                    <div>
                      CPF: <strong className="text-foreground">{maskCpf(previewResult.signatory?.cpf)}</strong>
                    </div>
                    <div>
                      RG: <strong className="text-foreground">{maskRg(previewResult.signatory?.rg)}</strong>
                    </div>
                    <div>
                      Telefone:{' '}
                      <strong className="text-foreground">{maskPhone(previewResult.signatory?.phone)}</strong>
                    </div>
                    <div className="col-span-2">
                      E-mail:{' '}
                      <strong className="text-foreground">{maskEmail(previewResult.signatory?.email)}</strong>
                    </div>
                  </div>

                  {/* Variable Mappings Breakdown */}
                  <div className="border-t pt-2 mt-2 text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded space-y-1">
                    <div className="flex items-center justify-between font-medium text-foreground">
                      <span>Mapeamentos avaliados: <strong>{previewResult.totalMappings || 16}</strong></span>
                      <Badge variant="outline" className="text-emerald-600 border-emerald-600/40 text-[10px]">
                        Pronto para Assinatura Real (Fase 2B)
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div>Preenchidos: <strong className="text-emerald-600">{previewResult.filledCount ?? previewResult.variablesCount}</strong></div>
                      <div>Não aplicáveis: <strong className="text-amber-600">{previewResult.nonApplicableCount ?? 0}</strong></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Instruction Message Preview */}
            {previewResult?.instructionMessage && (
              <div className="space-y-1 border-t pt-3">
                <label className="text-xs font-semibold text-muted-foreground">Modelo de Mensagem Orientativa</label>
                <textarea
                  rows={4}
                  readOnly
                  className="w-full text-xs font-mono border rounded p-2 bg-muted/20 focus:outline-none"
                  value={previewResult.instructionMessage}
                />
              </div>
            )}

            {/* Production Block Warning */}
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                As chamadas reais para a ZapSign estão bloqueadas até a configuração das credenciais de produção (Fase 2B).
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Lock className="w-3.5 h-3.5 text-primary" />
              Nenhum registro foi criado no banco de dados durante esta pré-visualização.
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 flex justify-between">
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} className="w-full">
              Voltar aos Modelos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
