# Exhaustive QA & Accessibility Investigation and Test Matrix Specification

**Role**: Agent D — QA and Accessibility Engineer (`teamwork_explorer`)  
**Workspace**: `c:\Users\HP\Downloads\HSR CNG`  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_4`  
**Date**: 2026-11-12  
**Target Branch**: `copilot/build-cng-cylinder-hydro-testing-website`  
**PR Reference**: `https://github.com/DeepakOla/HSR/pull/1`

---

## 1. Executive Summary

This investigation conducted a thorough, read-only audit of the entire testing architecture, all Astro/React routes, form components, backend APIs, responsive states, and accessibility mechanisms within the HSR Green Energy platform.

### Key Discoveries & Architectural Gaps
1. **Existing Test Suite State**:
   - The repository contains only **6 unit test files** in `tests/` covering isolated pure functions (`pricing.test.ts`, `appointment-slots.test.ts`, `schedule.test.ts`, `utils.test.ts`, `expiry.test.ts`, `security.test.ts`).
   - Vitest runs in a standard Node.js environment (`environment: 'node'`) without DOM emulation (`happy-dom`/`jsdom`) and without Cloudflare Worker bindings.
   - **Zero integration tests** exist that interact with Cloudflare D1 databases or Cloudflare Access authentication. D1 operations, transactional batches, triggers, and migrations are entirely untested in automated CI.
   - `playwright.config.ts` points to `./tests/e2e`, but **zero E2E test files exist** in the repository. The complete customer journey and staff portals have zero automated browser test coverage.
2. **Critical Functional & Safety Defects (Section 5.9 Gap Analysis)**:
   - **UPI Payment Gating Failure**: In `src/pages/api/booking/create-hold.ts`, `createHold()` commits D1 database allocations *before* verifying whether merchant UPI credentials (`vpa_id`, `vpa_payee_name`) are configured. When credentials are `SETUP_REQUIRED`, customer holds are created and slots are locked for 15 minutes, but `upiUri` is null. Customers receive no payment instructions, locking station capacity unnecessarily.
   - **Public Cylinder Limit & API Tampering**: The public customer dropdown in `BookingWizard.tsx` offers 1–12 cylinders (instead of the required 1–6 and "More than 6"). Furthermore, public APIs (`/api/booking/create-hold`, `/api/public/availability`) do not validate `cylinderCount <= 6`, allowing external tampering to reserve 7–12 cylinders online.
   - **Vehicle Registration Validation Void**: In `src/lib/schemas.ts`, vehicle registration only requires `min(4).max(20)`. `normalizeVehicleRegistration` accepts arbitrary alphanumeric strings. Neither Indian State Series (`DL01AB1234`) nor Bharat Series (`22BH1234AA`) are validated on the client or server.
   - **Missing Linked Dropdowns**: Time selection in `BookingWizard.tsx` is implemented as a flat button grid rather than the required two linked dropdowns (Hour selection first, Exact Start Time selection second with finish time display).
   - **Missing Single-Tap Date Progression**: Date selection in Step 1 requires tapping a date and then pressing a redundant "Continue" button. Single-tap progression to Step 2 is not implemented.
   - **Missing Owner CMS & Editor**: No content management API (`/api/admin/content`) or owner UI exists to edit the English/Hindi content for About, Services, How It Works, or Contact pages. Pages display placeholder fallbacks (`SETUP_REQUIRED`).
   - **Missing Admin Link & Role Isolation**: The website footer in `BaseLayout.astro` lacks a "Staff / Admin Login" link. Receptionists are currently blocked from reading categories 7–12 because `/api/admin/categories` GET is restricted to `OWNER` only.
3. **Accessibility (A11y) & Responsive Status**:
   - Touch targets for calendar month navigation buttons (`←` and `→`) lack minimum touch dimensions (failing 44x44px/48x48px mobile touch target requirements).
   - Calendar unavailable dates rely solely on red background color (`#fde8e7` with `#a12622` text), presenting WCAG 1.4.1 (Use of Color) issues.
   - Disabled calendar date text (`#969e99`) has an insufficient contrast ratio of ~2.8:1 against white, failing WCAG 1.4.3 (Contrast Minimum).
   - Step progress indicator lacks `aria-current="step"`. Dynamic step transitions do not manage keyboard focus, dumping keyboard users to the document root.

---

## 2. Detailed Audit of Existing Test Suite

### 2.1 File Inventory and Coverage Analysis

```
tests/
├── appointment-slots.test.ts (86 lines)  - Unit: Slot generation, 15/20 min intervals, consecutive runs
├── expiry.test.ts            (31 lines)  - Unit: 3-year addition, leap years (2024-02-29), date validation
├── pricing.test.ts           (35 lines)  - Unit: Base + 18% GST calculation, discount isolation, invalid price errors
├── schedule.test.ts          (59 lines)  - Unit: Schedule version range slicing across horizons
├── security.test.ts          (57 lines)  - Unit: Same-origin header validation, no-store headers, WEB source default
└── utils.test.ts             (17 lines)  - Unit: Indian phone normalization (+91), basic space stripping in reg/utr
```

| Metric | Current State | Required State | Deficit |
|---|---|---|---|
| **Unit Test Files** | 6 files (285 total lines) | >=12 files | Missing Auth, DB, Schemas, Content, CMS, Pricing Advance |
| **Integration Test Files** | 0 files | >=6 files | Missing D1 Batch, Concurrency, Triggers, Access Auth |
| **E2E Spec Files** | 0 files (`tests/e2e/` empty) | >=4 comprehensive specs | Zero customer/staff browser tests exist |
| **Total Test Count** | 22 unit tests | >=150 automated tests | 128+ missing test cases across Tiers 1–4 |
| **Code Coverage** | ~18% (pure lib utils only) | >=85% statement/branch | All core routes, components, APIs untested |

### 2.2 Environment and Mocking Architecture Audit

1. **Vitest Configuration (`vitest.config.ts`)**:
   ```ts
   export default defineConfig({
     test: {
       include: ['tests/**/*.test.ts'],
       environment: 'node',
       coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
     },
   });
   ```
   - Running in `node` without DOM globals (`window`, `document`, `HTMLElement`).
   - Cloudflare runtime module `cloudflare:workers` (imported in `src/lib/runtime-env.ts`) cannot resolve in standard Node without mocking or miniflare.
2. **Cloudflare D1 Mocking**:
   - Currently **completely absent**. No tests execute SQL queries against D1.
   - The platform relies on critical SQLite triggers (`bookings_capacity_guard`), foreign key cascades, and unique constraints (`booking_slot_allocations.slot_snapshot_id`) which are completely unverified in automated tests.
3. **Cloudflare Access Mocking**:
   - `src/lib/auth.ts` imports web crypto and calls `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` to fetch RS256 JWKS keys.
   - There is no test mock for JWKS retrieval, JWT signing, or audience/issuer verification. Consequently, `verifyAccessJwt()`, `getStaffContext()`, and `requireRole()` have zero automated tests.
4. **Playwright Configuration (`playwright.config.ts`)**:
   - Configured to launch `npm run dev -- --host 127.0.0.1 --port 4321` and execute tests against `http://127.0.0.1:4321`.
   - Because `tests/e2e` is empty, running `npm run test:e2e` exits with zero tests found.

---

## 3. Gap Analysis against Section 5.9 Requirements

### 3.1 Requirement-by-Requirement Analysis

#### 1. ₹500 Flat Advance and Balance Calculations
- **Specification**: Flat ₹500 advance per booking for options 1–6. Balance = Total Payable - ₹500. Total = Base (₹2,500 * count) + 18% GST (₹450 * count).
- **Current State**: `vehicle_categories` seeded in migration `0005_cylinder_work_units.sql` with `advance_paise = NULL`. `calculateServicePrice` in `pricing.ts` only computes base and GST, with no advance or balance calculation.
- **Identified Gap**: Missing flat ₹500 default logic, missing balance calculation helper, missing database seed migration `0006_advance_pricing.sql`, missing Owner Settings edit tests.

#### 2. Online Payment Disabled When UPI Missing (Phone/WhatsApp Fallback)
- **Specification**: If `vpa_id` or `vpa_payee_name` is missing or `SETUP_REQUIRED`, hold creation must be blocked before any database write. The UI must direct customers to Phone/WhatsApp.
- **Current State**: In `src/pages/api/booking/create-hold.ts`, hold is created in D1 and slots allocated regardless of UPI readiness. `upiUri` is null, leaving the customer with an active hold and no payment QR/intent.
- **Identified Gap**: Backend payment gate missing; API must return HTTP 422 `PAYMENT_UNAVAILABLE` without writing to D1. Wizard must detect payment status on load and show Phone/WhatsApp fallback.

#### 3. Public Cylinder-Count Limit of 1–6 & API Tampering Defense
- **Specification**: Public dropdown offers 1–6 cylinders and "More than 6". Selecting "More than 6" shows contact info. Public APIs (`/api/booking/create-hold`, `/api/public/availability`) must enforce max 6 cylinders and reject tampering for 7+. Receptionist manual bookings retain 1–12 support.
- **Current State**: Public dropdown in `BookingWizard.tsx` shows 1–12 cylinders. Public APIs accept `cylinderCount` up to 12 (or 20 in availability).
- **Identified Gap**: No server-side boundary check in public booking API; no test attempting to book 7 cylinders via `POST /api/booking/create-hold` to verify 400/422 rejection; no test verifying receptionist can book 7–12.

#### 4. Truck Default of 4 Cylinders
- **Specification**: Selecting vehicle type "Truck" automatically sets cylinder count to 4. User can change it. Other vehicles default to 1.
- **Current State**: Logic exists in `BookingWizard.tsx` line 134, but has zero component or E2E tests.
- **Identified Gap**: No automated verification of state changes when switching between Truck, Car, and other vehicle types.

#### 5. 15- and 20-minute Schedule Calculations
- **Specification**: System must support 15-min or 20-min intervals. 6 cylinders = 120 mins (20-min interval) or 90 mins (15-min interval). Schedule changes project future daily snapshots from effective date.
- **Current State**: Supported in `appointment-slots.ts`, but schedule version transition logic in `schedule.ts` and `extendFutureSnapshots` is untested against live D1 instances.
- **Identified Gap**: No integration test verifying schedule version migration from 20-min to 15-min, snapshot generation, and continuous slot matching.

#### 6. Hour Dropdown and Exact-Time Dropdown Filtering
- **Specification**: Two linked dropdowns: (1) Hour selector ("6 AM", "7 AM"), (2) Exact time selector ("06:00", "06:20") showing finish time. Dynamically populated from actual schedule.
- **Current State**: `BookingWizard.tsx` displays a flat button list. Two linked dropdowns are completely missing.
- **Identified Gap**: UI components and change handlers missing; zero tests for hour filtering, finish time display, and empty hour handling.

#### 7. Continuous Work-Unit Availability for Selected Cylinder Count
- **Specification**: Multi-cylinder booking requires $N$ contiguous available slots. Must not cross breaks, day boundaries, reserved slots, or staff-only slots.
- **Current State**: Logic implemented in `appointment-slots.ts`.
- **Identified Gap**: Lacks integration tests verifying D1 trigger `bookings_capacity_guard` aborting non-consecutive inserts during concurrent race conditions.

#### 8. Single-Tap Date Progression
- **Specification**: Single tap/click on available date selects it and immediately navigates to Step 2. Redundant "Continue" button removed. Disabled/past/unavailable dates remain unselectable.
- **Current State**: Currently requires tapping a date and then clicking the "Continue" button.
- **Identified Gap**: Single-tap step transition missing in `BookingWizard.tsx`; keyboard focus management missing; zero tests checking automated step advance.

#### 9. Vehicle Registration Validation (State Series & BH Series)
- **Specification**: Reject arbitrary text. Validate standard State Series (`^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$`) and Bharat Series (`^\d{2}BH\d{4}[A-Z]{1,2}$`). Normalize without hyphens/spaces. Client and server parity.
- **Current State**: `schemas.ts` only requires length 4–20. `utils.ts` keeps hyphens and accepts arbitrary text.
- **Identified Gap**: Missing regex validation on client and server; no test suite of valid/invalid Indian registrations.

#### 10. English and Hindi Page Content Parity
- **Specification**: 100% route, label, form, and error parity between `/en/*` and `/hi/*`.
- **Current State**: Pages exist, but translated error messages for new validation rules (registration, payment gate) are missing.
- **Identified Gap**: No automated parity check between English and Hindi content; missing hreflang and canonical validation tests.

#### 11. Owner-Only Content Edits and Persistence
- **Specification**: Owner Console section to edit About, Services, How It Works, and Contact content. Authenticated (role OWNER), structured schema, safe rendering (no raw HTML), audit logging.
- **Current State**: No editor UI in `OwnerSettings.tsx`; no `/api/admin/content` endpoint.
- **Identified Gap**: Entire CMS module and test suite missing.

#### 12. Admin Authentication and Role Enforcement
- **Specification**: RS256 JWT validation, issuer/audience check, active role in D1 `staff_users`. No unauthenticated access to `/admin/*` or `/api/admin/*`.
- **Current State**: `auth.ts` implements logic but has zero tests.
- **Identified Gap**: No unit tests with valid/expired/invalid RS256 JWTs; no integration tests asserting 401 on missing auth and 403 on role mismatch.

#### 13. Concurrency & Overlapping Booking Prevention
- **Specification**: Simultaneous booking requests for the same work unit must result in exactly 1 success and others rejected with 409 Conflict.
- **Current State**: D1 unique constraint and trigger exist.
- **Identified Gap**: No automated concurrency tests simulating parallel requests against SQLite.

#### 14. Customer Booking Journey, UPI, UTR, and Status Page
- **Specification**: End-to-end journey: hold creation -> UPI URI/QR generation -> UTR submission -> status transition to `PENDING_VERIFICATION` -> status page lookup via hash without PII leakage.
- **Current State**: Individual code parts exist but have zero automated E2E tests.
- **Identified Gap**: Complete E2E Playwright test suite missing.

#### 15. Responsive Layout & Accessibility (WCAG 2.1 AA)
- **Specification**: Responsive layout (320px to 1440px), min 44x44px touch targets, visible focus outlines, full keyboard navigation, accessible color contrast.
- **Current State**: Inadequate touch targets on month nav buttons; low contrast on disabled calendar dates; no `aria-current="step"`; focus lost on step change.
- **Identified Gap**: No automated axe-core accessibility audit; no keyboard navigation spec.

---

## 4. Exhaustive 4-Tier Test Matrix

### Tier 1: Feature Coverage (>=5 test cases per feature)

#### Feature 1: Pricing, Flat ₹500 Advance & Balance Calculations
- **TC-FEAT-01.1**: Calculate default price for 1 cylinder: Base ₹2,500, GST ₹450, Total ₹2,950, Advance ₹500, Balance ₹2,450.
- **TC-FEAT-01.2**: Calculate default price for 2 cylinders: Base ₹5,000, GST ₹900, Total ₹5,900, Advance ₹500, Balance ₹5,400.
- **TC-FEAT-01.3**: Calculate default price for 4 cylinders (Truck): Base ₹10,000, GST ₹1,800, Total ₹11,800, Advance ₹500, Balance ₹11,300.
- **TC-FEAT-01.4**: Calculate default price for 6 cylinders: Base ₹15,000, GST ₹2,700, Total ₹17,700, Advance ₹500, Balance ₹17,200.
- **TC-FEAT-01.5**: Verify snapshot preservation in D1 `bookings` table: modifying active category price does not mutate existing booking snapshot amounts.

#### Feature 2: UPI Merchant Payment Gating
- **TC-FEAT-02.1**: Attempt to create web hold when `vpa_id = 'SETUP_REQUIRED'`: API immediately rejects with HTTP 422 and returns Phone/WhatsApp booking details.
- **TC-FEAT-02.2**: Attempt to create web hold when `vpa_payee_name = 'SETUP_REQUIRED'`: API immediately rejects with HTTP 422 and returns Phone/WhatsApp booking details.
- **TC-FEAT-02.3**: Verify that when hold is rejected due to unconfigured payment, zero rows are inserted into `bookings` and zero slots allocated.
- **TC-FEAT-02.4**: Verify that when `vpa_id` and `vpa_payee_name` are configured, hold creation succeeds with valid `upiUri` and QR data URL.
- **TC-FEAT-02.5**: Booking wizard UI on initial load detects missing merchant UPI and renders informational banner with direct Phone/WhatsApp click-to-call links.

#### Feature 3: Public Cylinder Limits (1–6) & Anti-Tampering
- **TC-FEAT-03.1**: Verify public dropdown contains exactly 1, 2, 3, 4, 5, 6, and "More than 6".
- **TC-FEAT-03.2**: Selecting "More than 6" in UI halts step progression and renders center contact options.
- **TC-FEAT-03.3**: Send tampered API request `POST /api/booking/create-hold` with `categoryId` of 7-cylinder category: assert HTTP 400/422 rejection.
- **TC-FEAT-03.4**: Send tampered API request `GET /api/public/availability?cylinderCount=8`: assert HTTP 400 validation error.
- **TC-FEAT-03.5**: Verify receptionist manual booking API (`POST /api/admin/bookings` or reception desk) successfully accepts bookings for 7 to 12 cylinders.

#### Feature 4: Vehicle Selection & Truck Preselection
- **TC-FEAT-04.1**: Selecting "Truck" automatically updates cylinder count selector to 4 cylinders.
- **TC-FEAT-04.2**: User can manually change cylinder count from 4 to 2 or 6 after selecting "Truck".
- **TC-FEAT-04.3**: Selecting "Car" sets cylinder count to 1.
- **TC-FEAT-04.4**: Selecting "Other" preserves optional make/model text input and defaults to 1 cylinder.
- **TC-FEAT-04.5**: Switching between vehicle types correctly updates estimated total, advance (flat ₹500), and balance display.

#### Feature 5: Operating Schedules (15- and 20-minute Intervals)
- **TC-FEAT-05.1**: Generate slot templates for 20-min interval (06:00–14:00): exactly 24 standard units generated.
- **TC-FEAT-05.2**: Generate slot templates for 15-min interval (06:00–14:00): exactly 32 standard units generated.
- **TC-FEAT-05.3**: Compute appointment duration for 4 cylinders at 20-min interval: exactly 80 minutes (e.g. 06:00 to 07:20).
- **TC-FEAT-05.4**: Compute appointment duration for 4 cylinders at 15-min interval: exactly 60 minutes (e.g. 06:00 to 07:00).
- **TC-FEAT-05.5**: Save schedule in Owner Console with 1-hour extension: verify 3 extra units for 20-min interval and 4 extra units for 15-min interval.

#### Feature 6: Linked Dropdowns for Time Selection
- **TC-FEAT-06.1**: Verify Hour dropdown renders all available operating hours (e.g. 6 AM, 7 AM, 8 AM) containing bookable starts.
- **TC-FEAT-06.2**: Selecting "6 AM" filters the Exact Time dropdown to valid starting times within the 6:00 hour (e.g. 06:00, 06:20, 06:40).
- **TC-FEAT-06.3**: Exact Time dropdown option displays start time and computed finish time (e.g. "06:00 (Finishes at 07:20 · 4 cylinders)").
- **TC-FEAT-06.4**: If an hour has no valid contiguous start times for the selected cylinder count, that hour is omitted or disabled in the Hour dropdown.
- **TC-FEAT-06.5**: Changing the selected Hour clears any prior Exact Time selection and resets focus.

#### Feature 7: Continuous Work-Unit Availability
- **TC-FEAT-07.1**: Request 3 cylinders starting at 07:00 when 07:00, 07:20, 07:40 are free: `canStartBooking` is true, finish is 08:00.
- **TC-FEAT-07.2**: Request 3 cylinders starting at 07:00 when 07:20 is reserved: `canStartBooking` is false.
- **TC-FEAT-07.3**: Request 4 cylinders starting at 13:20 when closing time is 14:00: `canStartBooking` is false (crosses closing boundary).
- **TC-FEAT-07.4**: Request 2 cylinders starting immediately before lunch break (e.g. 12:40 before 13:00 break): verifies run does not cross into break.
- **TC-FEAT-07.5**: Verify that staff-only extension units are excluded from public availability but included in receptionist availability.

#### Feature 8: Single-Tap Date Progression
- **TC-FEAT-08.1**: Click on an available date in the calendar: UI immediately transitions from Step 1 to Step 2 without clicking "Continue".
- **TC-FEAT-08.2**: Click on a fully booked (red) date: selection remains on Step 1, error announcement made, no advancement.
- **TC-FEAT-08.3**: Click on a past date: button is disabled, clicks are inert.
- **TC-FEAT-08.4**: Click on a date outside the 45/60-day horizon: button is disabled, clicks are inert.
- **TC-FEAT-08.5**: Press `Enter` or `Space` while keyboard-focused on an available date button: advances to Step 2 and moves focus to Step 2 vehicle selector.

#### Feature 9: Vehicle Registration Validation & Normalization
- **TC-FEAT-09.1**: Accept valid standard state series `DL 01 AB 1234` and normalize to `DL01AB1234`.
- **TC-FEAT-09.2**: Accept valid 2-digit RTO state series `HR-26-DQ-5551` and normalize to `HR26DQ5551`.
- **TC-FEAT-09.3**: Accept valid Bharat Series `22 BH 1234 AA` and normalize to `22BH1234AA`.
- **TC-FEAT-09.4**: Reject invalid registration strings: `TEST1234`, `ABCD`, `123456`, `DL99999999`, `HR!@#$`.
- **TC-FEAT-09.5**: Verify identical normalization and validation across Public Booking API, Reception Manual Booking API, and Cylinder Register API.

#### Feature 10: English & Hindi Content Parity
- **TC-FEAT-10.1**: Navigate `/en/` and `/hi/`: verify exact title, meta description, and header nav parity.
- **TC-FEAT-10.2**: Navigate `/en/book/` and `/hi/book/`: verify all wizard step labels, questions, vehicle options, and cylinder counts match.
- **TC-FEAT-10.3**: Trigger registration validation error in Hindi: assert localized error message ("कृपया एक मान्य वाहन रजिस्ट्रेशन नंबर दर्ज करें").
- **TC-FEAT-10.4**: Trigger payment unavailable notice in Hindi: assert localized text ("ऑनलाइन अग्रिम भुगतान उपलब्ध नहीं है").
- **TC-FEAT-10.5**: Verify `link rel="alternate" hreflang="en"` and `hreflang="hi"` on all public routes.

#### Feature 11: Owner Content Management System (CMS)
- **TC-FEAT-11.1**: Authenticated OWNER fetches current page content via `GET /api/admin/content?page=about`.
- **TC-FEAT-11.2**: Authenticated OWNER updates English and Hindi content for `about` page via `POST /api/admin/content`.
- **TC-FEAT-11.3**: Verify that public `/en/about/` and `/hi/about/` render updated content immediately without site rebuild.
- **TC-FEAT-11.4**: Verify that HTML injection (`<script>`, `<iframe onload=...>`) is sanitized or rejected, and only structured headings/paragraphs/lists are rendered.
- **TC-FEAT-11.5**: Verify that saving page content creates an audit event `CONTENT_PAGE_UPDATED` in `booking_audit_events`.

#### Feature 12: Admin Authentication & Access Enforcement
- **TC-FEAT-12.1**: Access `/api/admin/settings` without `cf-access-jwt-assertion` header: returns HTTP 401 Unauthorized.
- **TC-FEAT-12.2**: Access `/api/admin/settings` with expired JWT: returns HTTP 401 Unauthorized.
- **TC-FEAT-12.3**: Access `/api/admin/settings` with invalid audience or issuer: returns HTTP 401 Unauthorized.
- **TC-FEAT-12.4**: Access `/api/admin/settings` with valid JWT but email not in `staff_users`: returns HTTP 401/403.
- **TC-FEAT-12.5**: Access `/api/admin/settings` (OWNER-only) with valid RECEPTIONIST role: returns HTTP 403 Forbidden.

#### Feature 13: Concurrency & Duplicate Prevention
- **TC-FEAT-13.1**: Two parallel requests attempt to create holds on the exact same slot unit: exactly 1 returns 201 Created; the other returns 409 Conflict.
- **TC-FEAT-13.2**: Two parallel multi-cylinder requests overlap on a single slot unit: exactly 1 succeeds; the other is rejected with 409 Conflict.
- **TC-FEAT-13.3**: Replaying request with identical `idempotencyKey`: returns identical cached response without creating duplicate bookings or allocations.
- **TC-FEAT-13.4**: Attempting to insert a booking directly bypassing code checks triggers D1 database trigger `bookings_capacity_guard` and aborts.
- **TC-FEAT-13.5**: Scheduled cron `expireDueHolds` executes: unpaid holds past 15 minutes are marked `EXPIRED` and their slots become immediately available for rebooking.

#### Feature 14: Customer Booking Journey & Payment Submission
- **TC-FEAT-14.1**: Complete Steps 1–5: booking hold created, returns booking code (format `HSR-YYYYMMDD-XXXXXX`) and opaque status token.
- **TC-FEAT-14.2**: Verify `status_token_hash` stored in D1 equals SHA-256 of plain status token; plain token is never stored in DB.
- **TC-FEAT-14.3**: Submit valid 12-digit UTR via `POST /api/booking/submit-evidence`: reservation state transitions to `PENDING_VERIFICATION` and payment state to `EVIDENCE_SUBMITTED`.
- **TC-FEAT-14.4**: Query booking status via `/api/status/[code]?token=[token]`: returns status details and excludes customer name, phone, or vehicle registration.
- **TC-FEAT-14.5**: Verify that cron job `expireDueHolds` DOES NOT expire a booking in `PENDING_VERIFICATION` even if hold expiry timestamp has passed.

#### Feature 15: Responsive Layout & Accessibility (WCAG 2.1 AA)
- **TC-FEAT-15.1**: Calendar month navigation buttons (`←`, `→`) have touch targets >= 44x44px.
- **TC-FEAT-15.2**: Calendar dates have visible `:focus-visible` ring with contrast >= 3:1 against surrounding background.
- **TC-FEAT-15.3**: Screen reader announces "Step 1 of 5: Date selection", "Step 2 of 5: Vehicle selection", etc., using `aria-current="step"`.
- **TC-FEAT-15.4**: Form input fields have associated `<label>` tags with matching `for`/`id` and `aria-required="true"`.
- **TC-FEAT-15.5**: On mobile viewport (375px), table columns in Reception Desk and Admin Settings collapse into responsive stacked cards without horizontal overflow.

---

### Tier 2: Boundary & Corner Cases (>=5 test cases per feature)

#### Feature 1: Pricing & Balance Boundaries
- **TC-BND-01.1**: Minimum cylinder count (1 cylinder): Base ₹2,500, GST ₹450, Total ₹2,950, Advance ₹500, Balance ₹2,450.
- **TC-BND-01.2**: Maximum public cylinder count (6 cylinders): Base ₹15,000, GST ₹2,700, Total ₹17,700, Advance ₹500, Balance ₹17,200.
- **TC-BND-01.3**: Zero cylinder count input rejected with HTTP 400.
- **TC-BND-01.4**: Negative base price or float base price rejected with RangeError.
- **TC-BND-01.5**: Owner configures advance equal to total price (full advance): balance correctly calculates to ₹0.

#### Feature 2: UPI Payment Gate Boundaries
- **TC-BND-02.1**: `vpa_id` is empty string `""`: rejected as payment unconfigured.
- **TC-BND-02.2**: `vpa_id` contains whitespace `"   "`: trimmed and rejected as invalid/unconfigured.
- **TC-BND-02.3**: `vpa_id` is `"SETUP_REQUIRED"`: rejected.
- **TC-BND-02.4**: `vpa_payee_name` is `"SETUP_REQUIRED"` while `vpa_id` is valid: rejected.
- **TC-BND-02.5**: VPA is valid but advance is set to ₹0: rejected for online hold creation.

#### Feature 3: Cylinder Count & Tampering Boundaries
- **TC-BND-03.1**: Tampered boundary `cylinderCount = 7`: rejected with HTTP 400.
- **TC-BND-03.2**: Tampered boundary `cylinderCount = 12`: rejected with HTTP 400 on public endpoint.
- **TC-BND-03.3**: Tampered boundary `cylinderCount = 13` (exceeding even staff limit): rejected on all endpoints.
- **TC-BND-03.4**: Non-integer string `cylinderCount = "3.5"`: rejected with HTTP 400.
- **TC-BND-03.5**: Negative integer `cylinderCount = -1`: rejected with HTTP 400.

#### Feature 4: Vehicle Selection Boundaries
- **TC-BND-04.1**: Vehicle model string of exactly 100 characters (max allowed): accepted.
- **TC-BND-04.2**: Vehicle model string of 101 characters: rejected with HTTP 400.
- **TC-BND-04.3**: Vehicle model containing special characters (e.g. `Tata 407 (CNG) - High Deck`): properly sanitized and accepted.
- **TC-BND-04.4**: Vehicle class "Other" with empty model: UI disables "Continue" button; API requires model when "Other" is selected.
- **TC-BND-04.5**: Customer name of exactly 2 characters (min): accepted; customer name of 1 character: rejected.

#### Feature 5: Operating Schedule Boundaries
- **TC-BND-05.1**: Opening time equals closing time (0 hours): schedule generator rejects with error.
- **TC-BND-05.2**: Operating hours duration not a multiple of interval (e.g. 06:00 to 07:10 at 20-min interval): rejected.
- **TC-BND-05.3**: Break start equals break end: rejected.
- **TC-BND-05.4**: Break times not aligned with slot interval (e.g. 13:05 to 13:35 at 20-min interval): rejected.
- **TC-BND-05.5**: Schedule version effective date set in the past: rejected.

#### Feature 6: Linked Dropdown Boundaries
- **TC-BND-06.1**: First available hour of the day (06:00): exact times start at 06:00.
- **TC-BND-06.2**: Last operating hour before close (e.g. 13:00 when closing at 14:00): for 4 cylinders (80 mins), 13:00 is omitted because run would end at 14:20.
- **TC-BND-06.3**: Mid-day break window: starting times that would overlap break are omitted from dropdown.
- **TC-BND-06.4**: Exact start time selection when only 1 continuous run remains in that hour: dropdown displays exactly 1 option.
- **TC-BND-06.5**: Rapid switching between hours: exact time options update synchronously without stale closure bugs.

#### Feature 7: Continuous Unit Boundaries
- **TC-BND-07.1**: Requesting continuous run of 6 units when exactly 6 units remain before closing: accepted, ending exactly at close time.
- **TC-BND-07.2**: Requesting continuous run of 6 units when only 5 units remain before closing: rejected.
- **TC-BND-07.3**: Last available slot of the day: can only start a 1-cylinder booking.
- **TC-BND-07.4**: Day with 0 capacity (holiday or date override `is_closed = 1`): all hours return empty.
- **TC-BND-07.5**: Appointment spanning from standard hours into public extended hours: accepted only if extended hours are enabled and public.

#### Feature 8: Single-Tap Date Boundaries
- **TC-BND-08.1**: Selecting today's date when all remaining slots for today have passed: date marked unavailable, tap does not advance.
- **TC-BND-08.2**: Selecting date on the 45th day (exact horizon boundary): accepted and advances.
- **TC-BND-08.3**: Selecting date on the 46th day (outside horizon): disabled and unclickable.
- **TC-BND-08.4**: Leap day booking (February 29 in leap year): accepted and correctly advances.
- **TC-BND-08.5**: Double-tapping an available date in rapid succession (<200ms): only triggers single transition, does not skip Step 2.

#### Feature 9: Registration Number Validation Boundaries
- **TC-BND-09.1**: Shortest valid Indian registration: `DL1A1` (5 chars normalized): accepted.
- **TC-BND-09.2**: Longest valid Indian registration: `UP16AB1234` (10 chars normalized): accepted.
- **TC-BND-09.3**: Registration with lowercase letters and excessive spaces `"  hr  05   bc  9999  "`: converts to uppercase `HR05BC9999` and accepts.
- **TC-BND-09.4**: Registration with multiple hyphens `"MH-12-DE-1433"`: strips hyphens to `MH12DE1433` and accepts.
- **TC-BND-09.5**: Bharat Series boundary: `21BH0001A` (min number 0001) accepted; `21BH0000A` (invalid 0000 number) rejected.

#### Feature 10: Bilingual Boundaries
- **TC-BND-10.1**: Unicode rendering of complex Hindi ligatures in slot labels (`अपॉइंटमेंट`, `सिलेंडर`).
- **TC-BND-10.2**: Currency formatting: `₹` symbol placed properly without double currency markers.
- **TC-BND-10.3**: Hindi numbers in calendar dates vs English numerals: numerals remain standard digits (1–31) while weekday headers are localized (`रवि`, `सोम`).
- **TC-BND-10.4**: Switch locale mid-wizard on Step 4: preserves selected date, vehicle, cylinder count, and slot.
- **TC-BND-10.5**: URL path trailing slash handling: `/en/book` redirects 301/302 to `/en/book/`.

#### Feature 11: Owner Content CMS Boundaries
- **TC-BND-11.1**: Content body of maximum allowed length (10,000 characters): accepted and saved.
- **TC-BND-11.2**: Empty title or body: rejected with HTTP 400.
- **TC-BND-11.3**: Content page key not in allowed set (`['about', 'services', 'how-it-works', 'contact']`): rejected with HTTP 400.
- **TC-BND-11.4**: Updating content with unchanged text: idempotent, audit log records no changes.
- **TC-BND-11.5**: Concurrent edits by two owners: last write wins, both audited.

#### Feature 12: Admin Authentication Boundaries
- **TC-BND-12.1**: JWT valid for 5 seconds before expiry: accepted.
- **TC-BND-12.2**: JWT expired by 1 second: rejected with 401.
- **TC-BND-12.3**: JWT with future `nbf` (not before): rejected with 401.
- **TC-BND-12.4**: Staff user with `is_active = 0` in D1: rejected with 403.
- **TC-BND-12.5**: Access assertion token present but malformed (missing dots or headers): rejected with 401.

#### Feature 13: Concurrency Boundaries
- **TC-BND-13.1**: Exactly 2 concurrent requests for the final remaining slot of the day: 1 succeeds (201), 1 fails (409).
- **TC-BND-13.2**: Request hold 1 millisecond before hold expiry cron runs: hold granted.
- **TC-BND-13.3**: Evidence submission 1 millisecond after hold expiry: rejected with "Hold expired".
- **TC-BND-13.4**: High-concurrency burst (10 parallel requests for 3 slots): exactly 3 succeed, 7 receive 409.
- **TC-BND-13.5**: Idempotency key collision with different payload: rejected with HTTP 409 conflict.

#### Feature 14: Customer Journey Boundaries
- **TC-BND-14.1**: Phone number exactly 10 digits (`9876543210`): normalized to `+919876543210`.
- **TC-BND-14.2**: Phone number with 12 digits starting with 91 (`919876543210`): normalized to `+919876543210`.
- **TC-BND-14.3**: Phone number with 9 digits or 11 digits: rejected.
- **TC-BND-14.4**: UTR reference of minimum length (8 chars): accepted.
- **TC-BND-14.5**: UTR reference with special symbols (`UTR#12345`): normalized to uppercase alphanumeric.

#### Feature 15: Accessibility Boundaries
- **TC-BND-15.1**: Smallest supported mobile viewport (320px width): wizard fits without horizontal scroll bar.
- **TC-BND-15.2**: Text zoomed to 200%: layout reflows without overlapping text or clipped buttons.
- **TC-BND-15.3**: Operating entirely with `Tab`, `Shift+Tab`, `Space`, and `Enter`: complete booking achievable without a mouse.
- **TC-BND-15.4**: Windows High Contrast Mode: borders and active states remain visually distinct.
- **TC-BND-15.5**: VoiceOver/NVDA screen reader testing: all form inputs announce correct labels and required states.

---

### Tier 3: Cross-Feature Combinations (Pairwise Interaction Matrix)

The system behavior depends on interactions between 7 independent configuration and input dimensions:
1. **Interval**: `[15 min, 20 min]`
2. **Vehicle Type**: `[Car, Truck, LCV, Other]`
3. **Cylinder Count**: `[1, 4, 6, 7 (tampered)]`
4. **Payment Gate State**: `[Configured, Missing/SETUP_REQUIRED]`
5. **Booking Source / Channel**: `[Public Web, Reception Desk (Phone), Reception Desk (Walk-in)]`
6. **Locale**: `[English, Hindi]`
7. **Concurrency Condition**: `[Clean single-user, Race condition on overlapping units]`

#### Pairwise Matrix Sample & Expected Assertions

| Combination | Interval | Vehicle | Cylinders | Payment Config | Source | Locale | Concurrency | Expected System Result |
|---|---|---|---|---|---|---|---|---|
| **P-01** | 20 min | Car | 1 cyl | Configured | WEB | EN | Clean | Hold created, 1 unit (20m), flat ₹500 adv, balance ₹2,450, UPI QR rendered. |
| **P-02** | 20 min | Truck | 4 cyl (auto) | Configured | WEB | HI | Clean | Preselects 4 cyl, 4 units (80m), flat ₹500 adv, balance ₹11,300, UPI QR rendered. |
| **P-03** | 15 min | Car | 2 cyl | Missing VPA | WEB | EN | Clean | Hold rejected (422), 0 units locked, Phone/WhatsApp CTA rendered. |
| **P-04** | 20 min | Other | 6 cyl | Configured | WEB | EN | Race (2 users) | First user gets 6 units (120m); second user gets 409 Conflict. |
| **P-05** | 15 min | Truck | 4 cyl | Configured | WEB | HI | Clean | 4 units (60m duration), finish time accurately calculated, ₹500 adv. |
| **P-06** | 20 min | Car | 7 cyl | Configured | WEB | EN | Clean | API tampering detected; rejected with 400 Bad Request. |
| **P-07** | 20 min | Bus | 8 cyl | N/A (Counter) | WALKIN | EN | Clean | Receptionist manual booking succeeds; 8 units allocated; 1-12 supported. |
| **P-08** | 15 min | LCV | 3 cyl | Configured | PHONE | HI | Clean | Receptionist books phone reservation; mark paid at counter supported. |
| **P-09** | 20 min | Car | 1 cyl | Configured | WEB | EN | Expired hold | 15 mins pass without UTR; cron marks EXPIRED; slot re-opened immediately. |
| **P-10** | 20 min | Truck | 4 cyl | Configured | WEB | HI | Evidence submitted | UTR submitted at 14m; state PENDING_VERIFICATION; protected from cron expiry. |

---

### Tier 4: Real-World End-to-End Scenarios

#### Scenario 1: Complete Customer Self-Service Booking Journey
1. **Customer Visit**: Customer arrives at `/en/book/` from homepage CTA.
2. **Step 1 (Date)**: Calendar displays current month. Customer taps tomorrow's date. Single-tap triggers immediate advance to Step 2.
3. **Step 2 (Vehicle)**: Dropdown shows "Car". Customer selects "Truck". UI automatically changes cylinders to 4. Customer enters optional model "Tata 407". Clicks "Continue".
4. **Step 3 (Cylinders)**: Dropdown shows "4 cylinders" selected. Price breakdown displays: Base ₹10,000, GST ₹1,800, Total ₹11,800, Flat Advance ₹500, Balance ₹11,300. Clicks "Continue".
5. **Step 4 (Time)**: Customer selects Hour "7 AM". Exact Time dropdown updates to show "07:00 (Finishes at 08:20 · 4 cylinders, 80 mins)". Customer selects "07:00". Clicks "Continue".
6. **Step 5 (Details)**: Customer enters name "Rajesh Kumar", mobile "9876543210", registration "HR 26 DQ 5551". Input converts to uppercase. Client-side regex passes. Clicks "Create booking".
7. **Backend Hold Execution**: Server validates origin, validates registration regex, checks UPI configured, executes atomic D1 batch, allocates 4 slot snapshots, records audit log. Returns 201 Created with booking code `HSR-20261113-A1B2C3` and status token.
8. **Confirmation & Payment**: Customer sees booking confirmation card, hold countdown (15 minutes), UPI pay link, and generated UPI QR code.
9. **UTR Submission**: Customer pays via UPI app, returns, enters UTR `123456789012`, clicks "Submit payment reference". API updates reservation state to `PENDING_VERIFICATION` and payment state to `EVIDENCE_SUBMITTED`.
10. **Status Page**: Customer clicks "View booking status". Status page `/en/status/?booking=...&token=...` renders `PENDING_VERIFICATION` without leaking personal mobile or vehicle registration.

#### Scenario 2: Receptionist Operational Workflow
1. **Login & Access**: Receptionist navigates to `/admin/reception/` via footer login link. Cloudflare Access authenticates identity; D1 confirms `RECEPTIONIST` role.
2. **Daily Desk View**: Receptionist views today's schedule grid (24 units at 20m interval) with 1 pending verification badge.
3. **Payment Verification**: Receptionist reviews customer `HSR-20261113-A1B2C3` with UTR `123456789012`. Clicks "Verify payment". State transitions to `CONFIRMED` and `ADVANCE_VERIFIED`.
4. **Customer Check-In**: Customer arrives at facility. Receptionist clicks "Check in" -> state `CHECKED_IN`.
5. **Work Execution**: Technician begins hydro test. Receptionist clicks "Start work" -> state `IN_PROGRESS`.
6. **Completion & Cylinder Register**: Test finishes. Receptionist clicks "Mark completed" -> state `COMPLETED`. Receptionist opens Cylinder Register console, selects booking, enters cylinder serial `CNG-998822`, test pressure `300 bar`, result `PASS`. D1 calculates next 3-year retest date (`2029-11-13`) and saves register entry.

#### Scenario 3: Owner Configuration & Bilingual Content Updates
1. **Owner Access**: Owner logs into `/admin/owner/` with `OWNER` role.
2. **Advance Price Update**: Owner navigates to Cylinder Pricing tab. Updates base price and advance amount. Clicks "Save pricing". API validates that advance does not exceed total and writes to D1 with audit logging.
3. **Content Editing**: Owner navigates to Website Content tab. Selects "About" page. Updates English mission statement and Hindi description. Previews formatting (headings and bullets). Clicks "Publish content".
4. **Verification**: Owner visits public `/en/about/` and `/hi/about/`: updated content renders cleanly without HTML sanitization issues.
5. **Schedule Interval Switch**: Owner changes operating interval from 20 minutes to 15 minutes starting from next Monday. D1 stores new schedule version. `extendFutureSnapshots` projects 32-unit daily snapshots from effective date.

#### Scenario 4: Worker Cron Background Maintenance
1. **Hold Expiry Cron (`*/5 * * * *`)**:
   - Executes `expireDueHolds(env.DB)`.
   - Queries `bookings` where `reservation_state = 'HELD' AND payment_state = 'ADVANCE_PENDING' AND hold_expires_at <= now()`.
   - Updates state to `EXPIRED`.
   - Leaves `PENDING_VERIFICATION` bookings untouched.
   - Associated slots in `booking_slot_allocations` become available for subsequent bookings.
2. **Horizon Extension Cron (`35 18 * * *`)**:
   - Executes `extendFutureSnapshots(env.DB)`.
   - Reads active `schedule_versions` and projects missing `daily_slot_snapshots` up to 45 days into the future.
   - Preserves historical snapshots and date overrides.

---

## 5. Test Execution Strategy & Synthetic Data Fixtures

### 5.1 Test Execution Harness & Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │              Test Suite Architecture          │
                       └──────────────────────────────────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│       Vitest Runner (Node)    │               │    Playwright Runner (E2E)    │
│  - Unit Tests                 │               │  - Full Customer Journeys     │
│  - D1 Integration Tests       │               │  - Receptionist Operations    │
│  - Auth & Security Tests      │               │  - Owner CMS & Settings       │
│  - Concurrency Tests          │               │  - Axe Accessibility Audits   │
└───────────────────────────────┘               └───────────────────────────────┘
            │                                                   │
            ▼                                                   ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ In-Memory SQLite (D1 Mock)    │               │ Astro Dev Server (:4321)      │
│  - Applies all migrations     │               │  - Mock D1 Driver             │
│  - Triggers & unique keys     │               │  - Synthetic Cloudflare Auth  │
└───────────────────────────────┘               └───────────────────────────────┘
```

1. **Integration Test D1 Mock Driver**:
   Create a lightweight D1-compatible test wrapper using `better-sqlite3` in `tests/helpers/d1-mock.ts`. It executes all migrations (`0001_init.sql` through `0006_advance_pricing.sql`), supports `db.prepare()`, `.bind()`, `.first()`, `.all()`, and `.batch()`, and accurately enforces SQLite triggers (`bookings_capacity_guard`) and foreign keys.
2. **Cloudflare Access JWT Test Generator**:
   Create a test helper in `tests/helpers/jwt-mock.ts` generating RS256 keypairs, a mock JWKS response, and signed assertions with configurable `email`, `aud`, `iss`, `exp`, and `nbf`.
3. **Playwright E2E Harness**:
   Create tests under `tests/e2e/`:
   - `customer-booking.spec.ts` (customer flow, linked dropdowns, single-tap date, UPI/UTR)
   - `reception-desk.spec.ts` (receptionist verification, manual bookings, check-in, register)
   - `owner-console.spec.ts` (pricing updates, schedule changes, bilingual content edits)
   - `accessibility.spec.ts` (axe-core WCAG 2.1 AA audits on mobile/desktop viewports)

### 5.2 Synthetic Data Fixtures

All tests must use synthetic test data. **Never use real customer PII or production credentials.**

```ts
// tests/fixtures/synthetic-data.ts

export const SYNTHETIC_CUSTOMERS = {
  validStandard: {
    name: 'Rajesh Kumar',
    mobile: '9876543210',
    expectedE164: '+919876543210',
  },
  validHindi: {
    name: 'सुरेश शर्मा',
    mobile: '9123456789',
    expectedE164: '+919123456789',
  },
  invalidPhone: {
    name: 'Invalid Phone User',
    mobile: '12345',
  },
};

export const SYNTHETIC_VEHICLES = {
  validStateDelhi: {
    raw: 'DL 01 AB 1234',
    normalized: 'DL01AB1234',
    type: 'Car',
    model: 'Maruti WagonR',
  },
  validStateHaryana: {
    raw: 'hr-26-dq-5551',
    normalized: 'HR26DQ5551',
    type: 'Truck',
    model: 'Tata 407',
  },
  validBharatSeries: {
    raw: '22 BH 1234 AA',
    normalized: '22BH1234AA',
    type: 'Car',
    model: 'Honda City',
  },
  invalidGarbage: 'HELLO123',
  invalidSpecialChars: 'HR26@DQ5551',
  invalidTooShort: 'DL1',
};

export const SYNTHETIC_STAFF = {
  owner: {
    email: 'owner@hsr-test.internal',
    role: 'OWNER',
  },
  receptionist: {
    email: 'reception@hsr-test.internal',
    role: 'RECEPTIONIST',
  },
  unauthorized: {
    email: 'stranger@example.com',
  },
};

export const SYNTHETIC_PAYMENT_CONFIG = {
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
};
```

---

## 6. Implementation Action Plan for Phase B

| Step | Area | Files to Modify / Create | Purpose |
|---|---|---|---|
| **1** | Forward Migration | `migrations/0006_advance_pricing.sql` | Seed `advance_paise = 50000` (₹500 flat) for `CYL_01`–`CYL_06`, normalize existing vehicle registrations, add trigger constraint for `source='WEB' AND cylinder_count > 6`. |
| **2** | Payment Gating | `src/pages/api/booking/create-hold.ts`, `src/lib/booking-engine.ts` | Verify merchant UPI configuration *before* D1 transaction; return 422 with Phone/WhatsApp CTA if missing. |
| **3** | Vehicle Registration | `src/lib/utils.ts`, `src/lib/schemas.ts` | Add `STATE_SERIES_REGEX` & `BH_SERIES_REGEX`; update `normalizeVehicleRegistration` to strip hyphens; enforce in schemas. |
| **4** | Public Booking Wizard | `src/components/booking/BookingWizard.tsx` | Constrain cylinders to 1–6 + "More than 6"; implement single-tap date advance; implement 2 linked dropdowns (Hour -> Exact Time + finish time). |
| **5** | Admin Access Parity | `src/pages/api/admin/categories.ts`, `src/layouts/BaseLayout.astro` | Allow `RECEPTIONIST` to GET categories (for 1–12 support); add "Staff / Admin Login" footer link. |
| **6** | Owner Content CMS | `src/pages/api/admin/content.ts`, `src/components/admin/OwnerSettings.tsx`, `src/components/ContentPage.astro` | Implement bilingual content editor API and UI with structured headings/lists and safe rendering. |
| **7** | Test Suite Expansion | `tests/**/*.test.ts`, `tests/e2e/**/*.spec.ts`, `tests/helpers/*` | Add D1 test driver, mock JWT helper, implement all 150+ tests from Tiers 1–4. |
