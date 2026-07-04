import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative gradient blur background */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

      <div className="max-w-3xl mx-auto w-full space-y-8 z-10">
        <div>
          <Link href="/login">
            <Button variant="ghost" className="gap-2 mb-6 hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
              <ArrowLeft className="h-4 w-4" /> Voltar para o Login
            </Button>
          </Link>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
            Termos de Serviço
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Última atualização: 4 de Julho de 2026 | Versão 1.0
          </p>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">1. Aceitação dos Termos</h2>
            <p>
              Ao criar uma conta ou utilizar os serviços do Abbla Hub, você concorda expressamente em cumprir e ser regido por estes Termos de Serviço. Caso não concorde com qualquer parte deste documento, você não deve utilizar a plataforma.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">2. Descrição do Serviço</h2>
            <p>
              O Abbla Hub é um sistema de CRM e automação de mensagens integrado que auxilia no gerenciamento de relacionamentos com clientes, controle de pipelines de vendas e comunicação multicanal. Reservamo-nos o direito de modificar, suspender ou descontinuar partes do serviço a qualquer momento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">3. Contas de Usuário</h2>
            <p>
              Você é responsável por manter a confidencialidade das credenciais de acesso de sua conta e por todas as atividades realizadas sob seu usuário. Notifique imediatamente nossa equipe sobre qualquer uso não autorizado ou violação de segurança.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">4. Conduta do Usuário e LGPD</h2>
            <p>
              O processamento de dados realizado em nossa plataforma segue os preceitos éticos e regulatórios da Lei Geral de Proteção de Dados (LGPD). O usuário compromete-se a coletar e tratar dados pessoais de seus clientes finais sempre sob base legal válida e em total conformidade legal.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">5. Limitação de Responsabilidade</h2>
            <p>
              Em nenhuma circunstância o Abbla Hub ou seus desenvolvedores serão responsáveis por quaisquer danos indiretos, incidentais ou lucros cessantes decorrentes do uso ou da incapacidade de usar os serviços da plataforma.
            </p>
          </section>
        </div>
      </div>

      <footer className="mt-12 text-center text-xs text-muted-foreground border-t border-border/40 pt-6">
        © 2026 Abbla Hub. Todos os direitos reservados.
      </footer>
    </div>
  );
}
