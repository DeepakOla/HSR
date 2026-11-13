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
│  - node:sqlite native       │ │  - Web Crypto RS256 keypair │ │  - http://127.0.0.1:4321    │ │  - WCAG 2.1 AA rulesets   │
│    DatabaseSync backend     │ │  - Mock JWKS certs endpoint │ │  - Auto-spawned by runner   │ │  - Mobile (375x667)       │
│  - Full schema migrations   │ │  - Configurable aud/exp/nbf │ │  - Synthetic mock handlers  │ │  - Desktop (1280x800)     │
│  - SQLite triggers & guards │ │  - Role testing (OWNER/     │ │                             │                             │
│  - D1 batch() transactions  │ │    RECEPTIONIST)            │ │                             │                             │
└─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘
```

---

## 2. Directory Layout

All test files, helpers, and fixtures follow this directory layout:

```
tests/
├── helpers/
│   ├── d1-mock.ts            # Cloudflare D1 in-memory SQLite wrapper & migration runner
│   ├── jwt-mock.ts           # Synthetic RS256 Cloudflare Access JWT generator & JWKS mock
│   └── test-harness.test.ts  # Verification suite for D1 mock & JWT mock infrastructure
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
├── utils.test.ts             # Pure unit: Phone normalization & string helpers
└── vehicle-registration.test.ts # Pure unit: Indian State & Bharat (BH) series registration validation
```

---

## 3. Test Runner Invocations

The following standard commands are supported in the workspace:

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
The mock fully satisfies Cloudflare D1's `D1Database`, `D1PreparedStatement`, `D1Result`, and `D1Response` interfaces using Node 24 native `node:sqlite` (`DatabaseSync`):

```typescript
export interface MockD1Database extends D1Database {
  prepare(query: string): MockD1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  dump(): Promise<ArrayBuffer>;
  close(): void;
  getRaw(): DatabaseSync;
}

export interface MockD1PreparedStatement extends D1PreparedStatement {
  bind(...params: unknown[]): MockD1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Response>;
  raw<T = unknown>(): Promise<T[]>;
  getSQL(): string;
  getParams(): unknown[];
}
```

### 4.2 Migration Execution
Upon creation via `createMockD1()`, the harness:
1. Initializes a brand-new in-memory SQLite database (`:memory:`).
2. Sets `PRAGMA foreign_keys = ON;`.
3. Discovers and executes all SQL migrations in `migrations/*.sql` in alphanumeric order:
   - `0001_init.sql`: Core relational tables, CTE 45-day snapshot seeding, audit tables.
   - `0002_capacity_guard.sql`: Initial capacity guard trigger.
   - `0003_amount_paid.sql`: Amount paid column and non-negative constraints.
   - `0004_schedule_versions.sql`: Multi-version schedule architecture.
   - `0005_cylinder_work_units.sql`: Work units model, allocation uniqueness, work-unit capacity guard trigger.
   - `0006_advance_pricing.sql` (and future migrations automatically loaded).
4. Emulates Cloudflare D1's `batch()` atomic execution using `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. If any statement fails (e.g. trigger abortion or constraint violation), the entire batch rolls back.
5. Provides hermetic isolation: each test call to `createMockD1()` produces a fresh, independent in-memory database.

---

## 5. Synthetic Cloudflare Access JWT Generator (`tests/helpers/jwt-mock.ts`)

### 5.1 Architecture
`src/lib/auth.ts` validates Cloudflare Access assertions by:
1. Extracting the JWT from `cf-access-jwt-assertion`.
2. Verifying the header `alg: 'RS256'` and `kid`.
3. Validating the issuer `https://${ACCESS_TEAM_DOMAIN}` and audience `ACCESS_AUDIENCE`.
4. Checking timestamps (`exp > now`, `nbf <= now`, `iat <= now + 60`).
5. Fetching public keys from `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` and verifying the RS256 signature using standard Web Crypto (`crypto.subtle`).

### 5.2 Helper Interface
```typescript
export interface MockJwtOptions {
  email?: string;
  issuer?: string;
  audience?: string | string[];
  kid?: string;
  algorithm?: string;
  expiresInSeconds?: number;
  nbfOffsetSeconds?: number;
  iatOffsetSeconds?: number;
  claims?: Partial<MockJwtClaims>;
}

export interface MockJwksServer {
  domain: string;
  issuer: string;
  audience: string;
  keyPair: MockKeyPair;
  jwks: { keys: Array<JsonWebKey & { kid: string; use: string }> };
  createToken: (options?: MockJwtOptions) => Promise<string>;
  createAuthHeaders: (options?: MockJwtOptions) => Promise<Headers>;
  createAuthRequest: (url: string, init?: RequestInit, options?: MockJwtOptions) => Promise<Request>;
  uninstall: () => void;
}
```

The helper generates a genuine 2048-bit RSA keypair using Web Crypto, signs synthetic assertions with configurable payloads, and intercepts `globalThis.fetch` to return matching public JWKs from the mock certs endpoint.

---

## 6. Playwright Test Setup & axe-core Accessibility Audit

### 6.1 Playwright Configuration (`playwright.config.ts`)
Configured with `baseURL: 'http://127.0.0.1:4321'`, `timeout: 30_000`, `headless: true`, and automatic local Astro dev server lifecycle (`npm run dev -- --host 127.0.0.1 --port 4321`).

### 6.2 axe-core Accessibility Audit Specification (`tests/e2e/accessibility.spec.ts`)
Automated accessibility tests enforce WCAG 2.1 Level AA across:
- Route matrix: `/en/`, `/hi/`, `/en/book/`, `/hi/book/`, `/en/services/`, `/hi/services/`, `/en/contact/`, `/hi/contact/`, `/admin/login/`.
- Touch target dimensions: minimum 44×44px interactive bounding box.
- Keyboard navigation: complete booking flow navigable via `Tab`, `Shift+Tab`, `Space`, `Enter`.
- Focus visibility: `:focus-visible` rings on all interactive elements.
- ARIA step announcements: `aria-current="step"` on active wizard steps.

---

## 7. Synthetic Data Fixtures Specification (`tests/fixtures/synthetic-data.ts`)

To guarantee zero customer PII leakage and complete isolation, all tests must draw from standardized synthetic data:

- **Customers**: Standard, Hindi-localized, and invalid phone number formats with expected E.164 normalization.
- **Vehicles**: Valid Indian State/UT series registrations, valid Bharat (BH) series registrations, vehicle types (Car, Taxi, Tempo, Van, LCV, Truck, Bus, Other), and invalid/boundary format variations.
- **Staff Users**: Valid OWNER role, valid RECEPTIONIST role, unauthorized user, and inactive staff users.
- **Payment Configurations**: Fully configured UPI merchant settings vs `SETUP_REQUIRED` and whitespace variations for fail-closed pre-write payment gating verification.

---

## 8. Comprehensive 4-Tier Test Matrix Mapping

| Tier | Test File | Target Count | Scope |
|---|---|---|---|
| **Tier 1** | `tests/integration/tier1-features.test.ts` | 75+ tests (15 × 5) | Comprehensive coverage of all 15 core features: flat ₹500 advance, pre-write UPI gate, 1–6 cylinder limit, Truck auto-4, 15/20m schedules, linked time dropdowns, contiguous work units, 1-tap date advance, vehicle registration validation, bilingual parity, owner CMS, admin auth & roles, concurrency triggers, customer booking journey, accessibility states. |
| **Tier 2** | `tests/integration/tier2-boundaries.test.ts` | 75+ tests (15 × 5) | Exhaustive boundary and corner cases: min/max cylinder counts (1 vs 6), zero/negative inputs, empty/whitespace VPA strings, tampered cylinder counts (7, 12, 13), vehicle model 100 vs 101 chars, zero-length schedules, first/last operating hours, horizon boundaries (day 45 vs 46), shortest/longest valid registrations (`DL1A1` vs `UP16AB1234`), leap day bookings, expired JWTs (by 1s), concurrent slot races. |
| **Tier 3** | `tests/integration/tier3-pairwise.test.ts` | 20+ tests | Pairwise combination matrix crossing interval (15/20m) × vehicle type (Car/Truck/LCV) × cylinder count (1/4/6/7) × payment gate state × booking channel (Web/Reception) × locale (EN/HI). |
| **Tier 4** | `tests/e2e/*.spec.ts` | 4 specs (20+ flows) | Real-world browser workflows: Customer booking journey (`customer-booking.spec.ts`), Reception desk verification and register entry (`reception-desk.spec.ts`), Owner console configuration & bilingual CMS (`owner-console.spec.ts`), and axe-core WCAG 2.1 AA audits (`accessibility.spec.ts`). |
