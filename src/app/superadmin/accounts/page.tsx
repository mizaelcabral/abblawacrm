'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Loader2, Search, Edit2, Trash2, Key, CheckCircle, XCircle, ShieldAlert, Sparkles, DollarSign, Cpu
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
  ai_provider: string | null;
  ai_model: string | null;
  ai_api_url: string | null;
  has_ai_key?: boolean;
  is_lifetime?: boolean;
  lifetime_has_ai?: boolean;
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
  const [editProvider, setEditProvider] = useState('gemini');
  const [editModel, setEditModel] = useState('gemini-1.5-flash');
  const [editApiKey, setEditApiKey] = useState('');
  const [editApiUrl, setEditApiUrl] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [editIsLifetime, setEditIsLifetime] = useState(false);
  const [editLifetimeHasAi, setEditLifetimeHasAi] = useState(true);
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
    setEditProvider(acc.ai_provider || 'gemini');
    setEditModel(acc.ai_model || 'gemini-1.5-flash');
    setEditApiKey(acc.has_ai_key ? '••••••••' : '');
    setEditApiUrl(acc.ai_api_url || '');
    setClearApiKey(false);
    setEditIsLifetime(acc.is_lifetime || false);
    setEditLifetimeHasAi(acc.lifetime_has_ai !== false);
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
          ai_provider: editProvider,
          ai_model: editModel,
          ai_api_key: clearApiKey ? null : (editApiKey === '••••••••' ? undefined : editApiKey),
          ai_api_url: editApiUrl || null,
          is_lifetime: editIsLifetime,
          lifetime_has_ai: editLifetimeHasAi,
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

  // ponytail: calculate AI cost based on model/provider if they use general platform keys
  const calculateAICost = (acc: Account) => {
    if (acc.has_ai_key) return 0; // Chave própria não custa nada para a plataforma

    const model = (acc.ai_model || '').toLowerCase();
    const provider = (acc.ai_provider || '').toLowerCase();

    let costPerMessage = 0.004; // padrão R$ 0,004 por msg

    if (model.includes('flash') || provider === 'gemini') {
      costPerMessage = 0.002; // Gemini 1.5 Flash
    } else if (model.includes('mini') || provider === 'openai') {
      costPerMessage = 0.003; // GPT-4o Mini
    } else if (model.includes('haiku') || provider === 'anthropic') {
      costPerMessage = 0.006; // Claude Haiku
    }

    return acc.ai_message_count * costPerMessage;
  };

  const aiStats = useMemo(() => {
    let totalCostGeneral = 0;
    let totalMessagesGeneral = 0;
    let accountsUsingGeneral = 0;
    let accountsUsingOwn = 0;

    accounts.forEach((acc) => {
      if (acc.has_ai_key) {
        accountsUsingOwn++;
      } else {
        accountsUsingGeneral++;
        totalCostGeneral += calculateAICost(acc);
        totalMessagesGeneral += acc.ai_message_count;
      }
    });

    return {
      totalCostGeneral,
      totalMessagesGeneral,
      accountsUsingGeneral,
      accountsUsingOwn,
    };
  }, [accounts]);

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

      {/* ponytail: metric cards for AI consumption costs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Custo Estimado (Chave Geral)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              R$ {aiStats.totalCostGeneral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Gasto com chaves compartilhadas da plataforma.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Mensagens da Chave Geral
            </CardTitle>
            <Cpu className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {aiStats.totalMessagesGeneral.toLocaleString('pt-BR')}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Total de interações sob a chave padrão.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Origem das API Keys
            </CardTitle>
            <Key className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground flex items-baseline gap-2">
              <span>{aiStats.accountsUsingOwn} <span className="text-xs text-muted-foreground font-normal">Própria</span></span>
              <span className="text-muted-foreground text-sm">/</span>
              <span>{aiStats.accountsUsingGeneral} <span className="text-xs text-muted-foreground font-normal">Geral</span></span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Divisão de custos por inquilino.
            </p>
          </CardContent>
        </Card>
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
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start">
                            {getStatusBadge(acc.is_lifetime ? 'active' : acc.subscription_status)}
                            {acc.is_lifetime && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider">
                                Lifetime {acc.lifetime_has_ai ? '+ IA' : 'S/ IA'}
                              </span>
                            )}
                          </div>
                        </td>
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
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start text-xs">
                            <span className="font-semibold text-foreground">
                              {acc.ai_message_count} / {acc.ai_message_limit ?? 'Plano'}
                            </span>
                            {acc.has_ai_key ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                Chave Própria
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 uppercase tracking-wider">
                                Chave Geral
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {acc.has_ai_key ? (
                                'R$ 0,00'
                              ) : (
                                <>Est. <span className="text-red-400">R$ {calculateAICost(acc).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></>
                              )}
                            </span>
                          </div>
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

              {/* ponytail: Simple switches/checkboxes for lifetime status and lifetime AI rules */}
              <div className="border-t border-border pt-4 mt-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" /> Conta Vitalícia
                </h4>
                
                <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="isLifetime" className="text-xs font-semibold text-foreground cursor-pointer">Definir como Lifetime</Label>
                    <p className="text-[10px] text-muted-foreground">Bypassa expiração de trial e inadimplência do Stripe.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="isLifetime"
                    checked={editIsLifetime}
                    onChange={(e) => setEditIsLifetime(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary bg-muted"
                  />
                </div>

                {editIsLifetime && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/20 p-3 bg-primary/5 animate-in slide-in-from-top-1 duration-200">
                    <div className="space-y-0.5">
                      <Label htmlFor="lifetimeHasAi" className="text-xs font-semibold text-foreground cursor-pointer">Permitir recursos de IA</Label>
                      <p className="text-[10px] text-muted-foreground">Define se a conta vitalícia tem permissão para usar IA.</p>
                    </div>
                    <input
                      type="checkbox"
                      id="lifetimeHasAi"
                      checked={editLifetimeHasAi}
                      onChange={(e) => setEditLifetimeHasAi(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary bg-muted"
                    />
                  </div>
                )}
              </div>

              {/* AI Provider Config */}
              <div className="border-t border-border pt-4 mt-4 space-y-4">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="h-4 w-4 text-primary" /> Configuração do LLM (IA)
                </h4>

                <div className="space-y-1.5">
                  <Label htmlFor="aiProvider" className="text-xs font-semibold text-muted-foreground uppercase">Provedor de IA</Label>
                  <select
                    id="aiProvider"
                    value={editProvider}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditProvider(val);
                      if (val === 'gemini') setEditModel('gemini-1.5-flash');
                      else if (val === 'openai') setEditModel('gpt-4o-mini');
                      else if (val === 'anthropic') setEditModel('claude-3-5-haiku-20241022');
                      else if (val === 'openrouter') setEditModel('google/gemini-flash-1.5');
                    }}
                    className="w-full rounded-md border border-border bg-muted p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="aiModel" className="text-xs font-semibold text-muted-foreground uppercase">Modelo</Label>
                  <Input
                    id="aiModel"
                    type="text"
                    placeholder="Ex: gemini-1.5-flash"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="bg-muted border-border text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="aiApiKey" className="text-xs font-semibold text-muted-foreground uppercase">Chave de API</Label>
                  <Input
                    id="aiApiKey"
                    type="password"
                    placeholder={editingAccount.has_ai_key ? "Manter chave existente (••••••••)" : "Digite a nova chave de API"}
                    value={editApiKey === '••••••••' ? '' : editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    disabled={clearApiKey}
                    className="bg-muted border-border text-sm"
                  />
                  {editingAccount.has_ai_key && (
                    <>
                      <span className="text-[10px] text-emerald-400">
                        Chave configurada. Deixe vazio para manter a atual ou limpe/substitua para atualizar.
                      </span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="checkbox"
                          id="clearApiKey"
                          checked={clearApiKey}
                          onChange={(e) => setClearApiKey(e.target.checked)}
                          className="rounded border-border text-primary focus:ring-primary bg-muted"
                        />
                        <Label htmlFor="clearApiKey" className="text-xs text-red-400 cursor-pointer">
                          Remover chave de API existente do banco de dados
                        </Label>
                      </div>
                    </>
                  )}
                </div>

                {(editProvider === 'openai' || editProvider === 'openrouter') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="aiApiUrl" className="text-xs font-semibold text-muted-foreground uppercase">URL Base da API (Opcional)</Label>
                    <Input
                      id="aiApiUrl"
                      type="text"
                      placeholder={editProvider === 'openrouter' ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"}
                      value={editApiUrl}
                      onChange={(e) => setEditApiUrl(e.target.value)}
                      className="bg-muted border-border text-sm"
                    />
                  </div>
                )}
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
