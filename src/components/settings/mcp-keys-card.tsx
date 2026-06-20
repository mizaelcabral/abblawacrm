'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Info,
  Shield,
  ShieldAlert,
  ArrowUpCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';

interface McpKey {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export function McpKeysCard() {
  const { account } = useAuth();
  const plan = account?.subscription_plan || 'starter';
  const isScale = plan === 'scale';

  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Raw key from generation
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      // Avoid fetching keys if not on scale plan
      if (!isScale) return;
      const res = await fetch('/api/mcp/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch (err) {
      console.error('Failed to load keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [isScale]);

  if (!isScale) {
    return (
      <Card className="border-border bg-card overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600" />
        <CardHeader className="pt-8">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-foreground">Conexão MCP (IA) — Recurso Scale</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground text-sm">
            Gere chaves de API para conectar IAs externas (como Cursor, Claude Desktop e assistentes autônomos) ao seu CRM da Abbla.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center py-10 px-6 space-y-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-inner">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-lg font-bold text-foreground">Acesso Exclusivo</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O Model Context Protocol (MCP) permite conexões externas bidirecionais super poderosas para automatizar seu funil, listar contatos e enviar mensagens usando IAs. Esse recurso está disponível exclusivamente para assinantes do plano **Scale**.
            </p>
          </div>
          <Button 
            onClick={() => {
              window.location.href = '/settings?tab=plans';
            }}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold flex items-center gap-2 px-6"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Fazer Upgrade para Scale
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setCreating(true);
      const res = await fetch('/api/mcp/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();
      if (res.ok) {
        setGeneratedKey(data.key);
        setName('');
        fetchKeys();
        toast.success('Chave de integração criada com sucesso!');
      } else {
        toast.error(data.error || 'Falha ao criar chave de integração');
      }
    } catch (err) {
      toast.error('Erro ao conectar ao servidor');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente revogar esta chave de integração? IAs que a utilizam perderão o acesso imediatamente.')) {
      return;
    }

    try {
      setDeletingId(id);
      const res = await fetch(`/api/mcp/keys?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        toast.success('Chave revogada com sucesso.');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Falha ao revogar chave');
      }
    } catch (err) {
      toast.error('Erro ao conectar ao servidor');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    toast.success('Chave copiada para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Chaves de Integração (MCP)</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground">
            Gere chaves de API para conectar IAs externas (como Cursor, Codex, Claude Desktop, etc.) ao seu espaço de trabalho na Abbla via Model Context Protocol (MCP).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Form */}
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="key-name" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Nome do Cliente / Identificador
              </Label>
              <Input
                id="key-name"
                placeholder="Ex: Cursor Mizael, Codex Servidor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
                className="bg-muted border-border"
              />
            </div>
            <Button type="submit" disabled={creating || !name.trim()} className="shrink-0 gap-1.5">
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Gerar Chave
            </Button>
          </form>

          {/* Warning banner */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
            <div className="flex gap-2">
              <Shield className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Qualquer agente de IA configurado com uma de suas chaves terá acesso total de leitura e escrita ao seu CRM (incluindo contatos, tarefas e envio de mensagens). Nunca compartilhe suas chaves.
              </p>
            </div>
          </div>

          {/* Active Keys List */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chaves Ativas
            </h3>

            {loading ? (
              <div className="flex justify-center py-6 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : keys.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhuma chave de integração ativa criada para esta conta.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-muted/30">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground uppercase">
                      <th className="p-3">Nome</th>
                      <th className="p-3">Criado em</th>
                      <th className="p-3">Último uso</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} className="border-b border-border hover:bg-muted/20">
                        <td className="p-3 font-medium text-foreground">{k.name}</td>
                        <td className="p-3 text-muted-foreground text-xs">{formatDate(k.created_at)}</td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {k.last_used_at ? formatDate(k.last_used_at) : 'Nunca usada'}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(k.id)}
                            disabled={deletingId === k.id}
                            className="h-8 w-8 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            title="Revogar chave"
                          >
                            {deletingId === k.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generated Key Modal */}
      {generatedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-200">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Nova Chave Gerada com Sucesso</h3>
                <p className="text-xs text-muted-foreground">Copie e salve sua chave agora.</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <p className="font-medium">
                    Por motivos de segurança, esta chave NÃO será exibida novamente após fechar esta janela. Se você perdê-la, terá que gerar uma nova.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  Chave de API
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={generatedKey}
                    className="font-mono bg-muted text-sm border-border select-all"
                  />
                  <Button onClick={handleCopy} size="icon" className="shrink-0">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">
                  URL do Servidor MCP (Cursor / Codex)
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/mcp?key=${generatedKey}`}
                    className="font-mono bg-muted text-xs border-border select-all"
                  />
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/mcp?key=${generatedKey}`);
                      toast.success('URL copiada!');
                    }} 
                    size="icon" 
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button onClick={() => setGeneratedKey(null)}>
                Entendi e Salvei a Chave
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
