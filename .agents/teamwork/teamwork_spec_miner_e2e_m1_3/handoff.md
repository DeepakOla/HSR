# Test Infrastructure Specification Mining Report

**Role**: Test Infra Spec Miner (`teamwork_spec_miner_e2e_m1_3`)  
**Workspace**: `c:\Users\HP\Downloads\HSR CNG`  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_spec_miner_e2e_m1_3`  
**Target Milestone**: E2E-M1 (Test Infrastructure & Harness)  
**Parent Agent**: `5865c3e7-f765-4be5-a99d-c71fca150f03`  
**Date**: 2026-11-12  

---

## 1. Observation

### 1.1 Existing Test Suite Audit
Direct inspection of `tests/` and test configurations revealed:
- **Unit Test Files (`tests/`)**:
  - `tests/appointment-slots.test.ts` (86 lines): Pure unit test verifying slot interval arithmetic (15/20 min), work-unit generation, and contiguous runs.
  - `tests/expiry.test.ts` (31 lines): Pure unit test verifying 3-year statutory addition, leap years (`2024-02-29` -> `2027-02-28`), and ISO formatting.
  - `tests/pricing.test.ts` (35 lines): Pure unit test verifying base price (₹2,500/cylinder) and 18% GST calculation. *Does not test flat ₹500 advance or balance calculation.*
  - `tests/routes.test.ts` (25 lines): File system existence checks for English and Hindi `.astro` files in `src/pages`.
  - `tests/schedule.test.ts` (59 lines): Unit test checking versioned schedule slices across horizon windows.
  - `tests/security.test.ts` (57 lines): Unit test checking same-origin request headers and `no-store` cache headers.
  - `tests/utils.test.ts` (17 lines): Unit test checking phone normalization (`+91`) and basic space stripping. *Does not validate State or Bharat Series regex.*
- **Existing E2E Test Suite (`tests/e2e/`)**:
  - Only a single test file exists: `tests/e2e/layout.spec.ts` (14 lines), testing viewport horizontal overflow across 8 widths.
  - **Zero automated customer booking journeys, zero receptionist workflows, zero owner console tests, and zero accessibility (axe-core) audits exist.**
- **Existing Integration Test Suite (`tests/integration/`)**:
  - **Zero integration test files exist.** No tests execute SQL against Cloudflare D1, verify atomic transactions (`db.batch`), test database triggers (`bookings_capacity_guard`), or mock Cloudflare Access RS256 JWT authentication.

### 1.2 Configuration & Dependency Inspection
- **`vitest.config.ts`**:
  ```ts
  export default defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
    },
  });
  ```
  Running in pure `node` environment without DOM globals or Cloudflare Worker bindings.
- **`playwright.config.ts`**:
  Configured with `baseURL: 'http://127.0.0.1:4321'`, `timeout: 30_000`, `headless: true`, and webServer command `npm run dev -- --host 127.0.0.1 --port 4321`.
- **Runtime & Environment (`Node v24.22.3`)**:
  - Node.js runtime is **v24.22.3** on Windows x64.
  - Built-in native SQLite (`node:sqlite`) with `DatabaseSync` is present and functional without any native build tool dependencies (`const { DatabaseSync } = require('node:sqlite')`).
  - Web Crypto API (`globalThis.crypto.subtle`) is natively supported for RS256 key pair generation, JWK export, and digital signing/verification.
- **Package Status in `package.json`**:
  - `vitest`: `^4.0.8` (installed)
  - `@playwright/test` & `playwright`: `^1.56.1` (installed)
  - `@axe-core/playwright`: not yet in `package.json` (requires installation or programmatic injection via Playwright)
  - `better-sqlite3`: not in `package.json`; native `node:sqlite` provides zero-dependency in-memory SQLite support.

### 1.3 Database Schema & Trigger Invariants (`migrations/`)
- Existing migrations:
  - `0001_init.sql`: Core schema (`business_settings`, `weekly_schedule`, `slot_templates`, `daily_slot_snapshots`, `vehicle_categories`, `bookings`, `booking_audit_events`, `staff_users`, `cylinder_register`, `localized_content`).
  - `0002_capacity_guard.sql`: SQLite BEFORE INSERT trigger `bookings_capacity_guard` enforcing slot closure, slot capacity, and daily capacity limits via `SELECT RAISE(ABORT, '...')`.
  - `0003_amount_paid.sql`: Adds `amount_paid_paise` column to `bookings`.
  - `0004_schedule_versions.sql`: Multi-version schedule architecture.
  - `0005_cylinder_work_units.sql`: Work units model with `booking_slot_allocations` table enforcing `UNIQUE(slot_snapshot_id)`.
  - Planned: `0006_advance_pricing.sql` (Flat ₹500 advance defaults, server-side max 6 public limit).

---

## 2. Logic Chain

1. **Test Infrastructure Deficit**:
   - The platform relies on critical SQLite triggers (`bookings_capacity_guard`), unique constraints (`booking_slot_allocations.slot_snapshot_id`), and Cloudflare Access RS256 JWT verification (`requireRole`).
   - Testing these via mocking isolated JS functions provides false confidence because transactional integrity and SQL constraints are never exercised.
   - Therefore, a dual-layer test harness is mandatory:
     1. **In-Memory D1 Mock (`tests/helpers/d1-mock.ts`)**: Implements the Cloudflare D1 API (`prepare`, `bind`, `first`, `all`, `run`, `batch`, `exec`) backed by SQLite (`node:sqlite` or `better-sqlite3`). It applies all migrations (`0001` through `0006`) sequentially on initialization, faithfully executing triggers and transactions.
     2. **Synthetic Cloudflare Access JWT Helper (`tests/helpers/jwt-mock.ts`)**: Uses Web Crypto to generate RS256 keypairs, signs synthetic assertions with configurable payloads (`email`, `aud`, `iss`, `exp`), and mocks the Access JWKS certs endpoint.
2. **Synthetic Fixtures Isolation**:
   - Section 5.9 and AGENTS.md mandate that **all tests use synthetic data only**. Real customer PII (names, phone numbers, vehicle registrations) and production credentials must never be used.
   - `tests/fixtures/synthetic-data.ts` must provide standardized fixtures for valid/invalid vehicle registrations (State & BH series), phone numbers, staff roles (Owner, Receptionist, Unauthorized), and payment configurations (configured vs SETUP_REQUIRED).
3. **Playwright E2E & axe-core Strategy**:
   - Playwright runs against the local Astro dev server (`http://127.0.0.1:4321`).
   - Browser test scenarios must cover:
     - Scenario 1: Customer booking journey (single-tap date, vehicle selection, linked time dropdowns, UPI QR, UTR submission, status page).
     - Scenario 2: Reception desk operations (login, payment verification, check-in, hydro test completion, cylinder register).
     - Scenario 3: Owner console (pricing updates, interval switch, bilingual CMS editing).
     - Scenario 4: Responsive & Accessibility (viewports 320px–1440px, touch targets >=44px, keyboard navigation, axe-core WCAG 2.1 AA audit).
   - Accessibility audits must run across both mobile (375x667) and desktop (1280x800) viewports, testing color contrast, touch targets, visible focus outlines, and ARIA attributes (`aria-current="step"`).
4. **4-Tier Test Matrix Mapping**:
   - **Tier 1 (Feature Coverage)**: 15 features × >=5 tests = 75+ tests in `tests/integration/tier1-features.test.ts`.
   - **Tier 2 (Boundary & Corner Cases)**: 15 features × >=5 boundary tests = 75+ tests in `tests/integration/tier2-boundaries.test.ts`.
   - **Tier 3 (Pairwise Interactions)**: Combinations across interval, vehicle, cylinders, payment config, booking source, and locale in `tests/integration/tier3-pairwise.test.ts`.
   - **Tier 4 (Real-World E2E)**: Playwright scenarios in `tests/e2e/*.spec.ts`.

---

## 3. Caveats

1. **Native SQLite vs `better-sqlite3`**:
   Node v24 includes native `node:sqlite` (`DatabaseSync`), which is completely self-contained and avoids Windows C++ compilation errors. If `better-sqlite3` is preferred, it must be installed via npm; otherwise `node:sqlite` can serve as the direct backend engine for `d1-mock.ts`.
2. **`@axe-core/playwright` Dependency**:
   `@axe-core/playwright` is not currently in `package.json`. It can be added as a devDependency (`npm i -D @axe-core/playwright`), or alternatively axe-core can be loaded into the page context via `page.evaluate()` or `page.addScriptTag()`. Adding `@axe-core/playwright` to `devDependencies` is the recommended standard.
3. **Astro Dev Server Startup**:
   Playwright runs against `npm run dev -- --host 127.0.0.1 --port 4321`. In local testing, ensure port 4321 is not occupied before launching `npm run test:e2e`.
4. **Read-Only Invariant**:
   This report extracts and drafts specifications only. Implementation of test harness modules (`d1-mock.ts`, `jwt-mock.ts`, `synthetic-data.ts`) and test specs is reserved for the implementation subagents.

---

## 4. Conclusion

The testing infrastructure requires three foundational harness modules in `tests/helpers/` and `tests/fixtures/`, followed by four test suites (`tier1-features.test.ts`, `tier2-boundaries.test.ts`, `tier3-pairwise.test.ts`, and `tests/e2e/*.spec.ts`).

The complete, unabridged draft for `TEST_INFRA.md` is provided below in Section 7, ready to be created at the project root by the test infrastructure implementer.

---

## 5. Verification Method

To verify the test infrastructure once implemented:
1. **Lint & Typecheck**:
   ```powershell
   npm run lint
   npm run typecheck
   ```
2. **Unit & Integration Test Execution**:
   ```powershell
   npm run test
   ```
   *Expected*: All unit and integration test files in `tests/` pass (target >=150 passing tests across Tiers 1–3).
3. **Playwright E2E Suite Execution**:
   ```powershell
   npm run test:e2e
   ```
   *Expected*: All Playwright test files in `tests/e2e/` pass across Chromium and Mobile viewports without timeout or accessibility violations.

---

## 6. Features Discovered & Edge Cases

### Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Test Harness | In-Memory D1 Mock | SQLite-backed Cloudflare D1 compatibility driver running all migrations and triggers | SQL statements, parameters, batches | `D1Result`, `D1Response`, query results | Rejects with SQLite error or trigger ABORT | `SCOPE.md`, `0002_capacity_guard.sql` |
| 2 | Test Harness | RS256 JWT Mock Helper | Web Crypto synthetic Cloudflare Access JWT generator and mock JWKS verifier | Email, role, aud, iss, exp, nbf | Signed RS256 JWT string, JWKS object | Generates invalid/expired tokens for error testing | `src/lib/auth.ts`, `SCOPE.md` |
| 3 | Test Fixtures | Synthetic Test Data | Isolated synthetic fixtures for vehicles, customers, staff, and payment states | Synthetic data keys | Standardized test objects | N/A (Pure fixtures) | Section 5.9, `analysis.md` |
| 4 | Runner | Vitest Node Runner | Vitest test runner executing pure unit and D1 integration test suites | Test patterns `tests/**/*.test.ts` | Pass/Fail report, coverage metrics | Exits non-zero on test assertion failure | `vitest.config.ts`, `package.json` |
| 5 | Runner | Playwright E2E Runner | Playwright browser runner with automated Astro dev server lifecycle | Browser actions on `http://127.0.0.1:4321` | Pass/Fail report, trace, screenshot | Fails on timeout, assertion error, uncaught page error | `playwright.config.ts`, `package.json` |
| 6 | A11y | axe-core WCAG Audit | Automated accessibility auditing for WCAG 2.1 AA compliance | Page DOM under test, ruleset tags | Accessibility violation list | Fails test if `violations.length > 0` | Section 5.9, `analysis.md` |
| 7 | Concurrency | SQLite Concurrency Harness | Simulation of parallel booking requests against SQLite transactional boundaries | Concurrent async calls to `createHold` | 1 success (201), remaining 409 Conflict | Aborts second transaction with constraint error | `0005_cylinder_work_units.sql` |

### Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | D1 Mock Trigger | Insert booking exceeding slot capacity | `bookings_capacity_guard` aborts with message `'SLOT_CAPACITY_EXCEEDED'` |
| 2 | D1 Mock Allocation | Insert two bookings with identical `slot_snapshot_id` | SQLite aborts with `UNIQUE constraint failed: booking_slot_allocations.slot_snapshot_id` |
| 3 | RS256 JWT Mock | JWT with `exp` in the past (expired by 1 sec) | `verifyAccessJwt` returns `null`; endpoint returns HTTP 401 |
| 4 | RS256 JWT Mock | JWT with valid signature but `iss` does not match `ACCESS_TEAM_DOMAIN` | `verifyAccessJwt` returns `null`; endpoint returns HTTP 401 |
| 5 | Playwright Viewport | Mobile viewport (320px width) | `scrollWidth - clientWidth <= 1` (zero horizontal overflow) |
| 6 | axe-core Audit | Calendar navigation buttons (`←`, `→`) | Validates touch targets >= 44x44px and visible `:focus-visible` rings |

---

## 7. Draft Content for `TEST_INFRA.md`

Below is the complete architectural specification and operational guide to be published as `TEST_INFRA.md` at the project root:

````markdown
# Test Infrastructure & Execution Architecture Specification

This document provides the authoritative specification for all testing infrastructure, test runner configurations, mock harnesses, synthetic fixtures, and automated test execution across the HSR Green Energy platform.

---

## 1. Test Architecture Overview

```
                               ┌───────────────────────────────────────────────────────────┐
                               │                    HSR Test Architecture                  │
                               └───────────────────────────────────────────────────────────┘
                                                             │
                              ┌──────────────────────────────┴──────────────────────────────┐
                              ▼                                                             ▼
               ┌───────────────────────────────┐                             ┌───────────────────────────────┐
               │      Vitest Test Runner       │                             │    Playwright Test Runner     │
               │  - Pure Unit Tests            │                             │  - Real-World E2E Scenarios   │
               │  - D1 Integration Tests       │                             │  - Customer Booking Journeys  │
               │  - Auth & Security Tests      │                             │  - Receptionist Operations    │
               │  - SQLite Concurrency Tests   │                             │  - Owner CMS & Admin Tests    │
               │  - Tier 1, Tier 2, Tier 3     │                             │  - axe-core WCAG 2.1 AA Audit │
               └───────────────────────────────┘                             └───────────────────────────────┘
                              │                                                             │
               ┌──────────────┴──────────────┐                               ┌──────────────┴──────────────┐
               ▼                             ▼                               ▼                             ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────┐
│    In-Memory D1 Mock        │ │  Synthetic RS256 JWT Helper │ │  Astro Local Dev Server     │ │    axe-core Playwright    │
│  - node:sqlite / better-    │ │  - Web Crypto RS256 keypair │ │  - http://127.0.0.1:4321    │ │  - WCAG 2.1 AA rulesets   │
│    sqlite3 backend          │ │  - Mock JWKS certs endpoint │ │  - Auto-spawned by runner   │ │  - Mobile (375x667)       │
│  - Full schema migrations   │ │  - Configurable aud/exp/nbf │ │  - Synthetic mock handlers  │ │  - Desktop (1280x800)     │
│  - SQLite triggers & guards │ │  - Role testing (OWNER/     │ │                             │                             │
│  - D1 batch() transactions  │ │    RECEPTIONIST)            │ │                             │                             │
└─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘
```

---

## 2. Directory Layout

All test files, helpers, and fixtures must follow this directory layout:

```
tests/
├── helpers/
│   ├── d1-mock.ts            # Cloudflare D1 in-memory SQLite wrapper & migration runner
│   └── jwt-mock.ts           # Synthetic RS256 Cloudflare Access JWT generator & JWKS mock
├── fixtures/
│   └── synthetic-data.ts     # Standardized synthetic customer, vehicle, staff & payment data
├── integration/
│   ├── tier1-features.test.ts # 75+ Tier 1 Feature Coverage tests (15 features × 5 tests)
│   ├── tier2-boundaries.test.ts # 75+ Tier 2 Boundary & Corner Case tests (15 features × 5 tests)
│   └── tier3-pairwise.test.ts # Pairwise Cross-Feature Combinations matrix tests
├── e2e/
│   ├── customer-booking.spec.ts # Scenario 1: Customer booking journey, linked time dropdowns, UPI/UTR
│   ├── reception-desk.spec.ts   # Scenario 2: Receptionist operations, check-in, cylinder register
│   ├── owner-console.spec.ts    # Scenario 3: Owner settings, pricing updates, bilingual content CMS
│   ├── accessibility.spec.ts    # Scenario 4: Responsive viewports & axe-core WCAG 2.1 AA audits
│   └── layout.spec.ts           # Existing viewport horizontal overflow tests
├── appointment-slots.test.ts # Pure unit: Slot interval arithmetic & contiguous runs
├── expiry.test.ts            # Pure unit: 3-year statutory addition & leap year math
├── pricing.test.ts           # Pure unit: Service base price & 18% GST calculation
├── routes.test.ts            # Pure unit: Bilingual route file existence
├── schedule.test.ts          # Pure unit: Versioned schedule slices across horizons
├── security.test.ts          # Pure unit: Same-origin headers & cache headers
└── utils.test.ts             # Pure unit: Phone normalization & string helpers
```

---

## 3. Test Runner Invocations

The following standard commands must be supported in `package.json`:

| Command | Runner | Scope / Target | Purpose |
|---|---|---|---|
| `npm run test` | Vitest | `tests/**/*.test.ts` | Runs all unit and integration tests (Tiers 1–3) |
| `npm run test:watch` | Vitest | Interactive watch mode | Development watch runner for instant feedback |
| `npm run test:e2e` | Playwright | `tests/e2e/**/*.spec.ts` | Runs all browser E2E and accessibility tests |
| `npm run typecheck` | Astro Check | Entire workspace | TypeScript type validation across `.ts` and `.astro` |
| `npm run lint` | ESLint | Entire workspace | Code quality and style checks |
| `npm run build` | Astro | Production bundle | Astro production build verification |

---

## 4. In-Memory D1 Mock Harness (`tests/helpers/d1-mock.ts`)

### 4.1 Interface Contract
The mock must fully satisfy the Cloudflare D1 `D1Database`, `D1PreparedStatement`, `D1Result`, and `D1Response` interfaces using Node's built-in `node:sqlite` (`DatabaseSync`) or `better-sqlite3`.

```typescript
export interface MockD1Database {
  prepare(query: string): MockD1PreparedStatement;
  batch<T = unknown>(statements: MockD1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  close(): void;
}

export interface MockD1PreparedStatement {
  bind(...params: unknown[]): MockD1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Response>;
  raw<T = unknown>(): Promise<T[]>;
}
```

### 4.2 Migration Execution
Upon creation via `createMockD1()`, the harness must:
1. Initialize an in-memory SQLite database (`:memory:`).
2. Execute all SQL migrations in `migrations/` in alphanumeric order:
   - `0001_init.sql`
   - `0002_capacity_guard.sql`
   - `0003_amount_paid.sql`
   - `0004_schedule_versions.sql`
   - `0005_cylinder_work_units.sql`
   - `0006_advance_pricing.sql` (when created)
3. Ensure foreign keys and triggers are enabled (`PRAGMA foreign_keys = ON;`).
4. Wrap `batch()` operations in a single `BEGIN IMMEDIATE ... COMMIT / ROLLBACK` transaction to faithfully simulate Cloudflare D1 batch behavior.

---

## 5. Synthetic Cloudflare Access JWT Generator (`tests/helpers/jwt-mock.ts`)

### 5.1 Architecture
`src/lib/auth.ts` verifies Cloudflare Access assertions by:
1. Extracting the JWT from `cf-access-jwt-assertion`.
2. Verifying the header `alg: 'RS256'` and `kid`.
3. Validating the issuer `https://${ACCESS_TEAM_DOMAIN}` and audience `ACCESS_AUDIENCE`.
4. Checking timestamps (`exp > now`, `nbf <= now`, `iat <= now + 60`).
5. Fetching public keys from `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` and verifying the RS256 signature using Web Crypto.

### 5.2 Helper Interface
```typescript
export interface MockJwtOptions {
  email?: string;
  role?: 'OWNER' | 'RECEPTIONIST';
  issuer?: string;
  audience?: string;
  expiresInSeconds?: number;
  notBeforeOffsetSeconds?: number;
  kid?: string;
}

export interface MockJwtHarness {
  generateToken(options?: MockJwtOptions): Promise<string>;
  getJwks(): { keys: JsonWebKey[] };
  setupFetchMock(teamDomain: string): void;
}
```

The helper generates an RSA-2048 keypair on startup, provides signed JWT strings for test requests, and mocks the `fetch` call to return matching public JWKs.

---

## 6. Playwright Test Setup & axe-core Accessibility Audit

### 6.1 Playwright Configuration (`playwright.config.ts`)
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // Prevent port/database race conditions
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

### 6.2 axe-core Accessibility Audit Specification (`tests/e2e/accessibility.spec.ts`)
Accessibility testing must enforce WCAG 2.1 Level AA standards using `@axe-core/playwright`.

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const auditRoutes = [
  '/en/',
  '/hi/',
  '/en/book/',
  '/hi/book/',
  '/en/services/',
  '/hi/services/',
  '/en/contact/',
  '/hi/contact/',
  '/admin/login/',
];

for (const route of auditRoutes) {
  test(`axe WCAG 2.1 AA audit on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('domcontentloaded');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
}
```

Additionally, manual assertions must verify:
1. **Touch Target Dimensions**: All interactive buttons (e.g. calendar month navigation, step pills) have minimum bounding box of 44x44px.
2. **Visible Focus Rings**: Form inputs and calendar dates display a distinct `:focus-visible` outline.
3. **ARIA Step Announcement**: The wizard step bar provides `aria-current="step"` on the active step.
4. **Keyboard Navigation**: The entire customer booking flow (Steps 1–5) is navigable using `Tab`, `Shift+Tab`, `Space`, and `Enter`.

---

## 7. Synthetic Data Fixtures Specification (`tests/fixtures/synthetic-data.ts`)

All tests must use synthetic fixtures to ensure zero customer PII leakage and complete isolation:

```typescript
export const SYNTHETIC_DATA = {
  customers: {
    standard: {
      name: 'Rajesh Kumar',
      mobile: '9876543210',
      expectedE164: '+919876543210',
    },
    hindi: {
      name: 'सुरेश शर्मा',
      mobile: '9123456789',
      expectedE164: '+919123456789',
    },
    invalidShortPhone: {
      name: 'Invalid User',
      mobile: '12345',
    },
  },
  vehicles: {
    delhiCar: {
      raw: 'dl 01 ab 1234',
      normalized: 'DL01AB1234',
      type: 'Car',
      model: 'Maruti WagonR',
      format: 'STATE_SERIES',
    },
    haryanaTruck: {
      raw: 'HR-26-DQ-5551',
      normalized: 'HR26DQ5551',
      type: 'Truck',
      model: 'Tata 407',
      format: 'STATE_SERIES',
    },
    bharatSeries: {
      raw: '22 bh 1234 aa',
      normalized: '22BH1234AA',
      type: 'Car',
      model: 'Honda City',
      format: 'BH_SERIES',
    },
    invalidGarbage: 'GARBAGE123',
    invalidSpecial: 'DL@01#1234',
  },
  staff: {
    owner: {
      email: 'owner@hsr-test.internal',
      role: 'OWNER' as const,
    },
    receptionist: {
      email: 'reception@hsr-test.internal',
      role: 'RECEPTIONIST' as const,
    },
    unauthorized: {
      email: 'outsider@hsr-test.internal',
    },
  },
  payments: {
    configured: {
      vpaId: 'hsrgreenenergy@okaxis',
      payeeName: 'HSR Green Energy',
      advancePaise: 50000, // ₹500
    },
    unconfigured: {
      vpaId: 'SETUP_REQUIRED',
      payeeName: 'SETUP_REQUIRED',
      advancePaise: 50000,
    },
  },
};
```

---

## 8. Comprehensive 4-Tier Test Matrix Mapping

| Tier | Test File | Test Count | Scope |
|---|---|---|---|
| **Tier 1** | `tests/integration/tier1-features.test.ts` | 75+ tests (15 × 5) | Comprehensive coverage of all 15 core features: flat ₹500 advance, pre-write UPI gate, 1–6 cylinder limit, Truck auto-4, 15/20m schedules, linked time dropdowns, contiguous work units, 1-tap date advance, vehicle registration validation, bilingual parity, owner CMS, admin auth & roles, concurrency triggers, customer booking journey, accessibility states. |
| **Tier 2** | `tests/integration/tier2-boundaries.test.ts` | 75+ tests (15 × 5) | Exhaustive boundary and corner cases: min/max cylinder counts (1 vs 6), zero/negative inputs, empty/whitespace VPA strings, tampered cylinder counts (7, 12, 13), vehicle model 100 vs 101 chars, zero-length schedules, first/last operating hours, horizon boundaries (day 45 vs 46), shortest/longest valid registrations (`DL1A1` vs `UP16AB1234`), leap day bookings, expired JWTs (by 1s), concurrent slot races. |
| **Tier 3** | `tests/integration/tier3-pairwise.test.ts` | 20+ tests | Pairwise combination matrix crossing interval (15/20m) × vehicle type (Car/Truck/LCV) × cylinder count (1/4/6/7) × payment gate state × booking channel (Web/Reception) × locale (EN/HI). |
| **Tier 4** | `tests/e2e/*.spec.ts` | 4 specs (20+ flows) | Real-world browser workflows: Customer booking journey (`customer-booking.spec.ts`), Reception desk verification and register entry (`reception-desk.spec.ts`), Owner console configuration & bilingual CMS (`owner-console.spec.ts`), and axe-core WCAG 2.1 AA audits (`accessibility.spec.ts`). |
````
