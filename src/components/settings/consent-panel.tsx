'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

export function ConsentPanel() {
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  if (!profile) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return ts;
    }
  };

  const handleRevoke = async () => {
    if (!user) return;
    
    const confirm = window.confirm(
      'Tem certeza que deseja revogar seus consentimentos? Você será deslogado ou solicitado a aceitar os termos novamente no próximo acesso.'
    );
    if (!confirm) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          terms_accepted: false,
          privacy_accepted: false,
          terms_accepted_at: null,
          privacy_accepted_at: null,
          consent_version: null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Consentimentos revogados com sucesso', {
        description: 'Seus dados de consentimento legal foram limpos.',
      });

      await refreshProfile();
    } catch (err: any) {
      console.error('[ConsentPanel] Error revoking consent:', err);
      toast.error('Erro ao revogar consentimento', {
        description: err.message || 'Ocorreu um erro inesperado.',
      });
    } finally {
      setLoading(false);
    }
  };

  const hasAccepted = profile.terms_accepted && profile.privacy_accepted;

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Consentimentos e LGPD"
        description="Gerencie seus consentimentos legais obrigatórios, verifique carimbos de data/hora e revogue autorizações."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Terms of Service Card */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg font-medium text-foreground">
                Termos de Serviço
              </CardTitle>
              <CardDescription>
                Regras e diretrizes para uso da plataforma.
              </CardDescription>
            </div>
            {profile.terms_accepted ? (
              <ShieldCheck className="h-6 w-6 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-yellow-500 shrink-0" />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span
                className={`font-semibold ${
                  profile.terms_accepted ? 'text-emerald-500' : 'text-yellow-500'
                }`}
              >
                {profile.terms_accepted ? 'Aceito' : 'Pendente'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Versão aceita:</span>
              <span className="text-foreground font-mono">
                {profile.terms_accepted ? profile.consent_version || 'v1.0' : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Aceito em:</span>
              <span className="text-foreground">
                {formatTimestamp(profile.terms_accepted_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Policy Card */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg font-medium text-foreground">
                Política de Privacidade
              </CardTitle>
              <CardDescription>
                Como tratamos seus dados pessoais de acordo com a LGPD.
              </CardDescription>
            </div>
            {profile.privacy_accepted ? (
              <ShieldCheck className="h-6 w-6 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-yellow-500 shrink-0" />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span
                className={`font-semibold ${
                  profile.privacy_accepted ? 'text-emerald-500' : 'text-yellow-500'
                }`}
              >
                {profile.privacy_accepted ? 'Aceito' : 'Pendente'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Versão aceita:</span>
              <span className="text-foreground font-mono">
                {profile.privacy_accepted ? profile.consent_version || 'v1.0' : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Aceito em:</span>
              <span className="text-foreground">
                {formatTimestamp(profile.privacy_accepted_at)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Actions Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-foreground">
            Direito de Revogação (LGPD)
          </CardTitle>
          <CardDescription>
            Em conformidade com o Artigo 8º, § 5º da LGPD, você possui o direito de revogar o seu consentimento de tratamento a qualquer momento mediante manifestação expressa.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <p className="text-sm text-muted-foreground max-w-xl">
            Ao clicar no botão de revogação, seus consentimentos serão limpos da nossa base de dados. Caso deseje continuar utilizando o sistema, você precisará fornecer novos consentimentos no próximo acesso.
          </p>
          <Button
            variant="destructive"
            disabled={loading || !hasAccepted}
            onClick={handleRevoke}
            className="shrink-0 w-full sm:w-auto"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Revogando...
              </>
            ) : (
              'Revogar Consentimentos'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
