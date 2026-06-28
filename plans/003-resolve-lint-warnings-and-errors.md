# Plan 003: Resolve Lint Warnings and Errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cabd0f3..HEAD -- src/components/settings/plans-panel.tsx src/components/settings/whatsapp-config.tsx src/components/ui/gradient-bars-background.tsx src/lib/whatsapp/phone-utils.ts src/middleware.ts src/scripts/backfill-embeddings.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `cabd0f3`, 2026-06-28

## Why this matters

The linter command `npm run lint` yields 350 problems (159 errors and 191 warnings), preventing clear reporting of code regression in development and blocking pipelines configured with strict lint verification. Unused variables, unresolved hook dependencies in React hooks (`useEffect`), incorrect casting (`any`), and outdated directives (`@ts-ignore`) are the major sources of issues. Cleaning these up lowers cognitive load, improves build speeds, and ensures runtime safety.

## Current state

- Files in scope:
  - `src/components/settings/plans-panel.tsx` — useEffect dependency issues & explicit `any` errors.
  - `src/components/settings/whatsapp-config.tsx` — unused imports, `any` parameter casting.
  - `src/components/ui/gradient-bars-background.tsx` — uses deprecated `@ts-ignore` instead of `@ts-expect-error`.
  - `src/lib/whatsapp/phone-utils.ts` — contains `let` assignments that are never reassigned.
  - `src/middleware.ts` — contains unused `options` arguments in imports/functions.
  - `src/scripts/backfill-embeddings.js` — uses CommonJS `require` imports which are forbidden by `@typescript-eslint/no-require-imports`.

## Commands you will need

| Purpose   | Command                     | Expected on success |
|-----------|-----------------------------|---------------------|
| Run lint  | `npm run lint`              | exit 0, no problems |
| Autofix   | `npx eslint --fix .`        | fixes auto-fixable  |

## Scope

**In scope**:
- The main files generating errors and warnings in the lint report.

**Out of scope**:
- Disabling ESLint rules globally in `eslint.config.mjs` (we want to fix code pattern violations, not hide them).

## Git workflow

- Branch: `advisor/003-resolve-lint-violations`
- Commit message format: `style: resolve eslint and typescript compiler warnings`

## Steps

### Step 1: Run ESLint autofix
Propose running the automatic linter fixer to resolve formatting, standard variable assignments, and trivial stylistic constraints (e.g. converting `let` to `const` in `src/lib/whatsapp/phone-utils.ts`).
**Verify**: `npx eslint --fix .` -> exits successfully, resolving auto-fixable issues.

### Step 2: Fix unused imports and variables in components
1. Open `src/components/settings/whatsapp-config.tsx` and delete the unused imports `ExternalLink` and `Settings`. Remove or ignore unused variables like `webTokenEdited`.
2. Open `src/components/settings/telegram-config.tsx` and delete the unused import `XCircle`.
3. Open `src/components/settings/settings-overview.tsx` and remove the unused variable `cap` or prefix it with `_`.
4. Open `src/middleware.ts` and remove or prefix the unused parameter `options` on line 16.

**Verify**: `npm run lint` -> check if errors in these files have cleared.

### Step 3: Resolve React Hook dependency issues
1. Open `src/components/settings/plans-panel.tsx` at line 62. The `useEffect` has a missing dependency `fetchBillingDetails`. Review the hook; add `fetchBillingDetails` to the dependency array, making sure `fetchBillingDetails` is properly wrapped in `useCallback` or defined inside/outside the hook if it triggers re-renders. If it is safe and desired to trigger once, disable it with `// eslint-disable-next-line react-hooks/exhaustive-deps`.

**Verify**: `npm run lint` -> check plans-panel.tsx results.

### Step 4: Fix `@ts-ignore` and casting errors
1. Open `src/components/ui/gradient-bars-background.tsx` at line 68. Replace `// @ts-ignore` with `// @ts-expect-error`.
2. Clean up any instances of `any` types by substituting them with proper interfaces, type mappings, or `unknown` when the shape is truly dynamic (e.g. in `plans-panel.tsx`, `whatsapp-config.tsx`, `task-worker.ts`).

**Verify**: `npm run lint` -> check error count decreases.

### Step 5: Fix require imports in node scripts
1. Open `src/scripts/backfill-embeddings.js`. Since this is a Node.js script executed outside module paths, add `/* eslint-disable @typescript-eslint/no-require-imports */` to the top of the file to inform the TypeScript linter that CommonJS `require` statements are expected here.

**Verify**: Run `npm run lint` -> exits with code 0 (no problems).

## Test plan

- Verification: Run `npm run test` and `npm run build` to confirm that resolving lint errors did not introduce behavior regressions.

## Done criteria

- [ ] `npm run lint` command completes with 0 errors and 0 warnings.
- [ ] No compilation or runtime errors are introduced.

## STOP conditions

- If adding a dependency in a `useEffect` triggers an infinite rendering loop, revert and apply the eslint disable directive inline with a comment.
