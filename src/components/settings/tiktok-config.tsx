'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Video,
  Unlink,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export function TikTokConfig() {
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [tiktokOpenId, setTiktokOpenId] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/tiktok/webhook`
      : '';

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tiktok/config');
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setTiktokOpenId(payload.tiktok_open_id || '');
        setStatusMessage('');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage(payload.message || '');
      }
    } catch (err) {
      console.error('Failed to load TikTok configuration:', err);
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

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/tiktok/config', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok || !payload.url) {
        throw new Error(payload.error || 'Falha ao iniciar autenticação.');
      }
      // Redirect user to TikTok OAuth login page
      window.location.href = payload.url;
    } catch (err: any) {
      console.error('TikTok redirect initiation failed:', err);
      toast.error(err.message || 'Erro de conexão com o TikTok API.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o TikTok CRM?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/tiktok/config', { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || 'Falha ao desconectar.');
      }
      toast.success('Integração com TikTok desconectada.');
      await fetchConfig();
    } catch (err: any) {
      console.error('Failed to disconnect TikTok:', err);
      toast.error(err.message || 'Erro ao desconectar.');
    } finally {
      setDisconnecting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWebhook(true);
    toast.success('Webhook copiado.');
    setTimeout(() => setCopiedWebhook(false), 2000);
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
        title="Integração do TikTok CRM"
        description="Integre sua conta do TikTok Business para sincronizar DMs, comentários e formulários de leads em anúncios."
      />

      {connectionStatus === 'connected' ? (
        <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <AlertTitle className="font-semibold text-emerald-400">Integrado com sucesso</AlertTitle>
          <AlertDescription className="text-emerald-400/90 text-xs mt-1">
            Seu CRM está conectado à conta TikTok Business ID: <strong>{tiktokOpenId}</strong>.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-400">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="font-semibold text-amber-400">Integração desconectada</AlertTitle>
          <AlertDescription className="text-amber-400/90 text-xs mt-1">
            {statusMessage || 'Conecte sua conta do TikTok Business para iniciar a captura de leads.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Autorização do Canal</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Conecte a conta oficial do TikTok da sua empresa de maneira simplificada por OAuth 2.0.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {connectionStatus === 'connected' ? (
              <div className="flex items-center space-x-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Unlink className="mr-2 h-4 w-4" />
                  )}
                  Desconectar Conta
                </Button>
              </div>
            ) : (
              <div>
                <Button onClick={handleConnect} disabled={connecting} className="w-full sm:w-auto">
                  {connecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="mr-2 h-4 w-4" />
                  )}
                  Conectar Conta TikTok Business
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Configuração Webhook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Copie este link e configure-o na sua conta de desenvolvedor TikTok para receber mensagens e formulários em tempo real.
              </p>
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">Webhook Endpoint URL</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="w-full rounded border border-input bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground focus:outline-none"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(webhookUrl)}
                  >
                    {copiedWebhook ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
