import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative gradient blur background */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

      <div className="max-w-3xl mx-auto w-full space-y-8 z-10">
        <div>
          <Link href="/login">
            <Button variant="ghost" className="gap-2 mb-6 hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
              <ArrowLeft className="h-4 w-4" /> Voltar para o Login
            </Button>
          </Link>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Última atualização: 4 de Julho de 2026 | Versão 1.0
          </p>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">1. Coleta de Informações</h2>
            <p>
              Coletamos informações necessárias para a prestação e melhoria dos nossos serviços, incluindo dados cadastrais (como nome completo, endereço de e-mail e informações de contato) e dados de interação com a plataforma.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">2. Uso de Dados Pessoais (LGPD)</h2>
            <p>
              Todos os dados pessoais coletados são tratados em estrita observância à Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Usamos seus dados exclusivamente para:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Autenticação de identidade e acesso seguro à plataforma;</li>
              <li>Personalização do CRM e pipelines de vendas;</li>
              <li>Comunicação sobre atualizações de sistemas ou avisos de suporte;</li>
              <li>Garantia da segurança da rede e prevenção a fraudes.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">3. Direitos dos Titulares de Dados</h2>
            <p>
              Em conformidade com a LGPD, você possui direito a confirmar a existência de tratamento, acessar seus dados, solicitar a retificação de dados incorretos, ou revogar o seu consentimento de tratamento a qualquer momento. Para exercer esses direitos, você pode acessar a seção de consentimentos em seu painel ou entrar em contato com nosso DPO/Encarregado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">4. Segurança da Informação</h2>
            <p>
              Empregamos rígidos padrões de segurança técnica e organizacional para proteger seus dados pessoais contra acessos não autorizados, perda acidental, destruição ou alteração ilícita. Toda a transmissão de dados é criptografada.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">5. Alterações nesta Política</h2>
            <p>
              Poderemos atualizar esta Política de Privacidade periodicamente. Avisaremos sobre quaisquer alterações significativas publicando o novo texto nesta página e atualizando a data da versão correspondente.
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
