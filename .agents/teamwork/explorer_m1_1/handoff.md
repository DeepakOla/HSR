# Milestone 1 Codebase & Test Infrastructure Investigation Report

## 1. Observation

### 1.1 Test Configuration & Execution (`vitest.config.ts` & `package.json`)
- **`vitest.config.ts` (lines 1–12)**:
  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
      },
    },
  });
  ```
- **`package.json` scripts (lines 7–23)**:
  - Line 15: `"typecheck": "astro check"`
  - Line 17: `"test": "vitest run"`
  - Line 18: `"test:watch": "vitest"`
  - Line 19: `"test:e2e": "playwright test"`
  - Line 9: `"build": "astro build"`
- **Dependencies (lines 24–52)**:
  - `"vitest": "^4.0.8"`
  - `"@vitest/coverage-v8": "^4.0.8"`
  - `"zod": "^4.6.7"`
  - `"typescript": "^5.9.3"`
  - `"@astrojs/check": "^0.9.12"`

### 1.2 TypeScript Configuration (`tsconfig.json`)
- **`tsconfig.json` (lines 1–22)**:
  ```json
  {
    "extends": "astro/tsconfigs/strict",
    "compilerOptions": {
      "types": [
        "node",
        "vitest/globals",
        "@cloudflare/workers-types"
      ],
      "baseUrl": ".",
      "paths": {
        "@/*": [
          "src/*"
        ]
      }
    },
    "include": [
      "src",
      "tests",
      "astro.config.mjs",
      "playwright.config.ts"
    ]
  }
  ```
- Vitest globals are enabled via `compilerOptions.types: ["node", "vitest/globals", "@cloudflare/workers-types"]`, but all existing tests explicitly import from `'vitest'`.
- Path aliases: `"@/*": ["src/*"]` is supported, but tests conventionally use relative path imports (`../src/lib/...`).

### 1.3 Test Execution Results
- Command: `npm run test`
  - Output:
    ```
    RUN  v4.1.12 C:/Users/HP/Downloads/HSR CNG

    ✓ tests/schedule.test.ts (3 tests) 416ms
    ✓ tests/appointment-slots.test.ts (10 tests) 188ms
    ✓ tests/security.test.ts (6 tests) 250ms
    ✓ tests/utils.test.ts (3 tests) 124ms
    ✓ tests/routes.test.ts (1 test) 579ms
    ✓ tests/expiry.test.ts (5 tests) 23ms
    ✓ tests/pricing.test.ts (11 tests) 26ms

    Test Files  7 passed (7)
         Tests  39 passed (39)
      Duration  31.84s
    Exit code: 0
    ```
- Command: `npm run typecheck`
  - Output:
    ```
    > hsr-green-energy@0.1.0 typecheck
    > astro check

    [@astrojs/cloudflare] Enabling compile-time image optimization. Images will be pre-optimized at build time.
    [types] Generated 2.64s
    [check] Getting diagnostics for Astro files in C:\Users\HP\Downloads\HSR CNG...
    Result (79 files): 
    - 0 errors
    - 0 warnings
    - 0 hints
    Exit code: 0
    ```

### 1.4 Test Runner Patterns in Existing Tests
Examined existing test files:
- `tests/utils.test.ts` (lines 1–17):
  ```typescript
  import { describe, expect, it } from 'vitest';
  import { normalizePhoneIndian, normalizeUtr, normalizeVehicleRegistration } from '../src/lib/utils';

  describe('input normalization', () => {
    it('normalizes Indian numbers to E.164', () => {
      expect(normalizePhoneIndian('98765 43210')).toBe('+919876543210');
    });

    it('throws on invalid phone', () => {
      expect(() => normalizePhoneIndian('123')).toThrow();
    });

    it('normalizes registration and utr', () => {
      expect(normalizeVehicleRegistration('hr 36 ab 1234')).toBe('HR36AB1234');
      expect(normalizeUtr('  abcd 1234  ')).toBe('ABCD1234');
    });
  });
  ```
- `tests/pricing.test.ts` (lines 1–35):
  - Uses `it.each([...])('description %i', (arg1, ...) => { ... })` for parameterized test tables.
  - Uses `expect(() => fn()).toThrow(RangeError)`.
  - Uses `expect(...).toEqual(...)` for object equivalence.

### 1.5 Existing Codebase Conventions in `src/lib/`
- Directory contents of `src/lib/`:
  - `appointment-slots.ts`
  - `auth.ts`
  - `booking-engine.ts`
  - `constants.ts` (contains `Locale = 'en' | 'hi'`, `ACTIVE_RESERVATION_STATES`, `SETUP_REQUIRED`)
  - `content.ts`
  - `db.ts`
  - `expiry.ts`
  - `i18n.ts` (contains `t(locale)`, `otherLocale(locale)`, `localizePath(pathname, to)`)
  - `pricing.ts`
  - `rate-limit.ts`
  - `runtime-env.ts`
  - `schedule-ranges.ts`
  - `schemas.ts` (contains Zod schemas: `localeSchema`, `createHoldSchema`, `submitEvidenceSchema`)
  - `security.ts` (origin and header validation)
  - `types.ts` (interfaces for `BusinessSettings`, `SlotAvailability`, `VehicleCategory`)
  - `utils.ts` (normalization, tokens, hashes, responses)
- Current `normalizeVehicleRegistration` in `src/lib/utils.ts` (lines 27–29):
  ```typescript
  export function normalizeVehicleRegistration(value: string): string {
    return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  }
  ```
  - Crucial finding: Notice that the existing function in `src/lib/utils.ts` permits `-` (hyphens) (`[^A-Z0-9-]`) and does not validate format.
  - Usages of `normalizeVehicleRegistration`:
    - `src/lib/booking-engine.ts`: line 4 (`import`), line 197 (`const normalizedReg = normalizeVehicleRegistration(...)`)
    - `src/pages/api/admin/register.ts`: line 6 (`import`), line 56 (`const normalizedRegistration = normalizeVehicleRegistration(...)`)
    - `tests/utils.test.ts`: line 2 (`import`), line 14 (`expect(normalizeVehicleRegistration('hr 36 ab 1234')).toBe('HR36AB1234')`)
- Current schema in `src/lib/schemas.ts` (lines 5–15):
  ```typescript
  export const createHoldSchema = z.object({
    locale: localeSchema,
    slotSnapshotId: z.number().int().positive(),
    categoryId: z.number().int().positive(),
    vehicleType: z.string().trim().min(2).max(100),
    customerName: z.string().trim().min(2).max(120),
    mobile: z.string().trim().min(10).max(20),
    vehicleRegistration: z.string().trim().min(4).max(20),
    source: z.literal('WEB').default('WEB'),
    idempotencyKey: z.string().trim().min(8).max(120),
  });
  ```
  - `vehicleRegistration` currently only checks `min(4).max(20)` without regex format validation.

---

## 2. Logic Chain

1. **Step 1: Test Runner Identification**
   - Observation 1.1 reveals `vitest.config.ts` matching `tests/**/*.test.ts` in node environment and `package.json` test script `"test": "vitest run"`.
   - Therefore, any new test file for Milestone 1 must be placed at `tests/vehicle-registration.test.ts` so that Vitest will automatically pick it up.

2. **Step 2: Syntax and Style Conventions**
   - Observation 1.4 reveals that existing tests use:
     - `import { describe, expect, it } from 'vitest';`
     - Relative path imports from `../src/lib/<module>`
     - Standard assertion vocabulary: `toBe`, `toEqual`, `toThrow`, `toBeNull`, `toBe(true)`, `toBe(false)`.
     - Parameterized tests with `it.each([...])`.

3. **Step 3: Verification Script Baseline**
   - Observations 1.3 verify that both `npm run test` (39 tests across 7 suites) and `npm run typecheck` (`astro check` across 79 files) currently pass cleanly with 0 errors and 0 warnings.
   - Any new module in `src/lib/vehicle-registration.ts` and test suite in `tests/vehicle-registration.test.ts` must maintain this 100% pass rate.

4. **Step 4: Module Placement & Contract Alignment**
   - Observation 1.5 indicates that an elementary `normalizeVehicleRegistration` is currently located in `src/lib/utils.ts`.
   - `PROJECT.md` (§Milestones & Code Layout) and `SCOPE.md` designate `src/lib/vehicle-registration.ts` as the official module for M1 with the contract:
     ```typescript
     export interface VehicleRegistrationResult {
       valid: boolean;
       normalized: string;
       error?: string;
       format?: 'STATE_SERIES' | 'BH_SERIES';
     }

     export function normalizeVehicleRegistration(value: string): string;
     export function validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult;
     ```
   - Normalization requirement in `PROJECT.md`: "Strips all whitespace, hyphens, and non-alphanumeric chars; converts to uppercase." (Unlike `utils.ts` which retained hyphens).
   - Regex validation requirements:
     - State series: `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`
     - Bharat series: `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`
   - Bilingual error messages: English (`en`) and Hindi (`hi`) support.

---

## 3. Caveats

- `src/lib/utils.ts` currently exports an older `normalizeVehicleRegistration` function that keeps hyphens. In Milestone 1, `src/lib/vehicle-registration.ts` is introduced. To prevent breakage or conflicting exports, `utils.ts` can either re-export `normalizeVehicleRegistration` from `vehicle-registration.ts` or consumers can be migrated in accordance with the orchestration plan.
- Playwright E2E tests (`npm run test:e2e`) run against browser instances and were not executed as part of this unit test infra exploration; Vitest unit tests (`npm run test`) and typecheck (`npm run typecheck`) are the authoritative unit validation gates.
- No other caveats.

---

## 4. Conclusion

- The test environment is powered by Vitest v4.0.8, running under Node environment with 0 config friction.
- Tests should be placed in `tests/vehicle-registration.test.ts` matching `tests/**/*.test.ts`.
- Tests must import `describe, expect, it` from `'vitest'` and use relative import `../src/lib/vehicle-registration`.
- Validation commands:
  - Unit tests: `npm run test`
  - TypeScript diagnostics: `npm run typecheck`
- Existing codebase helpers: `src/lib/constants.ts` defines `Locale = 'en' | 'hi'`, and `src/lib/schemas.ts` defines Zod validation schemas that will consume the validation module.

---

## 5. Verification Method

To independently verify the test infrastructure and codebase baseline:
1. Run unit test suite:
   ```powershell
   npm run test
   ```
   *Expected result*: 7 test files pass, 39 tests pass, exit code 0.
2. Run TypeScript check:
   ```powershell
   npm run typecheck
   ```
   *Expected result*: `astro check` reports 0 errors, 0 warnings across 79 files, exit code 0.
3. Inspect `vitest.config.ts` line 5 to verify pattern:
   `include: ['tests/**/*.test.ts']`
4. Inspect `tsconfig.json` to verify strict configuration and module inclusion:
   `include: ["src", "tests", "astro.config.mjs", "playwright.config.ts"]`
