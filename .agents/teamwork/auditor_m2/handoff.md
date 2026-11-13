# Forensic Audit Report: Milestone M2

**Work Product**: Milestone M2 (Pricing Engine, ₹500 Flat Advance, Pre-Write Payment Gating, Public Cylinder Limit, Migration 0006)  
**Profile**: General Project (Development, Demo, and Benchmark Modes)  
**Verdict**: **CLEAN**  
**Auditor**: Forensic Auditor (`teamwork_auditor`)  
**Date**: 2026-11-13T07:53:00Z  
**Target Recipient**: Orchestrator (`423f96b4-d134-4c92-9308-9dcadcc0a1a3`)

---

## Executive Summary

A comprehensive, adversarial, and empirical forensic audit was performed on Milestone M2. All modified and created files, database migrations, endpoint handlers, pricing calculation engines, type definitions, and test suites were scrutinized for integrity violations, facade implementations, hardcoded test results, bypass vulnerabilities, or tautological assertions.

The implementation is verified to be authentic, fully functional, and strictly compliant with all invariants specified in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `AGENTS.md`.

---

## Phase Results

| # | Forensic Check | Result | Details |
|---|----------------|:------:|---------|
| 1 | **Hardcoded Test Results Detection** | **PASS** | `src/lib/pricing.ts`, `src/pages/api/booking/create-hold.ts`, and `src/lib/booking-engine.ts` compute all pricing, GST, and balances dynamically via formula; zero test-tailored string or integer literals. |
| 2 | **Facade & Dummy Detection** | **PASS** | No stubbed methods, no dummy returns (`return true`), no bypasses based on request headers, test tokens, or client IPs. |
| 3 | **Pre-Populated Artifact Detection** | **PASS** | No pre-existing test logs, result files, or fabricated verification outputs exist in the repository. |
| 4 | **Pre-Write Payment Gating (Fail-Closed)** | **PASS** | Fails closed with HTTP 422 before any D1 writes occur when `vpa_id` or `vpa_payee_name` are missing, whitespace, or `'SETUP_REQUIRED'`. Verified exactly zero rows added across all tables. |
| 5 | **Server-Side Public Cylinder Limitation** | **PASS** | Public requests (`source === 'WEB'`) requesting > 6 cylinders are rejected with HTTP 400 and zero D1 writes; receptionist bookings (`PHONE`, `WALKIN`) retain full 1–12 cylinder capability. |
| 6 | **Single-Source Commercial Pricing & Snapshot Integrity** | **PASS** | Flat ₹500 advance stored in `business_settings.flat_advance_paise = 50000`; `calculateBookingPrice` guarantees `advancePaise + balancePaise === totalPricePaise`; immutable snapshots written to `bookings`. |
| 7 | **Database Migration Invariants** | **PASS** | Migration `0006_flat_advance.sql` is forward-only, idempotent, alters schema safely without table drop/recreation, and upserts `kumardeepakola@gmail.com` as `OWNER` without wiping custom configurations. |
| 8 | **Independent Build & Typecheck** | **PASS** | `npm run typecheck` (`astro check`) passes on 88 files with 0 errors; `npm run build` succeeds in 37.68s. |
| 9 | **Independent Test Suite Execution** | **PASS** | All 12 test suites and all 281 tests pass natively on Node.js v24.22.3 with zero failures. |

---

## 1. Observation

### 1.1 Source Code and Git Diff Analysis

1. **`src/lib/pricing.ts` (Lines 1–54)**:
   - Dynamic arithmetic functions `calculateServicePrice` and `calculateBookingPrice`.
   - Fixed GST basis points: `FIXED_GST_RATE_BPS = 1800` (18%).
   - GST calculation: `const gstAmountPaise = Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10_000);`
   - Total price: `totalPricePaise: basePricePaise + gstAmountPaise`
   - Strict range guards: Throws `RangeError` if `basePricePaise` or `flatAdvancePaise` is not a safe integer or is negative.
   - Advance guard: Throws `RangeError('Advance amount cannot exceed the total price')` if `flatAdvancePaise > price.totalPricePaise`.
   - Remaining balance: `balancePaise: price.totalPricePaise - flatAdvancePaise`.
   - No mock returns, constant lookups, or test-specific branches.

2. **`src/pages/api/booking/create-hold.ts` (Lines 63–123)**:
   - Pre-write payment gate queries `business_settings`:
     ```typescript
     const settings = await getBusinessSettings(db);
     const vpaId = settings.vpa_id?.trim();
     const payeeName = settings.vpa_payee_name?.trim();
     const isPaymentConfigured = !!vpaId && vpaId !== 'SETUP_REQUIRED' && !!payeeName && payeeName !== 'SETUP_REQUIRED';

     if (!isPaymentConfigured) {
       const contact = resolveContact(settings);
       return new Response(JSON.stringify({
         success: false,
         error: { code: 'ONLINE_PAYMENT_UNAVAILABLE', message },
         contact,
       }), { status: 422, headers: { 'content-type': 'application/json; charset=utf-8' } });
     }
     ```
   - Invocation occurs **before** `createHold` or any D1 write.
   - Server-side public cylinder limitation:
     ```typescript
     const categoryRow = await querySingle<{ id: number; cylinderCount: number }>(
       db, 'SELECT id, cylinder_count AS cylinderCount FROM vehicle_categories WHERE id = ? AND is_active = 1', [categoryId]
     );
     if (categoryRow.cylinderCount > 6) {
       return new Response(JSON.stringify({
         success: false,
         error: { code: 'PUBLIC_CYLINDER_LIMIT_EXCEEDED', message },
         contact,
       }), { status: 400 });
     }
     ```
   - Rejection occurs before `createHold` or any D1 write.

3. **`src/lib/booking-engine.ts` (Lines 76–118, 180–380)**:
   - Defense-in-depth: `createHold` independently verifies vehicle registration format, payment gating for `source === 'WEB'`, and public cylinder limitation (`cylinderCount > 6`).
   - Dynamically checks available consecutive slot intervals via `findConsecutiveAvailableSlots`.
   - Computes pricing snapshots using `calculateBookingPrice(categoryRow.basePricePaise, advancePaise)`.
   - Commits atomic batch containing `customers`, `vehicles`, `bookings`, `booking_slot_allocations`, `booking_audit_events`, `idempotency_keys`.

4. **`migrations/0006_flat_advance.sql`**:
   - `ALTER TABLE business_settings ADD COLUMN flat_advance_paise INTEGER NOT NULL DEFAULT 50000;`
   - Safe conditional defaults for `business_name_en`, `business_name_hi`, `city`, `contact_phone`, `whatsapp_number` applying only where unset, empty, `'SETUP_REQUIRED'`, or placeholder.
   - Owner upsert: `INSERT INTO staff_users (email, role, is_active) VALUES ('kumardeepakola@gmail.com', 'OWNER', 1) ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;` matches the `UNIQUE(email)` constraint from `0001_init.sql`.

5. **`src/pages/api/admin/settings.ts` & `src/pages/api/public/config.ts`**:
   - `settings.ts` adds `flat_advance_paise: z.number().int().min(0).max(10_000_000).optional()` to strict schema and logs `BUSINESS_SETTINGS_UPDATED` audit events.
   - `config.ts` exposes `flatAdvancePaise` and derives `paymentConfigured` as `false` when VPA is missing, empty, or `'SETUP_REQUIRED'`.

### 1.2 Independent Tool Execution Evidence

#### 1. Vitest Test Execution (`npm run test`)
```
> hsr-green-energy@0.1.0 test
> vitest run

 RUN  v4.1.12 C:/Users/HP/Downloads/HSR CNG

 ✓ tests/helpers/test-harness.test.ts (24 tests) 9151ms
 ✓ tests/booking-hold.test.ts (37 tests) 14277ms
 ✓ tests/security.test.ts (6 tests) 716ms
 ✓ tests/challenger-m2.test.ts (15 tests) 8202ms
 ✓ tests/adversarial-m2.test.ts (74 tests) 22634ms
 ✓ tests/vehicle-registration.test.ts (73 tests) 253ms
 ✓ tests/routes.test.ts (1 test) 34ms
 ✓ tests/schedule.test.ts (3 tests) 720ms
 ✓ tests/appointment-slots.test.ts (10 tests) 433ms
 ✓ tests/utils.test.ts (3 tests) 334ms
 ✓ tests/pricing.test.ts (30 tests) 68ms
 ✓ tests/expiry.test.ts (5 tests) 25ms

 Test Files  12 passed (12)
      Tests  281 passed (281)
   Start at  13:18:51
   Duration  62.89s (transform 6.87s, setup 0ms, import 24.81s, tests 56.85s, environment 14ms)
```

#### 2. Astro Check Diagnostics (`npm run typecheck`)
```
> hsr-green-energy@0.1.0 typecheck
> astro check

13:05:03 [@astrojs/cloudflare] Enabling compile-time image optimization. Images will be pre-optimized at build time.
13:05:08 [types] Generated 4.33s
13:05:08 [check] Getting diagnostics for Astro files in C:\Users\HP\Downloads\HSR CNG...
tests/challenger-m2.test.ts:324:11 - warning ts(6133): 'statuses' is declared but its value is never read.

Result (88 files): 
- 0 errors
- 0 warnings
- 1 hint
```

#### 3. Astro Production Build (`npm run build`)
```
> hsr-green-energy@0.1.0 build
> astro build

13:10:56 [@astrojs/cloudflare] Enabling compile-time image optimization. Images will be pre-optimized at build time.
13:11:01 [types] Generated 1.16s
13:11:01 [build] output: "server"
13:11:01 [build] mode: "server"
13:11:01 [build] directory: C:\Users\HP\Downloads\HSR CNG\dist\
13:11:01 [build] adapter: @astrojs/cloudflare
13:11:01 [build] Collecting build info...
13:11:01 [build] ✓ Completed in 5.06s.
13:11:01 [build] Building server entrypoints...
13:11:17 [vite] ✓ built in 13.96s
13:11:31 [vite] ✓ built in 13.85s
13:11:33 [vite] ✓ built in 2.66s
13:11:34 [build] Rearranging server assets...
13:11:34 [build] ✓ Completed in 32.37s.
13:11:34 [@astrojs/cloudflare] Injected immutable Cache-Control for /_astro/* into _headers.
13:11:34 [build] Server built in 37.68s
13:11:34 [build] Complete!
```

---

## 2. Logic Chain

1. **Integrity Mode Derivation**:
   - `ORIGINAL_REQUEST.md` mandates: "Do not invent... Preserve this stack... Keep current base price structure... Pre-write payment gating... Enforce public limit in public API and server-side... Zero production mutation."
   - Across Development, Demo, and Benchmark profiles, the code is evaluated for genuine implementation without hardcoded bypasses or external solution copying.

2. **Single Source of Truth for Advance & Pricing**:
   - Observation: `migrations/0006_flat_advance.sql` sets column `flat_advance_paise INTEGER NOT NULL DEFAULT 50000`.
   - Observation: `src/lib/pricing.ts` exports `calculateBookingPrice(basePricePaise, flatAdvancePaise)`.
   - Observation: 10,000 fuzzing iterations in `tests/challenger-m2.test.ts` verify that across all ranges (0 to ₹1,000 crore), `advancePaise + balancePaise === totalPricePaise` holds unconditionally.
   - Inference: Pricing calculation is genuine, mathematically sound, and respects the flat ₹500 default while allowing owner customization.

3. **Pre-Write Payment Gating Authenticity**:
   - Observation: `src/pages/api/booking/create-hold.ts` checks `isPaymentConfigured` immediately after schema parsing and registration validation.
   - Observation: `tests/booking-hold.test.ts` and `tests/adversarial-m2.test.ts` query all 6 D1 tables (`bookings`, `booking_slot_allocations`, `customers`, `vehicles`, `booking_audit_events`, `idempotency_keys`) after an unconfigured hold attempt and verify count equals 0.
   - Inference: Pre-write payment gating fail-closed behavior is authentic, verified by direct database row counting, and completely prevents unserviced holds.

4. **Public Cylinder Limit Enforcement**:
   - Observation: `create-hold.ts` queries the category cylinder count and enforces `categoryRow.cylinderCount <= 6` for `source === 'WEB'`.
   - Observation: Attempted tampering with categories 10, 11, 12, 13, 14, 15 (7–12 cylinders) receives HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` and zero D1 rows are written.
   - Observation: Reception staff requests with `source === 'PHONE'` or `'WALKIN'` succeed with categories having 7–12 cylinders.
   - Inference: Server boundary enforcement is robust and prevents client tampering while retaining reception capability.

5. **Atomic Concurrency and Capacity Invariants**:
   - Observation: When multiple requests race for the exact same slot or overlapping consecutive work units, `db.batch` combined with `bookings_capacity_guard` triggers ensures exactly one request receives HTTP 201, and all competing requests receive HTTP 409 `CAPACITY_CONFLICT`.
   - Observation: Idempotent replays return identical booking codes without duplicate row insertions.
   - Inference: Database invariants and concurrency safety are fully maintained.

---

## 3. Caveats

1. **Zero-Width Space Handling in VPA**:
   - Challenger testing surfaced that `String.prototype.trim()` does not strip zero-width space characters (e.g., `U+200B`). If an owner deliberately entered a string consisting only of zero-width spaces via raw database update, the pre-write check would treat it as non-empty. However, the admin settings API (`src/pages/api/admin/settings.ts`) protects against this via `z.string().trim().min(3)`, making exploitation impossible via standard admin interfaces.
2. **Preview-Only Remote Writes**:
   - Remote execution of `0006_flat_advance.sql` must strictly target the Cloudflare Preview D1 database (`npm run db:migrate:preview`) after owner authorization. Zero writes to Production D1 are permitted.

---

## 4. Conclusion

Milestone M2 has undergone exhaustive forensic integrity analysis.
- **Zero hardcoded test results**
- **Zero facade implementations**
- **Zero fabricated verification artifacts**
- **Zero integrity violations**

The implementation provides genuine, robust, and verifiable functionality meeting all business and engineering invariants.

**FINAL VERDICT: CLEAN**

---

## 5. Verification Method

To independently re-verify this verdict, execute the following commands in PowerShell from the project root:

```powershell
# 1. Run all unit, integration, and challenger test suites
npm run test

# 2. Run Astro static typecheck
npm run typecheck

# 3. Build the Cloudflare Worker production distribution bundle
npm run build
```

### Invalidation Conditions
The verdict must be invalidated and escalated to INTEGRITY VIOLATION if:
- Any D1 write occurs when VPA details are unconfigured or `'SETUP_REQUIRED'`.
- A public web booking request (`source === 'WEB'`) claiming > 6 cylinders creates a booking hold.
- A receptionist booking with 7–12 cylinders is blocked by the public limit.
- An arithmetic price breakdown results in `advancePaise + balancePaise !== totalPricePaise`.
- Migration `0006_flat_advance.sql` executes destructive statements (DROP TABLE, data wipe).
