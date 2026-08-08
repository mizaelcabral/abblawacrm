# Especificação de Design: Sistema de Agendamento de Saúde e Serviços Físicos/Digitais

**Data:** 2026-08-08  
**Projeto:** ABBLAWACRM  
**Autor:** Antigravity AI Specialist

---

## 1. Visão Geral

Este documento especifica a nova arquitetura para o módulo de **Agendamentos do ABBLAWACRM**, transformando-o em um sistema robusto de alta performance voltado para médicos, profissionais de saúde e prestadores de serviços físicos e digitais.

---

## 2. Objetivos Principais

1. **Painel Visual de Disponibilidade (Grid Semanal e Exceções):**
   - Configuração de dias habilitados/desabilitados (Segunda a Domingo).
   - Múltiplos blocos de horário por dia (ex: 08:00–12:00 e 14:00–18:00) com suporte a horário de almoço/descanso.
   - Duração configurável de consulta (15, 30, 45, 60, 90 min) e tempo de preparação/buffer entre atendimentos (ex: 10 min de assepsia/pausa).
   - Gestão de datas de exceção (bloqueio de feriados, folgas e férias).

2. **Atendimento Presencial vs. Telemedicina (Online):**
   - Suporte a consultas online com links dinâmicos/fixos (Google Meet, Zoom, Jitsi, Dr. Consulta) salvos nas configurações do serviço/profissão.
   - Suporte a consultas presenciais com endereço do consultório e envio automático do Google Maps.
   - Formulário de Triagem / Anamnese pré-agendamento (Perguntas personalizadas, motivo da consulta, sintomas).

3. **Branding Opcional (Toggles para Foto do Profissional & Logo da Clínica):**
   - Campos e **toggles opcionais de ativação** (`show_provider_avatar`, `show_clinic_logo`). O tenant escolhe se deseja habilitar e exibir a Foto do Profissional ou a Logo da Clínica na página de agendamento e no widget.

4. **Widget Embeddable para Sites e Landing Pages:**
   - Gerador de snippet iFrame e Script Tag Javascript (`<script src="..." data-widget="..."></script>`).
   - Layout responsivo, tema personalizável (Dark/Light mode) para incorporação direta em Elementor, WordPress ou páginas externas.

5. **Régua de Disparos e Notificações (WhatsApp via Evolution API):**
   - **Confirmação Imediata:** Resumo + Link da Sala Online ou Endereço + Botão iCal.
   - **Lembrete de 24h:** Solicitação de confirmação (Sim/Não) para evitar faltas (*no-show*).
   - **Lembrete de 1h:** Envio do link final da consulta online ou direções para o consultório.
   - **Integração com CRM:** Emissão de eventos para automações do CRM e movimentação de Leads no Kanban.

---

## 3. Modelo de Dados (Supabase / Postgres)

### 3.1 Tabela `service_availability` (Disponibilidade Semanal)
- `id` (uuid, primary key)
- `profile_id` (uuid, references profiles.id)
- `day_of_week` (smallint, 0-6, onde 0 = Domingo)
- `start_time` (time, ex: '08:00:00')
- `end_time` (time, ex: '12:00:00')
- `is_active` (boolean, default true)

### 3.2 Tabela `availability_exceptions` (Bloqueio de Feriados/Férias)
- `id` (uuid, primary key)
- `profile_id` (uuid, references profiles.id)
- `exception_date` (date)
- `reason` (text, opcional, ex: "Feriado de Carnaval", "Férias")
- `is_blocked` (boolean, default true)

### 3.3 Tabela `services` (Extensão para Saúde, Branding Opcional e Modalidade)
- `location_type` (varchar: 'online' | 'presencial' | 'ambos')
- `online_meeting_url` (text, link fixo de transmissão ou template)
- `physical_address` (text, endereço completo da clínica/consultório)
- `buffer_minutes` (integer, default 0, ex: 10 min entre consultas)
- `provider_name` (text, nome exibido do profissional, ex: "Dr. João Silva")
- `provider_avatar_url` (text, foto do profissional)
- `show_provider_avatar` (boolean, default false - toggle de exibição opcional)
- `clinic_name` (text, nome da clínica)
- `clinic_logo_url` (text, logo da clínica/empresa)
- `show_clinic_logo` (boolean, default false - toggle de exibição opcional)
- `custom_questions` (jsonb, array de perguntas de anamnese: `[{ id, label, required, type }]`)

### 3.4 Tabela `appointments` (Extensão para Atendimento & Notificações)
- `meeting_url` (text, link gerado/associado para a sala de videochamada)
- `location_address` (text, cópia do endereço presencial)
- `anamnesis_answers` (jsonb, respostas do paciente)
- `reminder_24h_sent` (boolean, default false)
- `reminder_1h_sent` (boolean, default false)
- `confirmed_by_lead` (boolean, default false)

---

## 4. Componentes de Interface

1. **`AvailabilityGridEditor` (`src/components/appointments/AvailabilityGridEditor.tsx`)**
   - Editor visual em abas/matriz com seletores de hora, adicionador de turnos e bloqueio de exceções por calendário.
2. **`AppointmentServicesConfig` (`src/components/appointments/AppointmentServicesConfig.tsx`)**
   - Modal/aba de configuração de serviços com suporte a foto do profissional, logo da clínica, toggles opcionais de exibição, modalidade (Online/Presencial), link da sala e formulário de anamnese.
3. **`EmbeddedWidgetModal` (`src/components/appointments/EmbeddedWidgetModal.tsx`)**
   - Gerador do snippet de código embeddable com pré-visualização em tempo real.
4. **`PublicBookingFlow` (`src/app/book/[slug]/page.tsx` & `/widget/[widgetKey]`)**
   - Fluxo otimizado mobile com exibição condicional (se ativado pelo tenant) da Foto do Profissional e Logo da Clínica, seleção de modalidade, data/horário, anamnese e confirmação instantânea/Pix.

---

## 5. Cron & Worker de Disparos de Notificação

- API Endpoint de Cron `/api/cron/appointments-reminders` (protegido por `CRON_SECRET`).
- Busca agendamentos nas próximas 24 horas (`reminder_24h_sent = false`) e nas próximas 1 hora (`reminder_1h_sent = false`).
- Utiliza o serviço de mensagem do WhatsApp (`Evolution API`) para realizar o envio das mensagens com templates personalizados da conta.

---

## 6. Plano de Testes e Validação

- **Testes Unitários:** Validação de slots livres considerando turnos, exceções, agendamentos existentes e tempo de buffer.
- **Testes de Integração:** Fluxo de agendamento público e geração de confirmação.
- **Validação Manual:** Teste do editor visual no dashboard e visualização do widget responsivo ativando/desativando os toggles de foto e logo.
