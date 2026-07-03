# Spec de Design: Menu de Notificações na Barra Superior

**Data:** 2026-07-03  
**Autor:** Antigravity  
**Status:** Em Revisão  

---

## 1. Escopo e Objetivos

O objetivo deste projeto é adicionar um componente de **Menu de Notificações** (estilo Popover/Dropdown) na barra superior (header) do CRM, ao lado do botão de alternar tema (light/dark mode). Este menu centralizará avisos cruciais de status da conta e atividades relevantes do sistema para melhorar a experiência do usuário (UX) e conversão de planos.

### O que SERÁ incluído:
1. **Ícone de Notificações (`Bell`):** Com um indicador visual (badge/ponto vermelho) contendo a contagem total de ações pendentes (mensagens não lidas + tarefas da IA aguardando revisão).
2. **Abas ou Seções dentro do Popover:**
   - **Mensagens:** Lista rápida de contatos/conversas com mensagens não lidas, exibindo o nome do contato, trecho da mensagem e atalho direto para a conversa no Inbox.
   - **Tarefas da IA:** Lista de tarefas recomendadas pela IA com status `review_required`. Cada item mostrará o título da tarefa, data de criação e atalhos rápidos para aprovar/concluir ou editar (redirecionando para `/tasks`).
3. **Barra de Alerta de Assinatura e Cotas (Rodapé do Popover):**
   - **Aviso de Teste Grátis (Trial):** Contador de dias restantes caso a conta esteja em trial (`subscription_status = 'trial'`).
   - **Barra de Cota de IA:** Visualização gráfica de mensagens de IA consumidas vs limite total (`ai_message_count` / `ai_message_limit`), com destaque visual (laranja/vermelho) se exceder 80% do uso.
   - **Alerta de Pagamento Pendente:** Mensagem em destaque com link direto para checkout se a assinatura estiver com status `unpaid` ou `past_due`.

---

## 2. Abordagem de Implementação

1. **Novo Componente `NotificationMenu`:**
   - Criado em `src/components/layout/notification-menu.tsx`.
   - Utilizará o componente `@/components/ui/popover` do Radix/shadcn-ui para abrir o menu sob o ícone de sino.
2. **Integração no Header:**
   - Adicionar o `<NotificationMenu />` no `src/components/layout/header.tsx` ao lado do `<ModeToggle />`.
3. **Gerenciamento de Estado:**
   - **Mensagens Não Lidas:** Utilizar o hook `useTotalUnread` existente e, opcionalmente, buscar as últimas conversas não lidas diretamente do Supabase.
   - **Tarefas da IA:** Criar um hook leve `useAiReviewTasks` ou realizar query em tempo real para obter tarefas da conta com `is_ai_task = true` e `status = 'review_required'`.
   - **Cotas & Assinatura:** Usar o contexto de autenticação global via `useAuth()`, que já expõe `account?.subscription_status`, `account?.subscription_expires_at`, `account?.ai_message_count` e `account?.ai_message_limit`.

---

## 3. Estrutura Visual Proposta (Mockup Conceitual)

```
[ Sino (Bell) (3) ] (abre popover abaixo)
+--------------------------------------------------------+
| Notificações                                           |
| +----------------------------------------------------+ |
| | [ Mensagens (1) ]        [ Tarefas da IA (2) ]     | |
| +----------------------------------------------------+ |
|                                                        |
| Seção de Mensagens (se ativa):                         |
| - Mizael: "Olá, gostaria de agendar..." (Ir para chat) |
|                                                        |
| Seção de Tarefas da IA (se ativa):                     |
| - [IA] Retornar contato com Dr. Carlos (Revisar)       |
| - [IA] Agendar audiência do Processo X  (Revisar)      |
|                                                        |
| ------------------------------------------------------ |
| Uso de Mensagens de IA:                                |
| [████████████████░░░░] 800 / 1000 (80%)                |
|                                                        |
| Seu teste de 7 dias expira em 3 dias.                  |
| [ Fazer Upgrade ] (link de cobrança)                   |
+--------------------------------------------------------+
```

---

## 4. Plano de Verificação

### Testes Automatizados / Compilação
- Garantir que o projeto compila sem erros de TypeScript (`npm run build`).

### Verificação Manual
1. **Interface do Usuário:** Validar o layout responsivo do popover em mobile e desktop.
2. **Responsividade de Tema:** Verificar se as cores do menu se adaptam corretamente aos modos Light e Dark.
3. **Cálculos de Cotas:** Alterar mockups de conta no Supabase local para validar a exibição de limites e barra de progresso.
4. **Links:** Garantir que os cliques nas tarefas e conversas direcionam para as rotas corretas.
