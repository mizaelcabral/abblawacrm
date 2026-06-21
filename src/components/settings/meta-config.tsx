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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export function MetaConfig() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [pageName, setPageName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [facebookPageId, setFacebookPageId] = useState('');
  const [instagramBusinessId, setInstagramBusinessId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/meta/webhook`
      : '';

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meta/config');
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setPageName(payload.pageName || '');
        setStatusMessage('');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage(payload.message || '');
      }

      if (payload.config) {
        setFacebookPageId(payload.config.facebook_page_id || '');
        setInstagramBusinessId(payload.config.instagram_business_id || '');
        setPageAccessToken(MASKED_TOKEN);
        setVerifyToken(payload.config.verify_token || '');
        setTokenEdited(false);
      } else {
        // Generate a random default verify token if none exists
        setVerifyToken(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
      }
    } catch (err) {
      console.error('Failed to load Meta configuration:', err);
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
    if (!facebookPageId) {
      toast.error('O ID da Página do Facebook é obrigatório.');
      return;
    }
    if (!pageAccessToken) {
      toast.error('O Token de Acesso da Página é obrigatório.');
      return;
    }
    if (!verifyToken) {
      toast.error('O Token de Verificação (Verify Token) é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/meta/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facebook_page_id: facebookPageId.trim(),
          instagram_business_id: instagramBusinessId.trim() || null,
          page_access_token: tokenEdited ? pageAccessToken.trim() : MASKED_TOKEN,
          verify_token: verifyToken.trim(),
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `Erro HTTP ${res.status}`);
      }

      toast.success('Configurações da Meta salvas com sucesso.');
      await fetchConfig();
    } catch (err) {
      console.error('Failed to save Meta config:', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/meta/config');
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setPageName(payload.pageName || '');
        toast.success(`Conexão bem sucedida com a Página: ${payload.pageName}`);
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
        title="Facebook & Instagram"
        description="Integre as mensagens do Messenger e do Instagram Direct diretamente no Inbox unificado do CRM."
      />

      {/* Integration Status Alert */}
      {connectionStatus === 'connected' ? (
        <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <AlertTitle className="font-semibold text-emerald-400">Integrado com sucesso</AlertTitle>
          <AlertDescription className="text-emerald-400/90 text-xs mt-1">
            Seu CRM está conectado à Página do Facebook: <strong>{pageName}</strong>. 
            Pronto para enviar e receber mensagens multicanal.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-400">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="font-semibold text-amber-400">Integração desconectada</AlertTitle>
          <AlertDescription className="text-amber-400/90 text-xs mt-1">
            {statusMessage || 'Preencha os campos abaixo para conectar a sua Página do Facebook e conta do Instagram.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form Settings */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Credenciais da Integração</CardTitle>
            <CardDescription className="text-xs">
              Insira as informações do seu aplicativo Meta e Página.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="facebookPageId" className="text-sm font-medium">
                  ID da Página do Facebook
                </Label>
                <Input
                  id="facebookPageId"
                  placeholder="Ex: 102938475610293"
                  value={facebookPageId}
                  onChange={(e) => setFacebookPageId(e.target.value)}
                  className="bg-muted text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagramBusinessId" className="text-sm font-medium">
                  ID da Conta Comercial do Instagram <span className="text-muted-foreground text-xs">(Opcional)</span>
                </Label>
                <Input
                  id="instagramBusinessId"
                  placeholder="Ex: 98765432109876"
                  value={instagramBusinessId}
                  onChange={(e) => setInstagramBusinessId(e.target.value)}
                  className="bg-muted text-foreground"
                />
                <p className="text-[10px] text-muted-foreground">
                  Necessário apenas se deseja receber mensagens do Instagram Direct nesta mesma caixa.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pageAccessToken" className="text-sm font-medium">
                  Page Access Token (Token de Acesso da Página)
                </Label>
                <div className="relative">
                  <Input
                    id="pageAccessToken"
                    type={showToken ? 'text' : 'password'}
                    placeholder="EAA..."
                    value={pageAccessToken}
                    onChange={(e) => {
                      setPageAccessToken(e.target.value);
                      setTokenEdited(true);
                    }}
                    className="bg-muted pr-10 text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verifyToken" className="text-sm font-medium">
                  Token de Verificação (Verify Token)
                </Label>
                <Input
                  id="verifyToken"
                  placeholder="Crie um token seguro"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="bg-muted text-foreground font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Use esta mesma palavra-chave no painel de Webhooks da Meta para autenticação do endpoint.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/95">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Configuração
                </Button>

                {connectionStatus !== 'unknown' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="border-border text-foreground hover:bg-muted"
                  >
                    {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Testar Conexão
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Webhook Configuration Instructions */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Configuração do Webhook na Meta</CardTitle>
            <CardDescription className="text-xs">
              Siga os passos no painel do Facebook Developers para começar a receber as mensagens no CRM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-foreground/80">
            <div className="space-y-2 rounded-lg bg-muted p-3 border border-border">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground text-[10px] uppercase">URL de Retorno (Callback URL)</span>
                <button
                  onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="font-mono text-xs break-all bg-background border border-border p-1.5 rounded text-foreground mt-1 select-all">
                {webhookUrl}
              </p>

              <div className="flex items-center justify-between mt-3">
                <span className="font-semibold text-muted-foreground text-[10px] uppercase">Token de Verificação (Verify Token)</span>
                <button
                  onClick={() => copyToClipboard(verifyToken, setCopiedToken)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="font-mono text-xs break-all bg-background border border-border p-1.5 rounded text-foreground mt-1 select-all">
                {verifyToken}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                <Info className="h-4 w-4 text-primary shrink-0" /> Como configurar no Facebook Developers:
              </h4>
              <ol className="list-decimal pl-4 space-y-2 mt-2 leading-relaxed">
                <li>
                  Acesse o portal <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-primary underline hover:text-primary/80 inline-flex items-center gap-0.5">Facebook Developers <ExternalLink className="h-2.5 w-2.5" /></a> e selecione seu aplicativo.
                </li>
                <li>
                  Adicione o produto <strong>Messenger</strong> ou <strong>Instagram Graph API</strong> ao seu app.
                </li>
                <li>
                  Vá na seção <strong>Webhooks</strong> e clique em <strong>Configurar/Editar Assinatura</strong>.
                </li>
                <li>
                  Cole a <strong>URL de Retorno</strong> e o <strong>Token de Verificação</strong> fornecidos acima.
                </li>
                <li>
                  Inscreva-se nos campos de webhook:
                  <ul className="list-disc pl-4 mt-1 space-y-1 text-muted-foreground">
                    <li>Para Messenger: <strong>messages</strong>, <strong>messaging_postbacks</strong>.</li>
                    <li>Para Instagram: <strong>instagram_manage_messages</strong>.</li>
                  </ul>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
