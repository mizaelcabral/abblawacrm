# Plano de Implementação de Tradução da Interface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traduzir todas as strings visíveis para o usuário final de inglês para português em todo o código do CRM (interfaces, modais, toasts e formulários).

**Architecture:** Substituição direta (inline) nos arquivos `.tsx` e `.ts` usando a Abordagem 1, mantendo zero dependências e seguindo os padrões linguísticos e estilos do restante do código em português.

**Tech Stack:** Next.js (React), TypeScript, Tailwind CSS.

## Global Constraints
* Traduzir apenas elementos de UI visíveis para o usuário.
* Manter mensagens técnicas de erro de APIs e campos internos do banco de dados em inglês.
* Usar termos padrão acordados: "Excluir" para "Delete", "Cancelar" para "Cancel", "Público" para "Audience", "Novo Disparo" para "New Broadcast".

---

### Task 1: Tradução do Módulo de Disparos (Broadcasts)

**Files:**
* Modify: `src/app/(dashboard)/broadcasts/[id]/page.tsx`
* Modify: `src/app/(dashboard)/broadcasts/new/page.tsx`
* Modify: `src/components/broadcasts/step1-choose-template.tsx`
* Modify: `src/components/broadcasts/step2-select-audience.tsx`
* Modify: `src/components/broadcasts/step3-personalize.tsx`
* Modify: `src/components/broadcasts/step4-schedule-send.tsx`

**Interfaces:**
* Consumes: Componentes de UI padrão (Button, Table, Dialog, DropdownMenu).
* Produces: Páginas de Disparos totalmente em português para o usuário.

- [ ] **Step 1: Modificar as strings de visualização de disparos**
  Substituir termos como "Total Recipients", "Sent", "Delivered", "Read", "Replied", "Failed", "Export CSV", "Cancel" e "Delete" em `src/app/(dashboard)/broadcasts/[id]/page.tsx`.

- [ ] **Step 2: Modificar as strings de criação de novos disparos**
  Substituir "New Broadcast", "Create and send a broadcast message...", "Template", "Audience", "Personalize", "Send", "Draft saved", "Give the broadcast a name..." em `src/app/(dashboard)/broadcasts/new/page.tsx` e nos componentes de etapas `src/components/broadcasts/step*.tsx`.

- [ ] **Step 3: Verificar visualmente as telas de disparos**
  Rodar o servidor local e validar se todos os elementos de texto da página de listagem, detalhe e wizard de disparos estão traduzidos.

---

### Task 2: Tradução do Módulo de Automações e Fluxos (Automations & Flows)

**Files:**
* Modify: `src/app/(dashboard)/automations/[id]/edit/page.tsx`
* Modify: `src/app/(dashboard)/automations/[id]/logs/page.tsx`
* Modify: `src/app/(dashboard)/automations/new/page.tsx`
* Modify: `src/app/(dashboard)/automations/page.tsx`
* Modify: `src/components/automations/automation-builder.tsx`
* Modify: `src/app/(dashboard)/flows/[id]/page.tsx`
* Modify: `src/app/(dashboard)/flows/[id]/runs/page.tsx`
* Modify: `src/app/(dashboard)/flows/page.tsx`
* Modify: `src/components/flows/...` (e.g. `flow-builder.tsx`, `flow-editor-state.tsx`, `forms/node-config-form.tsx`)

**Interfaces:**
* Consumes: Componentes de fluxo e estados do editor de fluxo.
* Produces: Telas de Automação e Editores de Fluxo em português.

- [ ] **Step 1: Traduzir telas de automações**
  Substituir "Back to Automations", "Failed to load", "Failed to load logs" e logs em `src/app/(dashboard)/automations/...`.

- [ ] **Step 2: Traduzir componentes do construtor de automações**
  Substituir strings no arquivo `src/components/automations/automation-builder.tsx`.

- [ ] **Step 3: Traduzir telas e logs de execução dos fluxos**
  Traduzir "Flow not found", "Back to flows", "The 50 most recent times this flow ran...", "No runs yet. Trigger the flow..." e status em `src/app/(dashboard)/flows/...`.

- [ ] **Step 4: Traduzir componentes e formulários de nós do editor de fluxo**
  Traduzir termos de configuração de fluxo em `src/components/flows/...` e `src/components/flows/forms/node-config-form.tsx`.

---

### Task 3: Tradução de Contatos, Inbox, Configurações e Tarefas

**Files:**
* Modify: `src/app/(dashboard)/tasks/page.tsx`
* Modify: `src/components/contacts/import-modal.tsx`
* Modify: `src/components/contacts/contact-detail-view.tsx`
* Modify: `src/components/inbox/contact-sidebar.tsx`
* Modify: `src/components/inbox/message-composer.tsx`
* Modify: `src/components/inbox/message-thread.tsx`
* Modify: `src/components/settings/whatsapp-config.tsx`
* Modify: `src/components/settings/telegram-config.tsx`
* Modify: `src/components/settings/invite-member-dialog.tsx`
* Modify: `src/components/settings/members-tab.tsx`
* Modify: `src/components/settings/meta-config.tsx`
* Modify: `src/components/settings/mcp-keys-card.tsx`
* Modify: `src/components/settings/plans-panel.tsx`
* Modify: `src/components/settings/profile-form.tsx`
* Modify: `src/components/settings/settings-overview.tsx`

**Interfaces:**
* Consumes: Componentes de contatos, chat/inbox e painéis de configuração do usuário.
* Produces: Telas de Contatos, Inbox, Configurações de Integrações (WhatsApp/Telegram/Meta) e Tarefas traduzidas.

- [ ] **Step 1: Traduzir o Kanban e visualizações do módulo de Tarefas**
  Traduzir os cabeçalhos de status ("pending" -> "Pendente", "in_progress" -> "Em andamento", "review_required" -> "Revisão necessária", "completed" -> "Concluído") e formulários associados em `src/app/(dashboard)/tasks/page.tsx`.

- [ ] **Step 2: Traduzir modais e painéis de Contatos**
  Traduzir `import-modal.tsx` e `contact-detail-view.tsx`.

- [ ] **Step 3: Traduzir Inbox / Chat**
  Traduzir a barra lateral de contato, composer de mensagem e thread de mensagens em `src/components/inbox/...`.

- [ ] **Step 4: Traduzir painéis de Configuração**
  Traduzir as páginas de configuração de planos, perfil, membros da conta, chaves MCP, e configurações das APIs Meta, WhatsApp e Telegram.
