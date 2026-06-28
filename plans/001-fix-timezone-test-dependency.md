# Plan 001: Fix Timezone Test Dependency

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cabd0f3..HEAD -- src/lib/dashboard/date-utils.test.ts`
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

The unit tests for date helpers in the dashboard assume the system timezone is UTC when parsing date strings in `date-utils.test.ts`. Specifically, parsing ISO string formats like `new Date("2026-05-18")` resolves to UTC midnight. In locales with negative UTC offsets (such as `America/Sao_Paulo` at UTC-3), this represents Sunday evening (May 17th), which causes the weekday calculation test for `mondayIndex` to fail. Fixing this guarantees tests pass on any developer machine or localized CI runner.

## Current state

- Files in scope:
  - `src/lib/dashboard/date-utils.test.ts` — contains the timezone-sensitive unit tests for `mondayIndex` (lines 107-123).

Code excerpt:
```typescript
describe("mondayIndex", () => {
  it("maps Monday → 0 and Sunday → 6", () => {
    expect(mondayIndex(new Date("2026-05-18"))).toBe(0); // Mon
    expect(mondayIndex(new Date("2026-05-19"))).toBe(1); // Tue
    expect(mondayIndex(new Date("2026-05-23"))).toBe(5); // Sat
    expect(mondayIndex(new Date("2026-05-24"))).toBe(6); // Sun
  });

  it("aligns with DOW_SHORT_MON_FIRST labels", () => {
    expect(DOW_SHORT_MON_FIRST[mondayIndex(new Date("2026-05-18"))]).toBe(
      "Mon",
    );
    expect(DOW_SHORT_MON_FIRST[mondayIndex(new Date("2026-05-24"))]).toBe(
      "Sun",
    );
  });
});
```

## Commands you will need

| Purpose   | Command                                         | Expected on success |
|-----------|-------------------------------------------------|---------------------|
| Run tests | `npm run test -- date-utils`                    | all tests pass      |

## Scope

**In scope**:
- `src/lib/dashboard/date-utils.test.ts`

**Out of scope**:
- `src/lib/dashboard/date-utils.ts` (production code)

## Git workflow

- Branch: `advisor/001-date-timezone-test-fix`
- Commit message format: `test: resolve timezone dependency in date-utils tests`

## Steps

### Step 1: Replace ISO String Instantiations in tests with Local Date Construct

Edit `src/lib/dashboard/date-utils.test.ts` and change string-based date parsing inside `describe("mondayIndex")` to local component construction `new Date(year, monthIndex, day)` so that they are parsed in local time (matching what `.getDay()` expects). Note that months in JS are 0-indexed (May = 4).

Replace lines 107-123 with:
```typescript
describe("mondayIndex", () => {
  it("maps Monday → 0 and Sunday → 6", () => {
    expect(mondayIndex(new Date(2026, 4, 18))).toBe(0); // Mon
    expect(mondayIndex(new Date(2026, 4, 19))).toBe(1); // Tue
    expect(mondayIndex(new Date(2026, 4, 23))).toBe(5); // Sat
    expect(mondayIndex(new Date(2026, 4, 24))).toBe(6); // Sun
  });

  it("aligns with DOW_SHORT_MON_FIRST labels", () => {
    expect(DOW_SHORT_MON_FIRST[mondayIndex(new Date(2026, 4, 18))]).toBe(
      "Mon",
    );
    expect(DOW_SHORT_MON_FIRST[mondayIndex(new Date(2026, 4, 24))]).toBe(
      "Sun",
    );
  });
});
```

**Verify**: Run `npm run test -- date-utils` and check that all tests in `date-utils.test.ts` pass cleanly.

## Test plan

- Verification: `npm run test -- date-utils` must pass.

## Done criteria

- [ ] All tests in `src/lib/dashboard/date-utils.test.ts` pass successfully.
- [ ] No changes are made to `src/lib/dashboard/date-utils.ts`.

## STOP conditions

- If `npm run test -- date-utils` still fails after applying the change, stop and report.

## Maintenance notes

- Any date-parsing in test suites should avoid pure ISO `"YYYY-MM-DD"` strings unless the system timezone is explicitly mocked or the function is UTC-based.
