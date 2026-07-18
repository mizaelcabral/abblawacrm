# Melhorias no Sistema de Agendamento Nativo (Pagamentos Woovi, Funil e Tarefas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar suporte a pagamentos via Pix (Woovi) antes de confirmar agendamentos, criar tarefas a partir de compromissos e cadastrar leads automaticamente no funil de vendas.

**Architecture:** 
1. Adicionar coluna `payment_required` na tabela `services`.
2. Integrar `WooviClient` ao criar agendamentos pendentes.
3. Atualizar o webhook da Woovi para confirmar agendamentos.
4. Adicionar lógica de inserção automática de deal no primeiro funil de vendas do CRM.
5. Inserir botão de "Criar Tarefa" no painel da Agenda.

**Tech Stack:** Next.js, Supabase, Woovi API, Tailwind CSS, TypeScript.

## Global Constraints
* Seguir o estilo de código existente com Tailwind CSS e TypeScript.
* Evitar código desnecessário (princípio Ponytail/YAGNI).
* Manter as APIs de agendamento compatíveis.

---

### Task 1: Banco de Dados

**Files:**
- Create: `supabase/migrations/048_add_payment_required_to_services.sql`

- [ ] **Passo 1: Escrever migração SQL**
```sql
ALTER TABLE services ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT false;
```
- [ ] **Passo 2: Executar migração no Supabase**
Run: `supabase db push` ou executar no SQL Editor.

---

### Task 2: Atualização do Cadastro de Serviços

**Files:**
- Modify: `src/app/(dashboard)/appointments/page.tsx`

- [ ] **Passo 1: Adicionar switch de pagamento no formulário de criação/edição de serviços**
Modificar o formulário do serviço para incluir o Switch do Tailwind para habilitar o pagamento.
- [ ] **Passo 2: Atualizar os payloads de POST/PUT de serviços**
Passar `payment_required` nas requisições da API `/api/services`.

---

### Task 3: Criação de Agendamentos Pendentes com Woovi Pix

**Files:**
- Modify: `src/app/api/appointments/route.ts`
- Modify: `src/app/book/[slug]/page.tsx`

- [ ] **Passo 1: Atualizar POST /api/appointments para gerar Pix se o serviço exigir pagamento**
Buscar `woovi_config` do account do profissional. Se `services.payment_required` for true, salvar o appointment com status `'pending'`, instanciar o `WooviClient` e gerar uma cobrança Pix. Retornar os dados Pix na API.
- [ ] **Passo 2: Atualizar a página pública para exibir QR Code da Woovi se necessário**
Se o agendamento retornado for `'pending'`, exibir o QR Code Pix e a chave Pix "Copia e Cola" e iniciar um intervalo que consulta o status do agendamento a cada 5 segundos até virar `'confirmed'`.

---

### Task 4: Webhook Woovi para Confirmação do Agendamento e Funil de Vendas

**Files:**
- Modify: `src/app/api/webhooks/woovi/route.ts`
- Modify: `src/app/api/appointments/route.ts` (Funil)

- [ ] **Passo 1: Tratar correlationID do agendamento no Webhook da Woovi**
Se o correlationID não bater com um pedido na tabela `orders`, buscar na tabela `appointments` e atualizar para `confirmed` quando pago.
- [ ] **Passo 2: Inserção Automática no Funil de Vendas**
Ao confirmar o agendamento (diretamente se gratuito, ou via Webhook se pago), buscar o primeiro pipeline do account e sua primeira etapa, e inserir um registro na tabela `deals`.

---

### Task 5: Criação de Tarefas na Agenda

**Files:**
- Modify: `src/app/(dashboard)/appointments/page.tsx`

- [ ] **Passo 1: Adicionar botão "Criar Tarefa"**
Ao lado do botão de cancelar, adicionar a opção de criar uma tarefa.
- [ ] **Passo 2: Implementar Modal para dados da Tarefa**
Modal simples com título pré-preenchido e data limite que dispara `POST /api/tasks`.
