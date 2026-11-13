# Handoff Report: QA & Accessibility Investigation and Test Matrix

**Agent**: Agent D — QA and Accessibility Engineer (`teamwork_explorer`)  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_4`  
**Date**: 2026-11-12  
**Handoff Type**: Hard (Investigation & Test Matrix Design Complete)

---

## 1. Observation

1. **Existing Unit Test Inventory**:
   - `vitest.config.ts` (lines 4–11): `include: ['tests/**/*.test.ts']`, `environment: 'node'`.
   - The directory `tests/` contains only 6 test files:
     - `tests/pricing.test.ts` (lines 1–35): 3 test blocks testing `calculateServicePrice` for default prices (1–12 cylinders), discount isolation, and invalid price rejection.
     - `tests/appointment-slots.test.ts` (lines 1–86): Tests `generateAppointmentSlots` (20m, 15m, 9th hour, breaks) and `markBookableStarts` / `findConsecutiveAvailableSlots` (contiguous runs, reserved slot blocking, staff-only hiding).
     - `tests/schedule.test.ts` (lines 1–59): Tests `buildSnapshotScheduleRanges` (effective date horizon slicing and version conflict resolution).
     - `tests/utils.test.ts` (lines 1–17): Tests `normalizePhoneIndian` and basic string replacement in `normalizeVehicleRegistration` and `normalizeUtr`.
     - `tests/expiry.test.ts` (lines 1–31): Tests `calculateNextRetestDate` (3-year addition, leap day 2024-02-29) and `isValidIsoDate`.
     - `tests/security.test.ts` (lines 1–57): Tests `validateOrigin`, `jsonResponse` cache-control header, and `createHoldSchema` rejecting `source: 'PHONE'`.
2. **E2E Test Inventory**:
   - `playwright.config.ts` (lines 4–15): Configures `testDir: './tests/e2e'`, `timeout: 30_000`, `baseURL: 'http://127.0.0.1:4321'`.
   - Inspection of `tests/e2e/` reveals **0 test files**. No Playwright specs exist in the repository.
3. **D1 Database & Cloudflare Worker Mocking**:
   - Vitest runs in standard Node.js. `cloudflare:workers` is not polyfilled or mocked in tests.
   - Zero tests exercise D1 queries, transactional batches (`db.batch`), foreign keys, triggers (`bookings_capacity_guard`), or migrations.
4. **UPI Payment Gate Defect**:
   - In `src/pages/api/booking/create-hold.ts` (lines 32–44):
     ```ts
     const result = await createHold(db, { ...parsed.data, source: 'WEB' });
     let upiUri: string | null = null;
     let upiQrDataUrl: string | null = null;
     if (
       result.paymentConfig.vpaId !== 'SETUP_REQUIRED' &&
       result.paymentConfig.payeeName !== 'SETUP_REQUIRED' &&
       result.pricing.advancePaise != null
     ) { ... }
     ```
     `createHold` commits D1 database allocations *before* checking whether `vpaId` or `payeeName` are configured. When credentials are `SETUP_REQUIRED`, customer holds are created and slots are locked for 15 minutes, but `upiUri` is null.
5. **Public Cylinder Limit & API Tampering**:
   - In `src/components/booking/BookingWizard.tsx` (lines 290–293):
     ```tsx
     {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
       <option key={count} value={count}>{count} cylinders</option>
     ))}
     <option value="more">More than 12</option>
     ```
     The public dropdown offers 1–12 cylinders and "More than 12", violating the required 1–6 and "More than 6" specification.
   - In `src/pages/api/public/availability.ts` (line 11): `cylinderCount: z.coerce.number().int().min(1).max(20).default(1)`.
   - In `src/pages/api/booking/create-hold.ts` and `src/lib/schemas.ts`: `categoryId` is not restricted to cylinder count <= 6 for public web bookings, allowing callers to reserve 7–12 cylinders online.
6. **Vehicle Registration Validation Void**:
   - In `src/lib/schemas.ts` (line 12): `vehicleRegistration: z.string().trim().min(4).max(20)`. No regex pattern is applied.
   - In `src/lib/utils.ts` (line 28): `return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');`. Hyphens are retained, and arbitrary text (e.g. `TEST1234`) is accepted.
7. **Time Selection Dropdowns**:
   - In `src/components/booking/BookingWizard.tsx` (lines 324–340): A flat grid of buttons is rendered. Two linked dropdowns (Hour first, Exact Start Time second with finish time display) are absent.
8. **Date Progression**:
   - In `src/components/booking/BookingWizard.tsx` (lines 242–259): Tapping a date only updates state `setDate(day)`. Advancing to Step 2 requires pressing `<button className="cta cta-primary" onClick={() => setStep(2)}>Continue</button>`. Single-tap progression is absent.
9. **Staff / Admin Login Link**:
   - In `src/layouts/BaseLayout.astro` (lines 84–90): Footer contains business name and disclaimer, but has no link to `/admin/login/`.
10. **Owner Content CMS**:
    - No `/api/admin/content` endpoint exists. `src/components/admin/OwnerSettings.tsx` has no editor for page content. `src/components/ContentPage.astro` renders fallback message when `body === 'SETUP_REQUIRED'` and only renders a single `<p>{displayBody}</p>`.

---

## 2. Logic Chain

1. **From Observation 1 & 2**: The repository has 22 unit tests across 6 files and 0 E2E tests in Playwright. Therefore, test coverage is strictly localized to pure helper functions, leaving all Astro pages, React components, and API routes completely unverified by automated tests.
2. **From Observation 3**: Because D1 and Cloudflare Worker runtime environments are unmocked, any business logic that executes SQL queries, triggers, or batch transactions cannot be tested in the current test setup without introducing a D1 test harness.
3. **From Observation 4**: In `create-hold.ts`, hold creation happens unconditionally before validating UPI credentials. If merchant UPI is `SETUP_REQUIRED`, D1 records are written and appointment units are locked for 15 minutes, but the customer cannot pay because `upiUri` is null. This directly violates Section 5.1 and 5.9 of `ORIGINAL_REQUEST.md`.
4. **From Observation 5**: The public UI offers 1–12 cylinders and public APIs do not enforce `cylinderCount <= 6`. Consequently, any user can select or submit 7–12 cylinders online, bypassing the required referral to the centre for >6 cylinders and violating Section 5.2 and 5.9.
5. **From Observation 6**: Vehicle registration validation currently only checks string length (4–20) and strips spaces. Legitimate formats (State Series `HR26DQ5551` and Bharat Series `22BH1234AA`) are not enforced, allowing arbitrary text strings to enter the database and vehicles table.
6. **From Observation 7 & 8**: The booking wizard requires manual step advancement on date selection and renders a flat list of times, directly contradicting Section 5.3 (Linked dropdowns) and Section 5.4 (Single-tap date selection).
7. **From Observation 9 & 10**: Without a footer login link, staff members have no discoverable entry point to `/admin/login/`. Without a content editor in Owner Console, the owner cannot update page content, leaving public content locked on `SETUP_REQUIRED`.
8. **Synthesized Conclusion**: To achieve production dependability and meet the Section 5.9 mandate, the project requires:
   - Fixing the identified functional vulnerabilities (payment gating, cylinder limit enforcement, registration regex, linked dropdowns, single-tap date, owner CMS).
   - Establishing an in-memory D1 test driver and synthetic JWT generator in Vitest.
   - Implementing the exhaustive 4-tier test matrix (150+ test cases across feature, boundary, pairwise, and E2E scenarios).

---

## 3. Caveats

1. **Remote Cloudflare Access & Preview Verification**:
   - Because Cloudflare Access is deployed on Cloudflare Zero Trust, local tests cannot directly validate remote Access IdP policies without using mock assertions. Local verification must rely on synthetic JWT generation with RS256 keypairs matching Cloudflare's specification.
2. **No Application Source Code Modified**:
   - In accordance with the `teamwork_explorer` read-only constraint, no source code, migration files, or configuration files were modified during this investigation. All findings and proposed changes are documented in `analysis.md`.
3. **Destructive Git Commands**:
   - No git commands or branch switches were executed. All observations are based on direct inspection of the workspace files on branch `copilot/build-cng-cylinder-hydro-testing-website`.

---

## 4. Conclusion

The HSR Green Energy testing infrastructure currently possesses strong foundational pure-function unit tests for slot math and pricing formulas, but has a **critical coverage gap** across database integration, API security, and browser E2E workflows. Furthermore, several key customer feedback requirements from Section 5.9 are currently unimplemented or incomplete in the source code.

The comprehensive analysis and test matrix in `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_4\analysis.md` provides:
1. An exhaustive file-by-file audit and gap analysis.
2. A 4-Tier Test Matrix comprising:
   - **Tier 1**: 75+ Feature Coverage test cases (>=5 per feature across 15 core features).
   - **Tier 2**: 75+ Boundary and Corner test cases (>=5 per feature).
   - **Tier 3**: Pairwise cross-feature combination matrix.
   - **Tier 4**: 4 Real-world end-to-end operational scenarios.
3. A concrete test execution harness strategy and synthetic test data fixtures.
4. An actionable Phase B implementation roadmap.

---

## 5. Verification Method

To independently verify the observations and conclusions in this report:

1. **Inspect Existing Test Files and Playwright Config**:
   - Verify Vitest config: `cat vitest.config.ts`
   - Verify unit test files in `tests/`: `appointment-slots.test.ts`, `expiry.test.ts`, `pricing.test.ts`, `schedule.test.ts`, `security.test.ts`, `utils.test.ts`.
   - Verify Playwright config: `cat playwright.config.ts` (points to `./tests/e2e`).
   - Verify `tests/e2e/` has no test files.
2. **Inspect Booking Wizard & Public APIs for Gaps**:
   - Inspect cylinder options: `src/components/booking/BookingWizard.tsx` lines 290–293 (shows 1–12 instead of 1–6).
   - Inspect payment gate: `src/pages/api/booking/create-hold.ts` lines 32–44 (creates hold before checking VPA).
   - Inspect vehicle registration: `src/lib/schemas.ts` line 12 and `src/lib/utils.ts` line 28 (no regex validation).
   - Inspect date step: `src/components/booking/BookingWizard.tsx` line 259 (requires clicking "Continue").
   - Inspect time step: `src/components/booking/BookingWizard.tsx` lines 324–340 (flat buttons, no linked dropdowns).
   - Inspect footer: `src/layouts/BaseLayout.astro` lines 84–90 (missing staff login link).
3. **Run Project Check Commands**:
   - `npm run test` (executes existing 22 Vitest unit tests in node environment).
   - `npm run typecheck` (executes `astro check`).
   - `npm run build` (builds the Astro server bundle).
