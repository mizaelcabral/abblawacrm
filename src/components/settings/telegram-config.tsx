'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Info,
  Send,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export function TelegramConfig() {
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [botName, setBotName] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [botToken, setBotToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/telegram/webhook?account_id=${accountId || ''}`
      : '';

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/telegram/config');
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setBotName(payload.botName || '');
        setBotUsername(payload.config?.bot_username || '');
        setBotToken(MASKED_TOKEN);
        setTokenEdited(false);
        setStatusMessage('');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage(payload.message || '');
        setBotToken('');
      }
    } catch (err) {
      console.error('Failed to load Telegram configuration:', err);
      setConnectionStatus('disconnected');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountId) {
      void fetchConfig();
    }
  }, [accountId, fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken) {
      toast.error('O Token do Bot é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: tokenEdited ? botToken.trim() : MASKED_TOKEN,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `Erro HTTP ${res.status}`);
      }

      toast.success('Configurações do Telegram salvas com sucesso.');
      await fetchConfig();
    } catch (err) {
      console.error('Failed to save Telegram config:', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/telegram/config');
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setBotName(payload.botName || '');
        setBotUsername(payload.config?.bot_username || '');
        toast.success(`Conexão bem sucedida com o Bot: @${payload.config?.bot_username}`);
      } else {
        setConnectionStatus('disconnected');
        toast.error(payload.message || 'Falha no teste de conexão.');
      }
    } catch (err) {
      console.error('Test connection request failed:', err);
      toast.error('Erro de rede ao testar a conexão.');
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copiado para a área de transferência.');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Telegram Bot Integration"
        description="Conecte seu Bot do Telegram para receber e responder conversas diretamente no Inbox."
      />

      {/* Connection Status Alert */}
      {connectionStatus === 'connected' ? (
        <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <AlertTitle className="font-semibold text-emerald-400">Integrado com sucesso</AlertTitle>
          <AlertDescription className="text-emerald-400/90 text-xs mt-1">
            Seu CRM está conectado ao bot do Telegram: <strong className="underline">@{botUsername}</strong> ({botName}).
            Pronto para receber mensagens dos seus clientes.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-400">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="font-semibold text-amber-400">Integração desconectada</AlertTitle>
          <AlertDescription className="text-amber-400/90 text-xs mt-1">
            {statusMessage || 'Insira o token do seu Bot do Telegram abaixo para iniciar a integração.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Main form card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Token de Acesso do Telegram Bot</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Insira o token do bot fornecido pelo @BotFather no Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="botToken" className="text-xs font-medium text-foreground">
                  Token do Bot (API Token)
                </Label>
                <div className="relative">
                  <Input
                    id="botToken"
                    type={showToken ? 'text' : 'password'}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={botToken}
                    onChange={(e) => {
                      setBotToken(e.target.value);
                      setTokenEdited(true);
                    }}
                    className="border-border bg-muted pr-10 text-sm text-foreground focus:border-primary/50"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={saving || !botToken}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold px-4 py-2"
                >
                  {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Salvar
                </Button>

                {connectionStatus === 'connected' && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testing}
                    onClick={handleTestConnection}
                    className="border-border bg-transparent text-foreground hover:bg-muted text-xs font-semibold px-4 py-2"
                  >
                    {testing && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Testar Conexão
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Instuctions card */}
        <Card className="border-border bg-card h-fit">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Info className="h-4 w-4 text-primary" />
              Como Criar seu Bot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-muted-foreground leading-relaxed">
            <ol className="list-decimal pl-4 space-y-2">
              <li>
                Abra o Telegram e procure por{' '}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  @BotFather <ExternalLink className="h-3 w-3 inline" />
                </a>.
              </li>
              <li>Envie o comando <strong>/newbot</strong>.</li>
              <li>Escolha um nome e um nome de usuário (username) para o seu bot (precisa terminar em &quot;bot&quot;).</li>
              <li>Copie o <strong>HTTP API Token</strong> gerado e cole no campo de configuração ao lado.</li>
            </ol>
            
            {connectionStatus === 'connected' && botUsername && (
              <div className="pt-2 border-t border-border">
                <p className="font-semibold text-foreground mb-1.5">Links úteis:</p>
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Conversar com seu Bot @{botUsername}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Webhook details card */}
      {connectionStatus === 'connected' && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Send className="h-4 w-4 text-primary" />
              Configuração Automática de Webhook
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              O webhook é configurado automaticamente com o Telegram ao salvar o token. Segue a URL configurada:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 items-center">
              <Input
                readOnly
                value={webhookUrl}
                className="border-border bg-muted text-sm text-foreground flex-1 font-mono text-xs"
              />
              <Button
                variant="outline"
                className="border-border bg-transparent text-foreground hover:bg-muted text-xs font-semibold"
                onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook)}
              >
                {copiedWebhook ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-normal">
              Nota: O webhook permite que o Telegram envie mensagens recebidas diretamente para o seu CRM de forma imediata.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
