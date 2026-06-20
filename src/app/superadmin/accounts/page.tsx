'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Loader2, Search, Edit2, Trash2, Key, CheckCircle, XCircle, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string;
  account_role: string;
}

interface WhatsAppConfig {
  phone_number_id: string | null;
}

interface Account {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  subscription_status: string;
  subscription_plan: string;
  ai_message_limit: number | null;
  ai_message_count: number;
  profiles: Profile[];
  whatsapp_config: WhatsAppConfig | null;
}

export default function SuperAdminAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal states
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editLimit, setEditLimit] = useState(0);
  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/superadmin/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      } else {
        toast.error('Erro ao carregar a lista de inquilinos.');
      }
    } catch (err) {
      toast.error('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleEdit = (acc: Account) => {
    setEditingAccount(acc);
    setEditPlan(acc.subscription_plan);
    setEditStatus(acc.subscription_status);
    setEditLimit(acc.ai_message_limit ?? 0);
  };

  const handleSave = async () => {
    if (!editingAccount) return;

    try {
      setSaving(true);
      const res = await fetch('/api/superadmin/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccount.id,
          subscription_plan: editPlan,
          subscription_status: editStatus,
          ai_message_limit: editLimit || null,
        }),
      });

      if (res.ok) {
        toast.success('Conta atualizada com sucesso!');
        setEditingAccount(null);
        fetchAccounts();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Falha ao atualizar conta.');
      }
    } catch (err) {
      toast.error('Erro de conexão ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`ATENÇÃO PERIGO! Deseja realmente DELETAR a conta "${name}" permanentemente? Todos os dados (mensagens, contatos, configurações) serão excluídos para sempre.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/superadmin/accounts?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Conta excluída com sucesso.');
        fetchAccounts();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Falha ao excluir conta.');
      }
    } catch (err) {
      toast.error('Erro de conexão ao deletar.');
    }
  };

  // Filter accounts in memory
  const filteredAccounts = accounts.filter((acc) => {
    const term = search.toLowerCase();
    const matchesName = acc.name?.toLowerCase().includes(term);
    const owner = acc.profiles.find((p) => p.account_role === 'owner' || p.user_id === acc.owner_user_id);
    const matchesOwnerName = owner?.full_name?.toLowerCase().includes(term);
    const matchesOwnerEmail = owner?.email?.toLowerCase().includes(term);
    return matchesName || matchesOwnerName || matchesOwnerEmail;
  });

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'scale':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Scale</span>;
      case 'pro':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Pro</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Starter</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ativo</span>;
      case 'past_due':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Pendente</span>;
      case 'canceled':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Cancelado</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Gerenciamento de Contas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lista e controle de todas as instâncias de inquilinos registradas no SaaS.
        </p>
      </div>

      {/* Control bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por conta, proprietário ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
      </div>

      {/* Accounts List */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma conta encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase">
                    <th className="p-4">Conta</th>
                    <th className="p-4">Proprietário</th>
                    <th className="p-4">Plano</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">WhatsApp</th>
                    <th className="p-4">Uso de IA</th>
                    <th className="p-4">Criado em</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((acc) => {
                    const owner = acc.profiles.find((p) => p.account_role === 'owner' || p.user_id === acc.owner_user_id);
                    const whatsappConnected = acc.whatsapp_config && !!acc.whatsapp_config.phone_number_id;
                    return (
                      <tr key={acc.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                        <td className="p-4 font-semibold text-foreground">{acc.name || 'Sem nome'}</td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-foreground font-medium">{owner?.full_name || 'Desconhecido'}</span>
                            <span className="text-xs text-muted-foreground">{owner?.email || '-'}</span>
                          </div>
                        </td>
                        <td className="p-4">{getPlanBadge(acc.subscription_plan)}</td>
                        <td className="p-4">{getStatusBadge(acc.subscription_status)}</td>
                        <td className="p-4">
                          {whatsappConnected ? (
                            <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                              <CheckCircle className="h-3.5 w-3.5 animate-in fade-in" /> Conectado
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <XCircle className="h-3.5 w-3.5 animate-in fade-in" /> Desconectado
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {acc.ai_message_count} / {acc.ai_message_limit ?? 'Plano'}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {new Date(acc.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(acc)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(acc.id, acc.name)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-200">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Editar Assinatura</h3>
                <p className="text-xs text-muted-foreground">{editingAccount.name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan" className="text-xs font-semibold text-muted-foreground uppercase">Plano</Label>
                <select
                  id="plan"
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="starter">Starter (R$ 97/mês)</option>
                  <option value="pro">Pro (R$ 249/mês)</option>
                  <option value="scale">Scale (R$ 497/mês)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-xs font-semibold text-muted-foreground uppercase">Status</Label>
                <select
                  id="status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="active">Ativo (Pago)</option>
                  <option value="past_due">Pendente (Vencido)</option>
                  <option value="canceled">Cancelado (Suspenso)</option>
                  <option value="unpaid">Não Pago (Bloqueado)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="limit" className="text-xs font-semibold text-muted-foreground uppercase">
                  Limite de Mensagens IA (0 = usar limite do plano)
                </Label>
                <Input
                  id="limit"
                  type="number"
                  value={editLimit}
                  onChange={(e) => setEditLimit(Number(e.target.value))}
                  className="bg-muted border-border"
                />
              </div>

              {editStatus === 'canceled' && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  <div className="flex gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      Mudar o status para cancelado bloqueará a utilização dos recursos de IA e mensagens de automação deste inquilino no CRM.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setEditingAccount(null)} className="border-border">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Alterações'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
