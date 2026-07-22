'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  MessageSquare,
  Plus,
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  Globe,
  Settings2,
  Eye,
  Code2,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WidgetConfig {
  id: string;
  account_id: string;
  name: string;
  widget_key: string;
  primary_color: string;
  title: string;
  subtitle: string;
  welcome_message: string;
  position: 'bottom_right' | 'bottom_left';
  require_lead_info: boolean;
  ask_name: boolean;
  ask_email: boolean;
  ask_phone: boolean;
  ai_auto_respond: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function WidgetsSettingsPage() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form State for New Widget
  const [name, setName] = useState('Widget do Site');
  const [primaryColor, setPrimaryColor] = useState('#0F172A');
  const [title, setTitle] = useState('Atendimento Online');
  const [subtitle, setSubtitle] = useState('Como podemos ajudar você hoje?');
  const [welcomeMessage, setWelcomeMessage] = useState('Olá! Seja bem-vindo ao nosso site.');
  const [position, setPosition] = useState<'bottom_right' | 'bottom_left'>('bottom_right');
  const [requireLeadInfo, setRequireLeadInfo] = useState(false);
  const [aiAutoRespond, setAiAutoRespond] = useState(false);

  const fetchWidgets = async () => {
    try {
      const res = await fetch('/api/account/widgets');
      if (res.ok) {
        const data = await res.json();
        setWidgets(data.widgets || []);
      } else {
        toast.error('Falha ao carregar widgets');
      }
    } catch (err) {
      console.error('Failed to load widgets:', err);
      toast.error('Erro de conexão ao buscar widgets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWidgets();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch('/api/account/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          primary_color: primaryColor,
          title,
          subtitle,
          welcome_message: welcomeMessage,
          position,
          require_lead_info: requireLeadInfo,
          ai_auto_respond: aiAutoRespond,
        }),
      });

      const data = await res.json();
      if (res.ok && data.widget) {
        setWidgets((prev) => [data.widget, ...prev]);
        setShowCreateModal(false);
        toast.success('Widget de Chat criado com sucesso!');
        // Reset form defaults
        setName('Widget do Site');
        setPrimaryColor('#0F172A');
        setTitle('Atendimento Online');
        setSubtitle('Como podemos ajudar você hoje?');
        setWelcomeMessage('Olá! Seja bem-vindo ao nosso site.');
        setPosition('bottom_right');
        setRequireLeadInfo(false);
        setAiAutoRespond(false);
      } else {
        toast.error(data.error || 'Falha ao criar widget');
      }
    } catch (err) {
      toast.error('Erro de conexão ao criar widget');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (widget: WidgetConfig) => {
    const nextState = !widget.is_active;

    // Optimistic Update
    setWidgets((prev) =>
      prev.map((w) => (w.id === widget.id ? { ...w, is_active: nextState } : w))
    );

    try {
      const res = await fetch('/api/account/widgets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: widget.id, is_active: nextState }),
      });

      if (!res.ok) {
        // Revert on failure
        setWidgets((prev) =>
          prev.map((w) => (w.id === widget.id ? { ...w, is_active: widget.is_active } : w))
        );
        toast.error('Falha ao atualizar status do widget');
      } else {
        toast.success(`Widget ${nextState ? 'ativado' : 'desativado'} com sucesso!`);
      }
    } catch (err) {
      setWidgets((prev) =>
        prev.map((w) => (w.id === widget.id ? { ...w, is_active: widget.is_active } : w))
      );
      toast.error('Erro ao comunicar com o servidor');
    }
  };

  const getSnippet = (widgetKey: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://seu-dominio.com';
    return `<script src="${origin}/widget.js" data-widget-id="${widgetKey}" async></script>`;
  };

  const handleCopySnippet = (widgetKey: string) => {
    const snippet = getSnippet(widgetKey);
    navigator.clipboard.writeText(snippet);
    setCopiedKey(widgetKey);
    toast.success('Código do widget copiado para a área de transferência!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted transition"
              title="Voltar às Configurações"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              Widgets de Chat no Site
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Instale o chat ao vivo em seus sites externos e atenda visitantes em tempo real através do Inbox do CRM.
          </p>
        </div>

        <Button onClick={() => setShowCreateModal(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Novo Widget
        </Button>
      </div>

      {/* Widgets List */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Seus Widgets Configurados</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground">
            Gerencie os snippets de chat ativos, personalize cores e mensagens de boas-vindas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">Nenhum widget encontrado</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Crie seu primeiro widget de chat para integrar o atendimento ao vivo do CRM no seu site.
              </p>
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeiro Widget
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {widgets.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4 transition hover:border-primary/30"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-4 w-4 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: w.primary_color }}
                        title={`Cor Primária: ${w.primary_color}`}
                      />
                      <div>
                        <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                          {w.name}
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              w.is_active
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                            }`}
                          >
                            {w.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono">
                          ID: {w.widget_key}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`toggle-${w.id}`} className="text-xs text-muted-foreground cursor-pointer">
                          {w.is_active ? 'Ativo' : 'Desativado'}
                        </Label>
                        <Switch
                          id={`toggle-${w.id}`}
                          checked={w.is_active}
                          onCheckedChange={() => handleToggleActive(w)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Settings Breakdown */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground block">Título do Chat:</span>
                      {w.title}
                    </div>
                    <div>
                      <span className="font-medium text-foreground block">Subtítulo:</span>
                      {w.subtitle}
                    </div>
                    <div>
                      <span className="font-medium text-foreground block">Captura de Lead:</span>
                      {w.require_lead_info ? 'Obrigatória (Nome/Email)' : 'Opcional / Direto'}
                    </div>
                    <div>
                      <span className="font-medium text-foreground block">Posição na Tela:</span>
                      {w.position === 'bottom_right' ? 'Canto Inferior Direito' : 'Canto Inferior Esquerdo'}
                    </div>
                  </div>

                  {/* Embed Snippet Box */}
                  <div className="space-y-1.5 pt-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5 text-primary" />
                      Código de Incorporação (Script Tag HTML)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={getSnippet(w.widget_key)}
                        className="font-mono bg-muted text-xs border-border select-all"
                      />
                      <Button
                        onClick={() => handleCopySnippet(w.widget_key)}
                        size="icon"
                        variant="secondary"
                        className="shrink-0"
                        title="Copiar Código HTML"
                      >
                        {copiedKey === w.widget_key ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Copie e cole este código antes da tag <code className="text-foreground font-mono">&lt;/body&gt;</code> do seu site ou e-commerce.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Widget Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-6 my-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Novo Widget do Site</h3>
                  <p className="text-xs text-muted-foreground">Configure a aparência e comportamentos do chat.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </Button>
            </div>

            <form onSubmit={handleCreate} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="w-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nome Identificador Interno
                  </Label>
                  <Input
                    id="w-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Landing Page Principal, E-commerce"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="w-color" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cor Primária
                  </Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="w-color-picker"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-12 p-1 cursor-pointer bg-transparent border-border shrink-0"
                    />
                    <Input
                      id="w-color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#0F172A"
                      className="font-mono text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="w-position" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Posição do Widget
                  </Label>
                  <Select
                    value={position}
                    onValueChange={(val) => {
                      if (val) setPosition(val as 'bottom_right' | 'bottom_left');
                    }}
                  >
                    <SelectTrigger id="w-position">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom_right">Canto Inferior Direito</SelectItem>
                      <SelectItem value="bottom_left">Canto Inferior Esquerdo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="w-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Título no Cabeçalho
                  </Label>
                  <Input
                    id="w-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Atendimento Online"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="w-subtitle" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Subtítulo no Cabeçalho
                  </Label>
                  <Input
                    id="w-subtitle"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Ex: Como podemos ajudar você hoje?"
                    required
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="w-welcome" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mensagem de Boas-Vindas Inicial
                  </Label>
                  <Textarea
                    id="w-welcome"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="Ex: Olá! Seja bem-vindo ao nosso site. Como posso ajudar?"
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="w-lead" className="text-sm font-medium text-foreground cursor-pointer">
                      Exigir Dados do Visitante (Lead Capture)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Exige Nome e E-mail do visitante antes de enviar a primeira mensagem.
                    </p>
                  </div>
                  <Switch
                    id="w-lead"
                    checked={requireLeadInfo}
                    onCheckedChange={setRequireLeadInfo}
                  />
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  Pré-visualização do Widget
                </div>
                <div className="max-w-xs mx-auto rounded-xl shadow-lg border border-border overflow-hidden bg-background">
                  <div
                    className="p-3 text-white flex items-center justify-between"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <div>
                      <h4 className="font-bold text-sm">{title || 'Atendimento Online'}</h4>
                      <p className="text-[11px] opacity-80">{subtitle || 'Como podemos ajudar?'}</p>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 text-xs bg-slate-50 dark:bg-slate-900 min-h-[90px]">
                    {welcomeMessage && (
                      <div className="rounded-xl rounded-tl-none bg-white dark:bg-slate-800 p-2 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 max-w-[85%]">
                        {welcomeMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar e Criar Widget
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
