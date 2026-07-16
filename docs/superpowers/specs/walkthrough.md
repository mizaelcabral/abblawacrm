# Walkthrough: Tradução da Interface de Usuário para Português

Neste projeto de tradução, varremos a base de código do CRM localizando e traduzindo todas as strings visíveis para o usuário final de inglês para português.

## Alterações Realizadas

### 1. Módulo de Disparos (Broadcasts)
* **Página de Detalhes (`src/app/(dashboard)/broadcasts/[id]/page.tsx`):** Tradução de estatísticas ("Total de Destinatários", "Enviados", "Entregues", "Lidos", "Respondidos", "Falhas"), botões de ação ("Excluir", "Cancelar", "Confirmar"), placeholders e mensagens de feedback.
* **Criação de Disparo (`src/app/(dashboard)/broadcasts/new/page.tsx` & componentes em `src/components/broadcasts/`):** Tradução completa dos passos do wizard ("Template", "Público", "Personalizar", "Enviar") e mensagens de validação e toasts de rascunhos.
* **Página de Listagem (`src/app/(dashboard)/broadcasts/page.tsx`):** Tradução dos cabeçalhos da tabela e estados vazios.

### 2. Módulo de Automações e Fluxos (Automations & Flows)
* **Editor de Fluxos & Construtor de Automações (`src/components/automations/` & `src/components/flows/`):** Tradução de labels de nós, formulários de configuração de gatilhos, e avisos/erros visuais do editor.
* **Logs e Execuções (`src/app/(dashboard)/flows/[id]/runs/page.tsx` & `src/app/(dashboard)/automations/[id]/logs/page.tsx`):** Tradução de descrições e contadores de execuções.

### 3. Módulo de Tarefas (Kanban), Contatos, Inbox e Configurações
* **Kanban de Tarefas (`src/app/(dashboard)/tasks/page.tsx`):** Tradução de colunas de status ("Pendente", "Em andamento", "Revisão necessária", "Concluído"), selects de edição e diálogos.
* **Perfil e Painéis de Configuração (`src/components/settings/`):** Tradução de abas de membros, configurações da API WhatsApp, Telegram, Meta e planos.
* **Barra Lateral e Inbox (`src/components/inbox/`):** Tradução de botões de chat, composer de mensagens e thread.

---

## Verificação e Testes

* **Testes Automatizados:** Executada a suíte de testes com sucesso. Todos os 435 testes do projeto passaram sem regressões.
* **Build de Produção:** O projeto foi compilado estaticamente com sucesso usando o Next.js.
