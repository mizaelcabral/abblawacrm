# Spec de Design: Tradução da Interface de Usuário para Português

**Data:** 2026-06-29  
**Autor:** Antigravity  
**Status:** Em Revisão  

---

## 1. Escopo e Objetivos

O objetivo deste projeto é traduzir todas as strings visíveis para o usuário final de inglês para português em todo o código do CRM, focando estritamente em elementos de UI (interfaces de usuário).

### O que SERÁ traduzido:
* Textos de botões (ex: "Cancel", "Delete", "Save", "Add")
* Rótulos de formulários e campos (ex: "Name", "Audience", "Due Date")
* Cabeçalhos e células de tabelas visíveis (ex: "Status", "Delivered", "Read", "Failed")
* Mensagens de toast/notificações de sucesso/erro destinadas ao usuário (ex: "Draft saved", "Failed to delete")
* Placeholders de inputs (ex: "Search...", "Enter a name")
* Títulos de seções, páginas e cards (ex: "New Broadcast", "Quick actions")

### O que NÃO será traduzido:
* Chaves internas de banco de dados e APIs (ex: `status: "failed"`, `"sending"`)
* Mensagens internas de erro técnicas de APIs destinadas apenas ao console ou debug de desenvolvedores
* Nomes de variáveis, funções e arquivos no código-fonte
* Comentários no código (a menos que façam parte de explicações que possam influenciar de forma direta a UI)

---

## 2. Abordagem de Implementação

Utilizaremos a **Abordagem 1: Tradução direta inline**. As strings visíveis serão substituídas diretamente nos componentes TSX por seus equivalentes em português. Isso mantém a simplicidade e consistência com o restante do projeto, que já utiliza predominantemente português.

---

## 3. Principais Mapeamentos de Tradução

Abaixo estão os termos recorrentes encontrados na busca pelo código e suas respectivas traduções:

| Termo em Inglês | Tradução Adotada | Contexto |
| :--- | :--- | :--- |
| `Delete` / `Delete this broadcast` | `Excluir` / `Excluir esta transmissão` | Botões de ação, diálogos de confirmação |
| `Cancel` | `Cancelar` | Botões de cancelamento |
| `Confirm` / `Confirm delete` | `Confirmar` / `Confirmar exclusão` | Confirmação de ações críticas |
| `Save` / `Save Draft` | `Salvar` / `Salvar como Rascunho` | Botões de salvar formulários |
| `New Broadcast` | `Novo Disparo` | Títulos e botões |
| `Audience` | `Público` | Etapa de criação de disparo, filtros |
| `Personalize` | `Personalizar` | Etapa de personalização |
| `Send` | `Enviar` | Etapa final de disparo |
| `Total Recipients` | `Total de Destinatários` | Estatísticas de disparo |
| `Sent` | `Enviado(s)` | Estatísticas de disparo / Status da mensagem |
| `Delivered` | `Entregue(s)` | Estatísticas de disparo / Status da mensagem |
| `Read` | `Lido(s)` | Estatísticas de disparo / Status da mensagem |
| `Replied` | `Respondido(s)` | Estatísticas de disparo / Status da mensagem |
| `Failed` | `Falhou` / `Falha(s)` | Estatísticas de disparo / Status da mensagem |
| `Export CSV` | `Exportar CSV` | Botões de exportação |
| `Unknown` / `Unknown contact` | `Desconhecido` / `Contato desconhecido` | Textos padrão em tabelas e listas |
| `Failed to load...` | `Falha ao carregar...` | Mensagens de erro de UI |
| `Back to...` / `← Back to flows` | `Voltar para...` / `← Voltar para fluxos` | Botões de navegação |

---

## 4. Plano de Verificação

### Verificação Manual
1. Abrir as páginas do CRM em ambiente local após as alterações (dashboard, disparos, tarefas, contatos, automações, fluxos).
2. Simular as ações que contêm modais e toasts (ex: tentar excluir um item, enviar um formulário incompleto) para garantir que as mensagens de toast e confirmação estejam em português.
3. Verificar o alinhamento visual após as traduções para garantir que textos mais longos em português não quebrem o layout.
