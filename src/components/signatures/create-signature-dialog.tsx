'use client';

import { useState, useEffect } from 'react';
import {
  FileCheck,
  Loader2,
  AlertTriangle,
  Copy,
  ExternalLink,
  CheckCircle2,
  Lock,
  UserCheck,
  ShieldAlert,
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
import { resolveSignatory } from '@/lib/signatures/signatory-resolver';

interface CreateSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    custom_fields?: Record<string, any> | null;
  };
  dealId?: string | null;
}

export function CreateSignatureDialog({ open, onOpenChange, contact, dealId }: CreateSignatureDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SignatureTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [signingLink, setSigningLink] = useState<string>('');
  const [instructionMessage, setInstructionMessage] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setSelectedTemplate(null);
      setRequestId(null);
      setSigningLink('');
      setInstructionMessage('');
      fetchActiveTemplates();
    }
  }, [open]);

  const fetchActiveTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/signature-templates');
      if (res.ok) {
        const data = await res.json();
        // Only active templates for operational users
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

  // Signatory preview
  const signatoryResolution = selectedTemplate ? resolveSignatory(selectedTemplate.signatory_rule, contact) : null;

  // Masking functions for privacy
  const maskCpf = (cpf?: string) => (cpf && cpf.length >= 11 ? `${cpf.substring(0, 3)}.***.***-${cpf.substring(9)}` : '***');
  const maskPhone = (phone?: string) => (phone && phone.length >= 8 ? `(${phone.substring(0, 2)}) *****-${phone.substring(phone.length - 4)}` : '***');
  const maskEmail = (email?: string) => {
    if (!email || !email.includes('@')) return '***';
    const [name, domain] = email.split('@');
    return `${name.substring(0, 2)}***@${domain}`;
  };

  const handleCreateRequest = async () => {
    if (!selectedTemplate || !signatoryResolution || signatoryResolution.is_blocked) return;

    setSubmitting(true);
    setError(null);

    // Generate unique idempotency key
    const idempotencyKey = `idemp_${contact.id}_${selectedTemplate.id}_${Date.now()}`;

    try {
      // 1. Create Internal Signature Request
      const reqRes = await fetch('/api/signature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contact.id,
          deal_id: dealId || null,
          signature_template_id: selectedTemplate.id,
          idempotency_key: idempotencyKey,
        }),
      });

      const reqData = await reqRes.json();
      if (!reqRes.ok) {
        throw new Error(reqData.error || 'Falha ao criar solicitação de assinatura.');
      }

      const createdRequestId = reqData.request_id;
      setRequestId(createdRequestId);
      setStatus(reqData.status);

      // 2. Obtain Access Link and Instruction Message via Protected Endpoint
      const linkRes = await fetch(`/api/signature-requests/${createdRequestId}/access-link`, {
        method: 'POST',
      });

      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        throw new Error(linkData.error || 'Falha ao gerar link protegido.');
      }

      setSigningLink(linkData.signing_link);
      setInstructionMessage(linkData.instruction_message);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Erro ao processar solicitação.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, type: 'link' | 'msg') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Gerar Documento para Assinatura
          </DialogTitle>
          <DialogDescription>
            Gere a procuração e obtenha o link de assinatura exclusivo com instrução completa.
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
                  Selecione o Modelo de Documento
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl)}
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
                      <p className="text-xs text-muted-foreground mt-1">
                        Regra: {tpl.signatory_rule} | Modo: {tpl.delivery_mode}
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
            <div className="p-3 rounded bg-muted/40 text-xs space-y-1">
              <span className="font-semibold text-foreground">Modelo Selecionado:</span>
              <p>{selectedTemplate.template_name}</p>
            </div>

            {/* Signatory Preview */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">Signatário Resolvido</span>
              {signatoryResolution?.is_blocked ? (
                <div className="p-3 rounded border border-destructive/50 bg-destructive/5 text-destructive text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Geração Bloqueada - Dados Ausentes no Cadastro
                  </div>
                  <p>{signatoryResolution.block_reason}</p>
                  {signatoryResolution.missing_fields && (
                    <p className="font-mono bg-destructive/10 p-1.5 rounded">
                      Campos pendentes: {signatoryResolution.missing_fields.join(', ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded border bg-card text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                    <UserCheck className="w-4 h-4" />
                    {signatoryResolution?.signatory?.signatory_type === 'contact'
                      ? 'Paciente (Próprio Contato)'
                      : 'Responsável Legal (Menor de Idade)'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                    <div>
                      Nome: <strong className="text-foreground">{signatoryResolution?.signatory?.name}</strong>
                    </div>
                    <div>
                      CPF: <strong className="text-foreground">{maskCpf(signatoryResolution?.signatory?.cpf)}</strong>
                    </div>
                    <div>
                      Telefone:{' '}
                      <strong className="text-foreground">{maskPhone(signatoryResolution?.signatory?.phone)}</strong>
                    </div>
                    <div>
                      E-mail:{' '}
                      <strong className="text-foreground">{maskEmail(signatoryResolution?.signatory?.email)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Data Privacy Note */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t pt-2">
              <Lock className="w-3.5 h-3.5 text-primary" />
              Os dados sensíveis (CPF, RG) são mascarados na exibição para conformidade LGPD.
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold">Solicitação de Assinatura Criada!</p>
                <p className="text-[11px] opacity-90">Status: {status} | Request ID: {requestId}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Mensagem de Orientação Formata</label>
              <textarea
                rows={6}
                readOnly
                className="w-full text-xs font-mono border rounded p-2.5 bg-muted/30 focus:outline-none"
                value={instructionMessage}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Link de Assinatura Protegido</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  className="w-full text-xs font-mono border rounded px-2.5 bg-muted/50"
                  value={signingLink}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 flex justify-between">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!selectedTemplate}
                onClick={() => setStep(2)}
              >
                Conferir Dados
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button
                onClick={handleCreateRequest}
                disabled={submitting || signatoryResolution?.is_blocked}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Confirmar e Gerar Assinatura
              </Button>
            </>
          )}

          {step === 3 && (
            <div className="w-full space-y-2">
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(instructionMessage, 'msg')}
                  className="gap-1 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedMsg ? 'Mensagem Copiada!' : 'Copiar Mensagem e Link'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(signingLink, 'link')}
                  className="gap-1 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedLink ? 'Link Copiado!' : 'Copiar Somente Link'}
                </Button>

                {signingLink && (
                  <Button
                    size="sm"
                    onClick={() => window.open(signingLink, '_blank')}
                    className="gap-1 text-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Página de Assinatura
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
