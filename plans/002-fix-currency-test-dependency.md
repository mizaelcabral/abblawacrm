# Plan 002: Fix Currency Test Dependency

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cabd0f3..HEAD -- src/lib/currency.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cabd0f3`, 2026-06-28

## Why this matters

The `formatCurrency` helper uses `new Intl.NumberFormat(undefined, ...)` in production to format currency values. This utilizes the system locale of the machine running the code. The unit tests at `src/lib/currency.test.ts` assert that formatting `1234` contains the exact string `"1,234"` (using the English thousands separator `,`). In environments using other locales (such as `pt-BR` in Brazil), the thousands separator is a dot (`.`), producing `"1.234"`, which breaks the test suite. Rewriting the test assertions to be locale-invariant fixes this test bug permanently.

## Current state

- Files in scope:
  - `src/lib/currency.test.ts` — contains the locale-dependent test suite for `formatCurrency` (lines 9-48).

Code excerpt:
```typescript
describe("formatCurrency", () => {
  it("formats whole amounts with no minor units", () => {
    // Use a non-breaking-space-tolerant check: Intl may insert NBSP.
    const out = formatCurrency(1234, "USD");
    expect(out).toContain("1,234");
    expect(out).not.toContain(".00");
  });

  // ...

  it("renders a well-formed but unknown ISO code without throwing", () => {
    // Intl is lenient here — it uses the code as the symbol.
    const out = formatCurrency(1234, "ZZZ");
    expect(out).toContain("ZZZ");
    expect(out).toContain("1,234");
  });

  it("never throws on a structurally invalid code (no DB CHECK on deals.currency)", () => {
    for (const bad of ["United States", "US", "USDD", "12", "u$d"]) {
      expect(() => formatCurrency(1234, bad)).not.toThrow();
      expect(formatCurrency(1234, bad)).toContain("1,234");
    }
  });
  
  // ...
});
```

## Commands you will need

| Purpose   | Command                                         | Expected on success |
|-----------|-------------------------------------------------|---------------------|
| Run tests | `npm run test -- currency`                      | all tests pass      |

## Scope

**In scope**:
- `src/lib/currency.test.ts`

**Out of scope**:
- `src/lib/currency.ts` (production helper)

## Git workflow

- Branch: `advisor/002-currency-locale-test-fix`
- Commit message format: `test: make currency formatting assertions locale-invariant`

## Steps

### Step 1: Replace hardcoded English comma formats with locale-invariant checks

Edit `src/lib/currency.test.ts` to determine the expected formatted representation of the number `1234` dynamically using the active runtime system locale.

Replace lines 9-48 with:
```typescript
describe("formatCurrency", () => {
  // Determine expected formatted 1234 representation under local system formatting.
  const expectedGrouped1234 = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(1234);

  it("formats whole amounts with no minor units", () => {
    const out = formatCurrency(1234, "USD");
    expect(out).toContain(expectedGrouped1234);
    // Support either dot or comma as decimal indicator
    expect(out).not.toContain(".00");
    expect(out).not.toContain(",00");
  });

  it("defaults to USD when no currency is given", () => {
    expect(formatCurrency(10)).toBe(formatCurrency(10, DEFAULT_CURRENCY));
  });

  it("treats an empty-string currency as the default", () => {
    expect(formatCurrency(10, "")).toBe(formatCurrency(10, DEFAULT_CURRENCY));
  });

  it("coerces non-finite values to 0", () => {
    expect(formatCurrency(Number.NaN, "USD")).toContain("0");
  });

  it("renders a well-formed but unknown ISO code without throwing", () => {
    const out = formatCurrency(1234, "ZZZ");
    expect(out).toContain("ZZZ");
    expect(out).toContain(expectedGrouped1234);
  });

  it("never throws on a structurally invalid code (no DB CHECK on deals.currency)", () => {
    for (const bad of ["United States", "US", "USDD", "12", "u$d"]) {
      expect(() => formatCurrency(1234, bad)).not.toThrow();
      expect(formatCurrency(1234, bad)).toContain(expectedGrouped1234);
    }
  });

  it("formats every offered currency without throwing", () => {
    for (const c of CURRENCIES) {
      expect(() => formatCurrency(1000, c.code)).not.toThrow();
    }
  });
});
```

**Verify**: Run `npm run test -- currency` and check that all tests pass.

## Test plan

- Verification: `npm run test -- currency` must pass.

## Done criteria

- [ ] All tests in `src/lib/currency.test.ts` pass successfully.
- [ ] No changes are made to `src/lib/currency.ts`.

## STOP conditions

- If `npm run test -- currency` still fails after applying the change, stop and report.
