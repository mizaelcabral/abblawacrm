'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import type { CustomField } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';

interface CustomFieldsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DEFAULT_GROUPS = [
  'Dados pessoais',
  'Endereço',
  'Responsável legal',
  'Dados Gerais',
];

export const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'date', label: 'Data' },
  { value: 'boolean', label: 'Booleano (Sim/Não)' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'select', label: 'Seleção' },
];

function slugifyKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Dialog wrapper around {@link CustomFieldsPanel}, used on the Contacts page.
 */
export function CustomFieldsManager({
  open,
  onOpenChange,
}: CustomFieldsManagerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Campos personalizados</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Defina grupos e campos complementares para contatos (ex: CPF, Endereço, Responsável legal).
          </DialogDescription>
        </DialogHeader>
        <CustomFieldsPanel />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Create / rename / update group / toggle active / delete custom contact fields.
 */
export function CustomFieldsPanel() {
  const supabase = createClient();
  const { user, accountId } = useAuth();

  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('Dados pessoais');
  const [newType, setNewType] = useState('text');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchFields = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .order('group_name', { ascending: true })
      .order('display_order', { ascending: true })
      .order('field_name', { ascending: true });
    setFields((data as CustomField[] | null) ?? []);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    if (accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchFields();
    }
  }, [accountId, fetchFields]);

  function isDuplicate(name: string, exceptId?: string): boolean {
    const lower = name.toLowerCase();
    return fields.some(
      (f) => f.id !== exceptId && f.field_name.toLowerCase() === lower
    );
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    if (!accountId || !user) {
      toast.error('Seu perfil não está vinculado a uma conta.');
      return;
    }
    if (isDuplicate(name)) {
      toast.error(`Um campo chamado "${name}" já existe.`);
      return;
    }

    setCreating(true);
    const fieldKey = slugifyKey(name);

    const { error } = await supabase.from('custom_fields').insert({
      field_name: name,
      field_key: fieldKey,
      group_name: newGroup.trim() || 'Dados Gerais',
      field_type: newType,
      is_active: true,
      user_id: user.id,
      account_id: accountId,
    });
    setCreating(false);

    if (error) {
      toast.error('Não foi possível criar o campo. Você pode não ter permissão.');
      return;
    }
    toast.success(`Campo "${name}" criado com sucesso.`);
    setNewName('');
    await fetchFields();
  }

  async function handleToggleActive(field: CustomField) {
    setBusyId(field.id);
    const nextState = !field.is_active;
    const { error } = await supabase
      .from('custom_fields')
      .update({ is_active: nextState })
      .eq('id', field.id);
    setBusyId(null);

    if (error) {
      toast.error('Não foi possível alterar o status do campo.');
      return;
    }
    toast.success(
      nextState ? `Campo "${field.field_name}" ativado.` : `Campo "${field.field_name}" desativado (valores preservados).`
    );
    await fetchFields();
  }

  async function handleDelete(field: CustomField) {
    if (
      !window.confirm(
        `Excluir "${field.field_name}"? Isso também removerá o valor salvo deste campo em todos os contatos. Para preservar o histórico, prefira desativar o campo.`
      )
    ) {
      return;
    }
    setBusyId(field.id);
    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', field.id);
    setBusyId(null);
    if (error) {
      toast.error('Não foi possível excluir o campo.');
      return;
    }
    toast.success(`Campo "${field.field_name}" excluído.`);
    await fetchFields();
  }

  // Group fields for rendering
  const groupedFields: Record<string, CustomField[]> = {};
  fields.forEach((f) => {
    const group = f.group_name || 'Dados Gerais';
    if (!groupedFields[group]) groupedFields[group] = [];
    groupedFields[group].push(f);
  });

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2.5">
        <p className="text-xs font-medium text-foreground">Novo campo personalizado</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">Nome do campo</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: CPF, CEP, Nome do Responsável"
              className="bg-muted text-foreground h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground">Grupo</Label>
            <Input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Ex: Dados pessoais, Endereço"
              className="bg-muted text-foreground h-8 text-xs"
              list="group-suggestions"
            />
            <datalist id="group-suggestions">
              {DEFAULT_GROUPS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground">Tipo de dado</Label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full h-8 rounded-md bg-muted border border-border px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto text-xs h-7"
        >
          {creating ? (
            <Loader2 className="size-3.5 animate-spin mr-1" />
          ) : (
            <Plus className="size-3.5 mr-1" />
          )}
          Adicionar Campo
        </Button>
      </div>

      {/* List grouped */}
      <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando campos...
          </div>
        ) : fields.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nenhum campo personalizado cadastrado.
          </p>
        ) : (
          Object.entries(groupedFields).map(([groupName, groupList]) => (
            <div key={groupName} className="rounded-md border border-border bg-card overflow-hidden">
              <div className="bg-muted/70 px-3 py-1.5 border-b border-border font-medium text-xs text-foreground">
                {groupName} ({groupList.length})
              </div>
              <ul className="divide-y divide-border">
                {groupList.map((field) => (
                  <li key={field.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-medium truncate ${field.is_active === false ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {field.field_name}
                      </span>
                      <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                        {FIELD_TYPES.find((t) => t.value === field.field_type)?.label || field.field_type}
                      </span>
                      {field.is_active === false && (
                        <span className="text-[10px] rounded px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                          Inativo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === field.id}
                        onClick={() => handleToggleActive(field)}
                        title={field.is_active !== false ? 'Desativar campo' : 'Ativar campo'}
                        className="h-7 text-[11px] px-2"
                      >
                        {field.is_active !== false ? (
                          <span className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <CheckCircle2 className="size-3.5 text-primary" /> Ativo
                          </span>
                        ) : (
                          <span className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <XCircle className="size-3.5 text-muted-foreground" /> Inativo
                          </span>
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busyId === field.id}
                        onClick={() => handleDelete(field)}
                        title="Excluir campo"
                        className="h-7 size-7 text-muted-foreground hover:text-red-400"
                      >
                        {busyId === field.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
