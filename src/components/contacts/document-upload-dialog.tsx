'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UploadCloud } from 'lucide-react';
import type { Deal } from '@/types';

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  deals?: Deal[];
  onSuccess: () => void;
}

export const DOCUMENT_TYPES = [
  { value: 'receita_medica', label: 'Receita Médica' },
  { value: 'documento_identificacao', label: 'Documento de Identificação' },
  { value: 'comprovante_residencia', label: 'Comprovante de Residência' },
  { value: 'documento_responsavel_legal', label: 'Documento do Responsável Legal' },
  { value: 'procuracao', label: 'Procuração' },
  { value: 'autorizacao_externa', label: 'Autorização Externa' },
  { value: 'outros', label: 'Outros' },
];

export function DocumentUploadDialog({
  open,
  onOpenChange,
  contactId,
  deals = [],
  onSuccess,
}: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('outros');
  const [displayName, setDisplayName] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [dealId, setDealId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    if (selected && !displayName) {
      // Auto-fill display name without extension
      const nameWithoutExt = selected.name.replace(/\.[^/.]+$/, '');
      setDisplayName(nameWithoutExt);
    }
  }

  async function handleUpload() {
    if (!file) {
      toast.error('Selecione um arquivo para enviar');
      return;
    }

    if (!contactId) {
      toast.error('Contato inválido');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('contact_id', contactId);
      formData.append('document_type', documentType);
      formData.append('display_name', displayName.trim() || file.name);
      if (validUntil) formData.append('valid_until', validUntil);
      if (dealId) formData.append('deal_id', dealId);
      if (notes.trim()) formData.append('notes', notes.trim());

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao enviar documento');
      }

      toast.success('Documento enviado com sucesso');
      onOpenChange(false);
      // Reset form
      setFile(null);
      setDisplayName('');
      setValidUntil('');
      setDealId('');
      setNotes('');
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Adicionar Documento</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Envie um documento privado para o perfil deste contato. Arquivos suportados: PDF, Imagens, Word e Texto (máx. 50 MB).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          {/* File Picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Arquivo <span className="text-red-400">*</span>
            </Label>
            <Input
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
              className="bg-muted border-border text-foreground text-xs cursor-pointer"
            />
          </div>

          {/* Document Type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo de Documento</Label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full rounded-md bg-muted border border-border px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome de Exibição</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Carteira de Identidade - Frente e Verso"
              className="bg-muted border-border text-foreground h-8 text-xs placeholder:text-muted-foreground"
            />
          </div>

          {/* Validity Date */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Data de Validade (opcional)</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="bg-muted border-border text-foreground h-8 text-xs"
            />
          </div>

          {/* Linked Deal */}
          {deals.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vincular a um Negócio (opcional)</Label>
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className="w-full rounded-md bg-muted border border-border px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Nenhum negócio vinculado</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações internas sobre o documento..."
              className="bg-muted border-border text-foreground min-h-[60px] text-xs resize-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
            className="border-border text-foreground"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <UploadCloud className="size-3.5 mr-1.5" />
            )}
            Enviar Documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
