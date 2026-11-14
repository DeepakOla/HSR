# Scope: E2E Testing Suite Track

## Architecture
- In-memory / mock D1 test harness (`better-sqlite3` or local D1 runner) enabling automated integration testing of SQL schema, migrations, triggers (`bookings_capacity_guard`), and transactions.
- Synthetic RS256 Cloudflare Access JWT assertion generator for mocking Cloudflare Access authentication in tests.
- Playwright browser E2E test harness in `tests/e2e/`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Vehicle Registration Validation | State & BH series regex, normalization, server & client parity | E2E-M2, E2E-M3 | PROJECT.md F1 |
| 2 | Flat ₹500 Advance & Pricing | ₹500 flat advance, balance calculation, snapshot preservation | E2E-M2, E2E-M3 | PROJECT.md F2 |
| 3 | Pre-Write UPI Payment Gating | Rejection before D1 insert when VPA is SETUP_REQUIRED | E2E-M2, E2E-M3 | PROJECT.md F3 |
| 4 | Server-Side Public Cylinder Limit | Max 6 cylinders for WEB source, anti-tampering | E2E-M2, E2E-M3 | PROJECT.md F4 |
| 5 | Single-Tap Date Progression | Instant advancement to step 2 upon selecting available date | E2E-M2, E2E-M3 | PROJECT.md F5 |
| 6 | Vehicle Selection & Truck Preselection | Truck defaults to 4 cylinders; manual override; vehicle types | E2E-M2, E2E-M3 | PROJECT.md F6 |
| 7 | Public 1–6 Cylinder Dropdown & Contact Routing | Dropdown shows 1-6; "More than 6" halts online self-service | E2E-M2, E2E-M3 | PROJECT.md F7 |
| 8 | Linked Time Dropdowns & Finish Time | Hour dropdown -> Exact start time with finish time | E2E-M2, E2E-M3 | PROJECT.md F8 |
| 9 | Staff / Admin Login Footer Link | Bilingual footer link to /admin/login/; trailing slash handling | E2E-M2, E2E-M3 | PROJECT.md F9 |
| 10 | Receptionist & Register Validation Parity | Symmetric vehicle registration validation in receptionist booking and cylinder register | E2E-M2, E2E-M3 | PROJECT.md F10 |
| 11 | Safe Structured Owner Content CMS | Owner Console Section 04 bilingual CMS with safe JSON rendering | E2E-M2, E2E-M3 | PROJECT.md F11 |
| 12 | PESO-Compliant Content Copy | Verified technical copy adhering to PESO Gas Cylinders Rules 2016 | E2E-M2, E2E-M3 | PROJECT.md F12 |
| 13 | Concurrency & Overlapping Booking Prevention | D1 trigger `bookings_capacity_guard` & transaction atomicity | E2E-M2, E2E-M3, E2E-M4 | PROJECT.md F13 |
| 14 | Customer Booking Journey & Status Page | Hold creation -> UPI QR -> UTR submission -> status lookup without PII | E2E-M2, E2E-M3, E2E-M4 | PROJECT.md F14 |
| 15 | Responsive Layout & Accessibility (WCAG 2.1 AA) | Touch targets (44px), focus rings, aria-current, contrast | E2E-M2, E2E-M3, E2E-M4 | PROJECT.md F15 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E-M1 | Test Infrastructure & Harness | `tests/helpers/d1-mock.ts`, `tests/helpers/jwt-mock.ts`, `tests/fixtures/synthetic-data.ts`, `TEST_INFRA.md` | none | IN_PROGRESS |
| E2E-M2 | Tier 1 Feature Coverage Suite | `tests/integration/tier1-features.test.ts` (>=5 test cases per feature across all 15 features) | E2E-M1 | PLANNED |
| E2E-M3 | Tier 2 Boundary & Corner Cases Suite | `tests/integration/tier2-boundaries.test.ts` (>=5 boundary cases per feature across all 15 features) | E2E-M1, E2E-M2 | PLANNED |
| E2E-M4 | Tier 3 Combinations & Tier 4 Real-World E2E Scenarios | `tests/integration/tier3-pairwise.test.ts`, `tests/e2e/*.spec.ts` (Playwright E2E browser journeys) | E2E-M1, E2E-M2, E2E-M3 | PLANNED |
| E2E-M5 | Verification, Audit & Publication | Full test suite execution, audit pass, publish `TEST_READY.md` at project root, notify parent | E2E-M1–E2E-M4 | PLANNED |

## Code Layout (Tests)
- `tests/helpers/`
  - `d1-mock.ts`: `better-sqlite3` wrapper for Cloudflare D1 compatibility, running all migrations and triggers
  - `jwt-mock.ts`: Synthetic RS256 Cloudflare Access JWT generator and mock JWKS verifier
- `tests/fixtures/`
  - `synthetic-data.ts`: Shared synthetic test data (customers, vehicles, staff, payment configs)
- `tests/integration/`
  - `tier1-features.test.ts`: 75+ Tier 1 feature coverage tests (15 features × 5 tests)
  - `tier2-boundaries.test.ts`: 75+ Tier 2 boundary and corner case tests (15 features × 5 tests)
  - `tier3-pairwise.test.ts`: Pairwise cross-feature combination matrix tests
- `tests/e2e/`
  - `customer-booking.spec.ts`: Scenario 1 Customer booking journey, single-tap date, linked dropdowns, UPI/UTR
  - `reception-desk.spec.ts`: Scenario 2 Receptionist operations, manual bookings, check-in, cylinder register
  - `owner-console.spec.ts`: Scenario 3 Owner settings, pricing, schedule changes, bilingual content CMS
  - `accessibility.spec.ts`: Mobile/desktop viewports, touch targets, keyboard navigation, axe-core WCAG audit
