"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Provider } from "@supabase/supabase-js";

interface SocialAuthButtonsProps {
  inviteToken?: string | null;
  consentChecked?: boolean;
  onError?: (errorMsg: string) => void;
}

export function SocialAuthButtons({
  inviteToken,
  consentChecked = false,
  onError,
}: SocialAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const supabase = createClient();

  const handleSocialLogin = async (provider: Provider) => {
    try {
      // Require checking terms of service checkbox before proceeding
      if (!consentChecked) {
        if (onError) {
          onError(
            "Por favor, marque a caixa 'Eu li e concordo com os Termos de Serviço e a Política de Privacidade' para continuar."
          );
        }
        return;
      }

      setLoadingProvider(provider);
      if (onError) onError("");

      const nextUrl = inviteToken
        ? `/join/${encodeURIComponent(inviteToken)}`
        : "/dashboard";

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: provider === "google" ? {
            access_type: "offline",
            prompt: "consent",
          } : undefined,
        },
      });

      if (error) {
        if (onError) onError(error.message);
        setLoadingProvider(null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao conectar com provedor social";
      if (onError) onError(message);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-border"></div>
        <span className="bg-card px-3 text-xs text-muted-foreground uppercase tracking-wider whitespace-nowrap absolute">
          Ou entre com
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-2">
        {/* LinkedIn */}
        <Button
          type="button"
          variant="outline"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("linkedin_oidc" as Provider)}
          className="h-11 border-border bg-muted/50 hover:bg-muted text-foreground transition-all flex items-center justify-center p-0"
          title="Entrar com LinkedIn"
          aria-label="Entrar com LinkedIn"
        >
          {loadingProvider === "linkedin_oidc" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <svg className="h-5 w-5 fill-[#0A66C2]" viewBox="0 0 24 24">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" />
            </svg>
          )}
        </Button>

        {/* X (Twitter) */}
        <Button
          type="button"
          variant="outline"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("x" as Provider)}
          className="h-11 border-border bg-muted/50 hover:bg-muted text-foreground transition-all flex items-center justify-center p-0"
          title="Entrar com X (Twitter)"
          aria-label="Entrar com X (Twitter)"
        >
          {loadingProvider === ("x" as Provider) ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <svg className="h-4 w-4 fill-foreground" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          )}
        </Button>

        {/* Facebook */}
        <Button
          type="button"
          variant="outline"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("facebook")}
          className="h-11 border-border bg-muted/50 hover:bg-muted text-foreground transition-all flex items-center justify-center p-0"
          title="Entrar com Facebook"
          aria-label="Entrar com Facebook"
        >
          {loadingProvider === "facebook" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <svg className="h-5 w-5 fill-[#1877F2]" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          )}
        </Button>

        {/* Google */}
        <Button
          type="button"
          variant="outline"
          disabled={loadingProvider !== null}
          onClick={() => handleSocialLogin("google")}
          className="h-11 border-border bg-muted/50 hover:bg-muted text-foreground transition-all flex items-center justify-center p-0"
          title="Entrar com Google"
          aria-label="Entrar com Google"
        >
          {loadingProvider === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
        </Button>
      </div>
    </div>
  );
}
