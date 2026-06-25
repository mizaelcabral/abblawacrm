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
  Zap,
  AlertTriangle,
  RotateCcw,
  QrCode,
  Globe,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [activeTab, setActiveTab] = useState('meta');

  // ============================================================
  // STATE: WhatsApp Official (Meta)
  // ============================================================
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;
  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  const [registrationProbe, setRegistrationProbe] = useState<any>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  // ============================================================
  // STATE: WhatsApp Web (QR Code - Unofficial)
  // ============================================================
  const [webApiUrl, setWebApiUrl] = useState('');
  const [webInstanceName, setWebInstanceName] = useState('');
  const [webApiToken, setWebApiToken] = useState('');
  const [webIsActive, setWebIsActive] = useState(false);
  const [webStatus, setWebStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [webQrcode, setWebQrcode] = useState<string | null>(null);
  const [webSaving, setWebSaving] = useState(false);
  const [webDisconnecting, setWebDisconnecting] = useState(false);
  const [showWebToken, setShowWebToken] = useState(false);
  const [webTokenEdited, setWebTokenEdited] = useState(false);

  const webWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp-web/webhook`
      : '';

  // ============================================================
  // FETCH & HEALTH CHECKS
  // ============================================================
  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      // 1. Fetch Meta Configuration
      const { data: metaData, error: metaError } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (metaError) {
        console.error('Failed to load Meta config row:', metaError);
      }

      if (metaData) {
        setConfig(metaData);
        setPhoneNumberId(metaData.phone_number_id || '');
        setWabaId(metaData.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      }
      setRegistrationProbe(null);

      // Verify Meta API connectivity
      if (metaData) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Meta Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }

      // 2. Fetch WhatsApp Web (Unofficial) Configuration
      const { data: webData, error: webError } = await supabase
        .from('whatsapp_web_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (webError) {
        console.error('Failed to load Web config row:', webError);
      }

      if (webData) {
        setWebApiUrl(webData.api_url || '');
        setWebInstanceName(webData.instance_name || '');
        setWebApiToken(MASKED_TOKEN);
        setWebIsActive(webData.is_active || false);
        setWebStatus(webData.status || 'disconnected');
        setWebTokenEdited(false);
      } else {
        setWebApiUrl('');
        setWebInstanceName('');
        setWebApiToken('');
        setWebIsActive(false);
        setWebStatus('disconnected');
        setWebTokenEdited(false);
      }

    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Falha ao carregar a configuração do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  // ============================================================
  // ACTIONS: WhatsApp Official (Meta)
  // ============================================================
  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('O ID do número de telefone é obrigatório');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('O token de acesso é obrigatório para a configuração inicial');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error('Por favor, insira novamente o Token de Acesso para salvar as alterações');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar a configuração');
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(`Salvo, mas a Meta não pôde registrar o número: ${data.registration_error}`, { duration: 12000 });
      } else if (data.registration_skipped) {
        toast.success('Credenciais salvas e verificadas. O registro de entrada foi pulado (sem PIN) — veja o status de registro abaixo.', { duration: 10000 });
        setPin('');
      } else {
        toast.success(data.phone_info?.verified_name ? `Ativo — ${data.phone_info.verified_name} agora pode receber eventos.` : 'WhatsApp conectado. Os eventos começarão a fluir em breve.');
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Falha ao salvar a configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(payload.phone_info?.verified_name ? `Conectado a ${payload.phone_info.verified_name}` : 'Conexão com a API bem-sucedida');
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'Falha na conexão com a API');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('O teste de conexão falhou. Verifique a rede e tente novamente.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', { method: 'GET' });
      const data = await res.json();
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Número totalmente conectado — a Meta está entregando os eventos.');
      } else {
        toast.error('Número não está totalmente registrado. Veja as verificações abaixo para saber qual etapa falhou.', { duration: 8000 });
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Não foi possível conectar ao endpoint de verificação.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (!confirm('Isso excluirá a configuração atual do WhatsApp para que você possa inseri-la novamente. Continuar?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao redefinir a configuração');
        return;
      }

      toast.success('Configuração limpa. Agora você pode inserir suas credenciais novamente.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Falha ao redefinir a configuração');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do Webhook copiada para a área de transferência');
  }

  // ============================================================
  // ACTIONS: WhatsApp Web (QR Code - Unofficial)
  // ============================================================
  const fetchWebStatusAndQr = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp-web/qr');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'connected') {
          setWebStatus('connected');
          setWebQrcode(null);
        } else {
          setWebStatus('disconnected');
          setWebQrcode(data.qrcode || null);
        }
      }
    } catch (err) {
      console.error('[WhatsApp Web Config] Polling state failed:', err);
    }
  }, []);

  // Poll for QR Code when disconnected
  useEffect(() => {
    if (activeTab !== 'web' || webStatus === 'connected' || !webApiUrl) {
      return;
    }

    fetchWebStatusAndQr();

    const interval = setInterval(fetchWebStatusAndQr, 6000);
    return () => clearInterval(interval);
  }, [activeTab, webStatus, webApiUrl, fetchWebStatusAndQr]);

  async function handleSaveWeb() {
    if (!webApiUrl.trim() || !webInstanceName.trim()) {
      toast.error('URL da API e Nome da Instância são obrigatórios');
      return;
    }
    if (!webApiToken.trim()) {
      toast.error('API Token é obrigatório');
      return;
    }

    try {
      setWebSaving(true);
      const res = await fetch('/api/whatsapp-web/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_url: webApiUrl.trim(),
          instance_name: webInstanceName.trim(),
          api_token: webApiToken,
          is_active: webIsActive,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar a configuração');
        return;
      }

      toast.success('Configurações salvas. Inicializando instância...');
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('[WhatsApp Web Save] Error:', err);
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setWebSaving(false);
    }
  }

  async function handleDisconnectWeb() {
    if (!confirm('Deseja realmente desconectar a sessão do WhatsApp do seu celular?')) {
      return;
    }

    try {
      setWebDisconnecting(true);
      const res = await fetch('/api/whatsapp-web/disconnect', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao desconectar');
        return;
      }

      toast.success('Desconectado com sucesso!');
      setWebStatus('disconnected');
      setWebQrcode(null);
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('[WhatsApp Web Disconnect] Error:', err);
      toast.error('Erro ao processar desconexão.');
    } finally {
      setWebDisconnecting(false);
    }
  }

  function handleCopyWebWebhookUrl() {
    navigator.clipboard.writeText(webWebhookUrl);
    toast.success('URL do Webhook do WhatsApp Web copiada');
  }

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Conexão do WhatsApp"
          description="Conecte sua API do WhatsApp Business da Meta ou configure um WhatsApp Web alternativo via QR Code."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Conexão do WhatsApp"
        description="Conecte sua API do WhatsApp Business da Meta ou use a conexão direta via QR Code."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="meta">
            <Globe className="size-4 mr-2" />
            API Oficial (Meta)
          </TabsTrigger>
          <TabsTrigger value="web">
            <QrCode className="size-4 mr-2" />
            Conexão Direta (QR Code)
          </TabsTrigger>
        </TabsList>

        {/* ============================================================
            TAB: WhatsApp Official (Meta)
            ============================================================ */}
        <TabsContent value="meta">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              {showResetBanner && (
                <Alert className="bg-amber-950/40 border-amber-600/40">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <AlertTitle className="text-amber-200 mb-1">
                        O token armazenado não pode ser descriptografado
                      </AlertTitle>
                      <AlertDescription className="text-amber-100/80 text-sm">
                        {statusMessage}
                      </AlertDescription>
                      <Button
                        onClick={handleReset}
                        disabled={resetting}
                        size="sm"
                        className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {resetting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Redefinindo...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="size-4" />
                            Redefinir Configuração
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Connection Status */}
              <Alert className="bg-card border-border">
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected' ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                  <AlertTitle className="text-foreground mb-0">
                    {connectionStatus === 'connected' ? 'Credenciais válidas (API Oficial)' : 'Não Conectado'}
                  </AlertTitle>
                </div>
                <AlertDescription className="text-muted-foreground mt-2">
                  {connectionStatus === 'connected'
                    ? 'Seu token de acesso é autenticado com a Meta. Veja o status de registro abaixo para confirmar se os webhooks estão realmente conectados.'
                    : statusMessage ||
                      'Configure suas credenciais da API da Meta abaixo para conectar sua conta do WhatsApp Business.'}
                </AlertDescription>
              </Alert>

              {/* Registration Status */}
              {config && (
                <Alert
                  className={
                    isRegistered
                      ? 'bg-emerald-950/30 border-emerald-700/50'
                      : 'bg-amber-950/30 border-amber-700/50'
                  }
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {isRegistered ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="size-4 text-amber-400" />
                      )}
                      <AlertTitle className={'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')}>
                        {isRegistered
                          ? 'Registrado — a Meta entregará os eventos para o CRM'
                          : 'Não registrado — a Meta não entregará os eventos'}
                      </AlertTitle>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVerifyRegistration}
                      disabled={verifyingRegistration}
                      className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                    >
                      {verifyingRegistration ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Zap className="size-3.5" />
                      )}
                      Verificar com a Meta
                    </Button>
                  </div>
                  <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
                    {isRegistered ? (
                      <>
                        Inscrito desde{' '}
                        {config.registered_at
                          ? new Date(config.registered_at).toLocaleString()
                          : 'desconhecido'}
                        . Clique em <strong>Verificar com a Meta</strong> se os eventos pararem de chegar.
                      </>
                    ) : lastRegistrationError ? (
                      <>
                        A última tentativa falhou com:{' '}
                        <span className="text-red-300">&quot;{lastRegistrationError}&quot;</span>. Insira (ou corrija) o PIN de 2 etapas abaixo e salve para tentar novamente.
                      </>
                    ) : (
                      <>
                        Este número foi salvo antes de existir o rastreamento de registro. Insira o PIN de 2 etapas abaixo e salve para se inscrever.
                      </>
                    )}
                  </AlertDescription>

                  {registrationProbe && (
                    <div className="mt-3 rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
                      <p className="font-medium text-foreground">
                        Diagnóstico — última execução:{' '}
                        <span className={registrationProbe.live ? 'text-emerald-400' : 'text-amber-400'}>
                          {registrationProbe.live ? 'live' : 'not live'}
                        </span>
                      </p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {Object.entries(registrationProbe.checks).map(([k, v]) => (
                          <li key={k} className="flex items-center gap-1.5">
                            {v === true ? (
                              <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                            ) : v === false ? (
                              <XCircle className="size-3 text-red-400 shrink-0" />
                            ) : (
                              <span className="size-3 rounded-full border border-border shrink-0" />
                            )}
                            <code className="text-muted-foreground">{k}</code>
                          </li>
                        ))}
                      </ul>
                      {(registrationProbe.errors ?? []).length > 0 && (
                        <ul className="pt-1 space-y-0.5 text-red-300">
                          {registrationProbe.errors?.map((e: string, i: number) => (
                            <li key={i}>• {e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Alert>
              )}

              {/* API Credentials */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Credenciais da API</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Insira suas credenciais da API do WhatsApp Business da Meta.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">ID do Número de Telefone</Label>
                    <Input
                      placeholder="Ex: 100234567890123"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">ID da Conta do WhatsApp Business</Label>
                    <Input
                      placeholder="Ex: 100234567890456"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Token de Acesso Permanente</Label>
                    <div className="relative">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        placeholder="Insira seu token de acesso"
                        value={accessToken}
                        onChange={(e) => {
                          setAccessToken(e.target.value);
                          setTokenEdited(true);
                        }}
                        onFocus={() => {
                          if (accessToken === MASKED_TOKEN) {
                            setAccessToken('');
                            setTokenEdited(true);
                          }
                        }}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {config && !tokenEdited && (
                      <p className="text-xs text-muted-foreground">
                        O token está oculto por segurança. Insira-o novamente para atualizar a configuração.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Token de Verificação do Webhook</Label>
                    <Input
                      placeholder="Crie um token de verificação personalizado"
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      Uma string personalizada que você cria. Deve corresponder ao token que você definiu nas configurações de webhook da Meta.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      PIN de confirmação em duas etapas
                      <span className="ml-1 text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="PIN de 6 dígitos"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Necessário para receber mensagens de entrada em números de produção.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Webhook URL */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Configuração de Webhook</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Use esta URL como seu callback de webhook no Painel de Aplicativos da Meta.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">URL de Callback do Webhook</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={webhookUrl}
                        className="bg-muted border-border text-muted-foreground font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyWebhookUrl}
                        className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Configuração'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing || !config}
                  className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {testing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <Zap className="size-4" />
                      Testar Conexão da API
                    </>
                  )}
                </Button>
                {config && (
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={resetting}
                    className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                  >
                    {resetting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Redefinindo...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-4" />
                        Redefinir Configuração
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Setup Instructions Sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground text-base">Instruções de Configuração</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Siga estas etapas para conectar sua API oficial.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion>
                    <AccordionItem className="border-border" value="step-1">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline text-xs">
                        <span className="flex items-center gap-2 text-left">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shrink-0">1</span>
                          Criar um Aplicativo Meta
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-xs">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Acesse developers.facebook.com</li>
                          <li>Clique em &quot;Meus Aplicativos&quot; &gt; &quot;Criar Aplicativo&quot;</li>
                          <li>Selecione &quot;Empresa&quot; como o tipo de aplicativo</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem className="border-border" value="step-2">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline text-xs">
                        <span className="flex items-center gap-2 text-left">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shrink-0">2</span>
                          Configurar Webhooks
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-xs">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Acesse WhatsApp &gt; Configuração no Painel do App</li>
                          <li>Cole a URL de Callback do Webhook acima</li>
                          <li>Inscreva-se no campo de webhook &quot;messages&quot;</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ============================================================
            TAB: WhatsApp Web (QR Code - Unofficial)
            ============================================================ */}
        <TabsContent value="web">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              {/* Active Switch Toggle */}
              <Card className="border-border bg-card">
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Usar Conexão Direta (QR Code)</h4>
                    <p className="text-xs text-muted-foreground">
                      Se ativado, as mensagens serão despachadas através do celular conectado via QR Code em vez da API Oficial da Meta.
                    </p>
                  </div>
                  <Switch
                    checked={webIsActive}
                    onCheckedChange={(checked) => {
                      setWebIsActive(checked);
                      setWebTokenEdited(true);
                    }}
                  />
                </CardContent>
              </Card>

              {/* Connection Status Banner */}
              <Alert className="bg-card border-border">
                <div className="flex items-center gap-2">
                  {webStatus === 'connected' ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : webStatus === 'connecting' ? (
                    <Loader2 className="size-4 animate-spin text-amber-500" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                  <AlertTitle className="text-foreground mb-0">
                    {webStatus === 'connected'
                      ? 'WhatsApp Web Conectado'
                      : webStatus === 'connecting'
                      ? 'Conectando ao celular...'
                      : 'WhatsApp Web Desconectado'}
                  </AlertTitle>
                </div>
                <AlertDescription className="text-muted-foreground mt-2">
                  {webStatus === 'connected'
                    ? 'CRM conectado diretamente ao seu celular. Mensagens estão fluindo através dele.'
                    : 'A conexão direta com o celular está inativa. Configure e escaneie o QR Code abaixo para reativar.'}
                </AlertDescription>
              </Alert>

              {/* QR Code Container */}
              {webStatus !== 'connected' && webApiUrl && webInstanceName && (
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground">Escaneie o QR Code</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Aponte o leitor do WhatsApp do seu celular para este código para conectar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                    {webQrcode ? (
                      <div className="relative p-3 rounded-xl bg-white shadow-md border border-border">
                        <img
                          src={webQrcode}
                          alt="WhatsApp QR Code"
                          className="size-56 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="size-56 rounded-xl bg-muted flex items-center justify-center border border-border">
                        <div className="flex flex-col items-center text-center p-4">
                          <Loader2 className="size-6 animate-spin text-primary mb-2" />
                          <span className="text-xs text-muted-foreground">Gerando QR Code...</span>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-center text-muted-foreground max-w-sm">
                      <p className="font-semibold text-foreground mb-1">Passo a passo no celular:</p>
                      <p>1. Abra o WhatsApp no seu smartphone</p>
                      <p>2. Vá em Configurações &gt; Aparelhos Conectados</p>
                      <p>3. Clique em &quot;Conectar um aparelho&quot; e aponte a câmera para a tela</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Unofficial API Credentials */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Configuração do Servidor (Evolution API)</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Insira a URL de hospedagem e chaves do gateway externo de WhatsApp Web.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">URL da API do Gateway</Label>
                    <Input
                      placeholder="Ex: https://api.meu-gateway.com"
                      value={webApiUrl}
                      onChange={(e) => setWebApiUrl(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O endereço do seu servidor de Evolution API (deve incluir http/https).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Nome da Instância</Label>
                    <Input
                      placeholder="Ex: abbla-whatsapp-web"
                      value={webInstanceName}
                      onChange={(e) => setWebInstanceName(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Identificador curto e único para esta conexão de celular no seu servidor.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">API Token Global</Label>
                    <div className="relative">
                      <Input
                        type={showWebToken ? 'text' : 'password'}
                        placeholder="Token global da API do gateway"
                        value={webApiToken}
                        onChange={(e) => {
                          setWebApiToken(e.target.value);
                          setWebTokenEdited(true);
                        }}
                        onFocus={() => {
                          if (webApiToken === MASKED_TOKEN) {
                            setWebApiToken('');
                            setWebTokenEdited(true);
                          }
                        }}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowWebToken(!showWebToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showWebToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {webApiToken === MASKED_TOKEN && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Token gravado e ocultado para sua segurança.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Webhook Configuration for Unofficial API */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Webhook da Conexão Direta</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    URL de recebimento que o gateway externo utiliza. Esta URL é configurada automaticamente no salvamento.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={webWebhookUrl}
                        className="bg-muted border-border text-muted-foreground font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyWebWebhookUrl}
                        className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleSaveWeb}
                  disabled={webSaving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {webSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar e Conectar'
                  )}
                </Button>
                {webStatus === 'connected' && (
                  <Button
                    variant="outline"
                    onClick={handleDisconnectWeb}
                    disabled={webDisconnecting}
                    className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                  >
                    {webDisconnecting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Desconectando...
                      </>
                    ) : (
                      'Desconectar Celular'
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Unofficial API Information Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground text-base flex items-center gap-2">
                    <HelpCircle className="size-4 text-primary" />
                    Sobre o WhatsApp Web
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-xs space-y-3 leading-relaxed">
                  <p>
                    A <strong>Conexão Direta (QR Code)</strong> conecta o CRM ao seu aparelho celular escaneando a tela, usando o protocolo similar ao do WhatsApp Web.
                  </p>
                  <p className="font-semibold text-foreground">Diferenças Importantes:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Ativação imediata sem aprovação de CNPJ pela Meta.</li>
                    <li>Não há tarifas por mensagens de templates da Meta.</li>
                    <li>
                      <strong className="text-red-400">Aviso:</strong> A Meta desencoraja disparos em massa via QR Code. Use com cautela para evitar banimentos de número.
                    </li>
                  </ul>
                  <p>
                    Ideal para testar a ferramenta e receber leads imediatamente enquanto aguarda a liberação do número oficial do WhatsApp Cloud API.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
