"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Update consent fields if checkbox accepted
    if (consentChecked && data?.user) {
      await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          privacy_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          privacy_accepted_at: new Date().toISOString(),
          consent_version: 'v1.0',
        })
        .eq('user_id', data.user.id);
    }

    if (inviteToken) {
      router.push(`/join/${encodeURIComponent(inviteToken)}`);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {inviteToken ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <UsersRound className="h-6 w-6 text-primary" />
          </div>
        ) : (
          <Logo badgeText="hub" className="justify-center scale-110" />
        )}

        <Card className="w-full border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-foreground">
              {inviteToken ? "Entrar para aceitar" : "Bem-vindo de volta"}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {inviteToken
                ? "Entre na sua conta e te levaremos para o convite."
                : "Entre na sua conta"}
            </CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-muted-foreground">
                  Senha
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <label className="flex items-center space-x-2 mt-4 text-sm text-muted-foreground">
              <input
                type="checkbox"
                required
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span>
                Eu li e concordo com os{" "}
                <Link href="/terms-of-service" className="underline">Termos de Serviço</Link>
                {" "}e a{" "}
                <Link href="/politica-de-privacidade" className="underline">Política de Privacidade</Link>.
              </span>
            </label>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-primary hover:text-primary/80"
            >
              Criar conta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
  );
}
