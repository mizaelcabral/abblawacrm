# Plan 005: LGPD Data Portability & Audit Logs

## Overview
To satisfy the remaining LGPD requirements, we need to implement:
1. **Data Portability**: Export contact list to CSV format in the Contacts dashboard, with access restricted to agents or admins, and audit-logged upon action.
2. **Audit Logging**: A centralized `audit_logs` table, a Postgres database trigger on `contacts` to automatically log modifications/creations/deletions, and a dashboard tab under Settings to display logs (restricted to admins/owners).

## Hard Rules
- Strictly read-only on uncommitted paths.
- Do not hardcode references to generated IDs in migrations.
- Verify compiling and testing before completion.

## Proposed Changes

### 1. Database Migrations
- **[NEW]** [038_lgpd_audit_logs.sql](file:///c:/Users/brand/OneDrive/Documentos/CLIENTES%20BRANDI%20AI/ABBLAWACRM/supabase/migrations/038_lgpd_audit_logs.sql)
  - Create the `audit_logs` table, set up indexes, and enable RLS.
  - Define policies allowing members of the account to read and insert logs.
  - Add the `log_contact_change` trigger function to audit creations, updates (only if personal info columns changed), and deletions, and bind it to the `contacts` table.

### 2. Settings Architecture & Tab Setup
- **[MODIFY]** [settings-sections.ts](file:///c:/Users/brand/OneDrive/Documentos/CLIENTES%20BRANDI%20AI/ABBLAWACRM/src/components/settings/settings-sections.ts)
  - Add `audit` to `SETTINGS_SECTIONS`.
  - Add `adminOnly: true` to the `SectionMeta` definition and mark `'audit'` as `adminOnly: true`.
- **[MODIFY]** [settings-rail.tsx](file:///c:/Users/brand/OneDrive/Documentos/CLIENTES%20BRANDI%20AI/ABBLAWACRM/src/components/settings/settings-rail.tsx)
  - Read `useAuth` hook and filter out any `adminOnly` settings tabs if the user is not an owner or admin.
- **[MODIFY]** [page.tsx (settings)](file:///c:/Users/brand/OneDrive/Documentos/CLIENTES%20BRANDI%20AI/ABBLAWACRM/src/app/(dashboard)/settings/page.tsx)
  - Register `audit` panel mapping. Fall back to the default tab if the user tries to deep-link to the audit tab without permission.

### 3. Audit Logs UI Panel
- **[NEW]** [audit-panel.tsx](file:///c:/Users/brand/OneDrive/Documentos/CLIENTES%20BRANDI%20AI/ABBLAWACRM/src/components/settings/audit-panel.tsx)
  - Create the UI panel showing a scrollable list of logs.
  - Retrieve audit logs sorted by date descending from the `audit_logs` table.
  - Display Date, User Email, Action type (formatted nicely), Target, and Details.

### 4. Contacts CSV Export & Manual Logging
- **[MODIFY]** [page.tsx (contacts)](file:///c:/Users/brand/OneDrive/Documentos/CLIENTES%20BRANDI%20AI/ABBLAWACRM/src/app/(dashboard)/contacts/page.tsx)
  - Add `Download` icon from `lucide-react`.
  - Implement a `handleExport` function to query all contacts from the database, build a CSV string, trigger a download, and insert a log row into the `audit_logs` table.
  - Add the "Exportar" button to the header layout.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to confirm TypeScript compiles.
- Run `npm run test` to verify all test suites continue to pass.

### Manual Verification
- Log in to the dev server with an admin account, open Settings, and verify the "Auditoria (LGPD)" tab is visible.
- Export contacts via the Contacts page, confirm the CSV file is generated, and check that a log entry for `contact.export` is added.
- Create, edit, and delete a contact, then check the "Auditoria" tab to verify that `contact.create`, `contact.update`, and `contact.delete` logs are recorded correctly with timestamps and user emails.
- Log in with a viewer or agent account, verify the "Auditoria" settings tab is hidden, and direct URLs for the tab fall back to overview.
