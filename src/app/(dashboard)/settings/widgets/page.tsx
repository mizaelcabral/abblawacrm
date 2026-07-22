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
  Pencil,
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
import { Checkbox } from '@/components/ui/checkbox';
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

const PRESET_COLORS = [
  '#0F172A', // Slate
  '#25D366', // WhatsApp Green
  '#0084FF', // Messenger Blue
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#8B5CF6', // Purple
];

export default function WidgetsSettingsPage() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('Widget do Site');
  const [primaryColor, setPrimaryColor] = useState('#0F172A');
  const [title, setTitle] = useState('Atendimento Online');
  const [subtitle, setSubtitle] = useState('Como podemos ajudar você hoje?');
  const [welcomeMessage, setWelcomeMessage] = useState('Olá! Seja bem-vindo ao nosso site.');
  const [position, setPosition] = useState<'bottom_right' | 'bottom_left'>('bottom_right');
  const [requireLeadInfo, setRequireLeadInfo] = useState(false);
  const [askName, setAskName] = useState(true);
  const [askEmail, setAskEmail] = useState(true);
  const [askPhone, setAskPhone] = useState(true);
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

  const handleOpenCreateModal = () => {
    setEditingWidget(null);
    setName('Widget do Site');
    setPrimaryColor('#0F172A');
    setTitle('Atendimento Online');
    setSubtitle('Como podemos ajudar você hoje?');
    setWelcomeMessage('Olá! Seja bem-vindo ao nosso site.');
    setPosition('bottom_right');
    setRequireLeadInfo(false);
    setAskName(true);
    setAskEmail(true);
    setAskPhone(true);
    setAiAutoRespond(false);
    setShowModal(true);
  };

  const handleOpenEditModal = (widget: WidgetConfig) => {
    setEditingWidget(widget);
    setName(widget.name || 'Widget do Site');
    setPrimaryColor(widget.primary_color || '#0F172A');
    setTitle(widget.title || 'Atendimento Online');
    setSubtitle(widget.subtitle || 'Como podemos ajudar você hoje?');
    setWelcomeMessage(widget.welcome_message || 'Olá! Seja bem-vindo ao nosso site.');
    setPosition(widget.position || 'bottom_right');
    setRequireLeadInfo(widget.require_lead_info ?? false);
    setAskName(widget.ask_name ?? true);
    setAskEmail(widget.ask_email ?? true);
    setAskPhone(widget.ask_phone ?? true);
    setAiAutoRespond(widget.ai_auto_respond ?? false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const isEdit = !!editingWidget;
    const url = '/api/account/widgets';
    const method = isEdit ? 'PATCH' : 'POST';

    const payload: any = {
      name,
      primary_color: primaryColor,
      title,
      subtitle,
      welcome_message: welcomeMessage,
      position,
      require_lead_info: requireLeadInfo,
      ask_name: askName,
      ask_email: askEmail,
      ask_phone: askPhone,
      ai_auto_respond: aiAutoRespond,
    };

    if (isEdit) {
      payload.id = editingWidget.id;
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.widget) {
        if (isEdit) {
          setWidgets((prev) =>
            prev.map((w) => (w.id === data.widget.id ? data.widget : w))
          );
          toast.success('Widget atualizado com sucesso!');
        } else {
          setWidgets((prev) => [data.widget, ...prev]);
          toast.success('Widget de Chat criado com sucesso!');
        }
        setShowModal(false);
      } else {
        toast.error(data.error || 'Falha ao salvar widget');
      }
    } catch (err) {
      toast.error('Erro de conexão ao salvar widget');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (widget: WidgetConfig) => {
    const nextState = !widget.is_active;

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

        <Button onClick={handleOpenCreateModal} className="gap-2 shrink-0">
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
            Gerencie os snippets de chat ativos, edite cores, campos de captura e mensagens de boas-vindas.
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
              <Button onClick={handleOpenCreateModal} size="sm" className="gap-2">
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

                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditModal(w)}
                        className="gap-1.5 text-xs h-8"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>

                      <div className="flex items-center gap-2 pl-2 border-l border-border">
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
                      {w.require_lead_info
                        ? `Obrigatória (${[w.ask_name && 'Nome', w.ask_email && 'E-mail', w.ask_phone && 'WhatsApp'].filter(Boolean).join(', ')})`
                        : 'Opcional / Direto'}
                    </div>
                    <div>
                      <span className="font-medium text-foreground block">Posição na Tela:</span>
                      {w.position === 'bottom_right' ? 'Canto Inferior Direito' : 'Canto Inferior Esquerdo'}
                    </div>
                  </div>

                  {/* Snippet Code Box */}
                  <div className="space-y-1.5 bg-muted/40 rounded-lg p-3 border border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Code2 className="h-3.5 w-3.5 text-primary" />
                        CÓDIGO DE INCORPORAÇÃO (SCRIPT TAG HTML)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => handleCopySnippet(w.widget_key)}
                      >
                        {copiedKey === w.widget_key ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copiar Código
                          </>
                        )}
                      </Button>
                    </div>
                    <pre className="text-xs font-mono bg-card p-2.5 rounded border border-border overflow-x-auto text-foreground">
                      {getSnippet(w.widget_key)}
                    </pre>
                    <p className="text-[11px] text-muted-foreground">
                      Copie e cole este código antes da tag <code className="text-primary font-mono">&lt;/body&gt;</code> do seu site ou e-commerce.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal - Create & Edit Widget */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">
                  {editingWidget ? 'Editar Widget de Chat' : 'Criar Novo Widget de Chat'}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowModal(false)}
              >
                ✕
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="w-name">Nome do Widget (Identificação Interna)</Label>
                  <Input
                    id="w-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Chat do Site Institucional"
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Cor Primária do Widget</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-32 font-mono text-sm uppercase"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          className="h-6 w-6 rounded-full border border-black/10 transition hover:scale-110"
                          style={{ backgroundColor: c }}
                          onClick={() => setPrimaryColor(c)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="w-title">Título do Cabeçalho</Label>
                  <Input
                    id="w-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Atendimento Online"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="w-position">Posição na Tela</Label>
                  <Select
                    value={position}
                    onValueChange={(val) => {
                      if (val) setPosition(val as 'bottom_right' | 'bottom_left');
                    }}
                  >
                    <SelectTrigger id="w-position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom_right">Canto Inferior Direito</SelectItem>
                      <SelectItem value="bottom_left">Canto Inferior Esquerdo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="w-subtitle">Subtítulo / Descrição</Label>
                  <Input
                    id="w-subtitle"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Como podemos ajudar você hoje?"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="w-welcome">Mensagem de Boas-Vindas</Label>
                  <Textarea
                    id="w-welcome"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    rows={2}
                    placeholder="Olá! Seja bem-vindo ao nosso site."
                  />
                </div>

                <div className="space-y-4 sm:col-span-2 rounded-lg border border-border p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="w-lead" className="font-semibold text-foreground cursor-pointer">
                        Exigir Coleta de Dados do Lead
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Exibe um formulário de identificação antes de permitir o envio da primeira mensagem.
                      </p>
                    </div>
                    <Switch
                      id="w-lead"
                      checked={requireLeadInfo}
                      onCheckedChange={setRequireLeadInfo}
                    />
                  </div>

                  {requireLeadInfo && (
                    <div className="pt-3 border-t border-border space-y-3">
                      <Label className="text-xs font-semibold text-foreground">Campos Solicitados no Formulário:</Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="ask-name"
                            checked={askName}
                            onCheckedChange={(c) => setAskName(!!c)}
                          />
                          <label htmlFor="ask-name" className="text-xs font-medium cursor-pointer">
                            Nome Completo
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="ask-email"
                            checked={askEmail}
                            onCheckedChange={(c) => setAskEmail(!!c)}
                          />
                          <label htmlFor="ask-email" className="text-xs font-medium cursor-pointer">
                            E-mail
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="ask-phone"
                            checked={askPhone}
                            onCheckedChange={(c) => setAskPhone(!!c)}
                          />
                          <label htmlFor="ask-phone" className="text-xs font-medium cursor-pointer">
                            WhatsApp / Telefone
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:col-span-2 rounded-lg border border-border p-4 bg-muted/30">
                  <div>
                    <Label htmlFor="w-ai" className="font-semibold text-foreground cursor-pointer flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      IA Responde Automaticamente
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Responde dúvidas do visitante automaticamente usando a IA e a sua Base de Conhecimento.
                    </p>
                  </div>
                  <Switch
                    id="w-ai"
                    checked={aiAutoRespond}
                    onCheckedChange={setAiAutoRespond}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Widget'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
