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
  Info,
  PenTool,
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

export function ZapSignConfig() {
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [statusMessage, setStatusMessage] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('production');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhooks/zapsign`
      : '';

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/zapsign/config');
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setApiKey(MASKED_TOKEN);
        setEnvironment(payload.environment || 'production');
        setTokenEdited(false);
        setStatusMessage('');
      } else {
        setConnectionStatus('disconnected');
        setEnvironment(payload.environment || 'production');
        setStatusMessage(payload.message || '');
        setApiKey('');
      }
    } catch (err) {
      console.error('Failed to load ZapSign configuration:', err);
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
    if (!apiKey) {
      toast.error('O Token de API da ZapSign é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/zapsign/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tokenEdited ? apiKey.trim() : MASKED_TOKEN,
          environment,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Falha ao salvar configuração.');
      }

      toast.success('Configuração da ZapSign salva com sucesso!');
      setTokenEdited(false);
      setApiKey(MASKED_TOKEN);
      setConnectionStatus('connected');
      setStatusMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWebhook = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success('Webhook URL copiada!');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="ZapSign"
        description="Assinatura eletrônica integrada ao chat do WhatsApp. Crie assinaturas e envie links automaticamente."
      />

      <div className="grid gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Configurações Gerais</CardTitle>
            <CardDescription className="text-muted-foreground">
              Insira o token de API gerado na sua conta ZapSign.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-foreground">API Token</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showToken ? 'text' : 'password'}
                    placeholder="Cole seu API Token da ZapSign aqui"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTokenEdited(true);
                    }}
                    className="border-input bg-background pr-10 text-foreground focus-visible:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Obtenha em: ZapSign → Configurações → Integrações → ZAPSIGN API → Gerar Token.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="environment" className="text-foreground">Ambiente</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="radio"
                      name="environment"
                      value="production"
                      checked={environment === 'production'}
                      onChange={() => setEnvironment('production')}
                      className="accent-primary"
                    />
                    Produção (Validade jurídica)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="radio"
                      name="environment"
                      value="sandbox"
                      checked={environment === 'sandbox'}
                      onChange={() => setEnvironment('sandbox')}
                      className="accent-primary"
                    />
                    Sandbox (Testes gratuitos)
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Configuração
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {connectionStatus === 'connected' && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Configuração de Webhook</CardTitle>
              <CardDescription className="text-muted-foreground">
                Copie a URL abaixo e cole no painel da ZapSign para receber atualizações em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-foreground break-all">{webhookUrl}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyWebhook}
                    className="h-8 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {copiedWebhook ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 items-start text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 text-primary" />
                <p>
                  No painel da ZapSign, acesse Configurações → Integrações → Webhooks, crie um novo webhook apontando para esta URL e ative o evento de documento assinado.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Status da Integração</CardTitle>
          </CardHeader>
          <CardContent>
            {connectionStatus === 'connected' ? (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>Integração ativa e conectada ao ZapSign.</span>
              </div>
            ) : connectionStatus === 'disconnected' ? (
              <div className="flex items-start gap-2 text-sm text-red-500">
                <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Integração desconectada ou falhando.</p>
                  {statusMessage && <p className="text-xs mt-1 text-muted-foreground">{statusMessage}</p>}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Verificando status de conexão...</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
