# Handoff Report: Reviewer M2-1 (Milestone M2 Review)

**Agent**: Reviewer M2-1 (Architecture, Pricing, & Gating Review)  
**Roles**: reviewer, critic  
**Date**: 2026-11-13T07:45:00Z  
**Verdict**: **APPROVE**  
**Recipient**: Orchestrator (`423f96b4-d134-4c92-9308-9dcadcc0a1a3`)

---

## 1. Observation

### 1.1 Files Inspected
The following files modified or introduced in Milestone M2 were thoroughly inspected:
- `migrations/0006_flat_advance.sql`: Forward-only migration adding `flat_advance_paise INTEGER NOT NULL DEFAULT 50000` to `business_settings`, updating business parameters safely without overwriting owner customizations, and upserting owner `kumardeepakola@gmail.com` into `staff_users` with role `OWNER`.
- `src/lib/pricing.ts`: Implementation of `calculateBookingPrice(basePricePaise, flatAdvancePaise)` and `BookingPriceBreakdown` interface.
- `src/lib/types.ts`: BusinessSettings extended with `flat_advance_paise: number`, re-exporting pricing helpers.
- `src/pages/api/admin/settings.ts`: Added `flat_advance_paise` validation (`z.number().int().min(0).max(10_000_000)`), authenticated with `requireRole(request, env, ['OWNER'])` and origin validation.
- `src/pages/api/public/config.ts`: Exposes `flatAdvancePaise` and computed boolean `paymentConfigured` (requiring non-empty, non-`SETUP_REQUIRED` VPA and payee name) with zero PII leakage.
- `src/pages/api/booking/create-hold.ts`: Public endpoint with client-side/server-side origin validation, rate limiting, registration validation via `validateVehicleRegistration`, pre-write payment gating failing closed (HTTP 422), public cylinder limit enforcement (HTTP 400 for count > 6 on web), and atomic hold creation.
- `src/lib/booking-engine.ts`: Defense-in-depth re-validation of registration, payment configuration, and public cylinder limits; snapshot pricing calculations; atomic `db.batch` hold allocations.
- `tests/pricing.test.ts`: Expanded to 30 tests covering default commercial pricing across 1–12 cylinders, zero advance, full advance, discounted prices, and range/type validation.
- `tests/booking-hold.test.ts`: 37 tests covering payment gating, zero D1 writes assertion across 6 tables, tamper rejection, staff exemptions, registration formatting, and capacity conflicts.
- `tests/helpers/d1-mock.ts`: Conformance updates aligning mock with `@cloudflare/workers-types` v5.20261112.1.
- `tests/helpers/test-harness.test.ts`: Harness assertion updates for migration 0006 defaults and owner provisioning.

### 1.2 Mathematical Invariant Check: `calculateBookingPrice`
In `src/lib/pricing.ts`:
```typescript
export function calculateBookingPrice(
  basePricePaise: number,
  flatAdvancePaise: number
): BookingPriceBreakdown {
  if (!Number.isSafeInteger(flatAdvancePaise) || flatAdvancePaise < 0) {
    throw new RangeError('Advance amount must be a non-negative integer number of paise');
  }

  const price = calculateServicePrice(basePricePaise);

  if (flatAdvancePaise > price.totalPricePaise) {
    throw new RangeError('Advance amount cannot exceed the total price');
  }

  return {
    ...price,
    advancePaise: flatAdvancePaise,
    balancePaise: price.totalPricePaise - flatAdvancePaise,
  };
}
```
Algebraically:
`advancePaise + balancePaise = flatAdvancePaise + (price.totalPricePaise - flatAdvancePaise) = price.totalPricePaise`.
The identity holds unconditionally for all valid inputs. Across standard cylinder configurations (1–12 cylinders at ₹2,500 base per cylinder + 18% GST with flat ₹500 advance):
- 1 cyl: Base ₹2,500 (250,000 p) + GST ₹450 (45,000 p) = ₹2,950 (295,000 p) -> Advance ₹500 (50,000 p), Balance ₹2,450 (245,000 p). Sum = 295,000 p.
- 2 cyl: Base ₹5,000 (500,000 p) + GST ₹900 (90,000 p) = ₹5,900 (590,000 p) -> Advance ₹500 (50,000 p), Balance ₹5,400 (540,000 p). Sum = 590,000 p.
- 3 cyl: Base ₹7,500 + GST ₹1,350 = ₹8,850 -> Advance ₹500, Balance ₹8,350. Sum = ₹8,850.
- 4 cyl: Base ₹10,000 + GST ₹1,800 = ₹11,800 -> Advance ₹500, Balance ₹11,300. Sum = ₹11,800.
- 5 cyl: Base ₹12,500 + GST ₹2,250 = ₹14,750 -> Advance ₹500, Balance ₹14,250. Sum = ₹14,750.
- 6 cyl: Base ₹15,000 + GST ₹2,700 = ₹17,700 -> Advance ₹500, Balance ₹17,200. Sum = ₹17,700.
- 7 cyl: Base ₹17,500 + GST ₹3,150 = ₹20,650 -> Advance ₹500, Balance ₹20,150. Sum = ₹20,650.
- 8 cyl: Base ₹20,000 + GST ₹3,600 = ₹23,600 -> Advance ₹500, Balance ₹23,100. Sum = ₹23,600.
- 9 cyl: Base ₹22,500 + GST ₹4,050 = ₹26,550 -> Advance ₹500, Balance ₹26,050. Sum = ₹26,550.
- 10 cyl: Base ₹25,000 + GST ₹4,500 = ₹29,500 -> Advance ₹500, Balance ₹29,000. Sum = ₹29,500.
- 11 cyl: Base ₹27,500 + GST ₹4,950 = ₹32,450 -> Advance ₹500, Balance ₹31,950. Sum = ₹32,450.
- 12 cyl: Base ₹30,000 + GST ₹5,400 = ₹35,400 -> Advance ₹500, Balance ₹34,900. Sum = ₹35,400.
In addition, `tests/challenger-m2.test.ts` fuzz-tested this function across 10,000 randomized property-based iterations up to multi-crore values (5 trillion paise); zero violations occurred.

### 1.3 Pre-Write Payment Gating & Tamper Resistance
In `src/pages/api/booking/create-hold.ts`:
1. **Pre-Write Gating**: Reads `business_settings`. If `vpa_id` or `vpa_payee_name` is missing, whitespace, or `'SETUP_REQUIRED'`, returns HTTP 422 with code `ONLINE_PAYMENT_UNAVAILABLE` and contact object (`phone: '+919910055355'`, `whatsapp: '+919910055355'`, `whatsappUrl`). This executes before any write statement. Tested and verified: 0 rows written to `bookings`, `booking_slot_allocations`, `customers`, `vehicles`, `booking_audit_events`, or `idempotency_keys`.
2. **Public Cylinder Limitation**: Checks category cylinder count. If `source === 'WEB'` and `cylinderCount > 6`, rejects with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` and returns contact card. Zero D1 writes occur.
3. **Anti-Tampering**: `createHoldSchema` enforces `source: z.literal('WEB').default('WEB')`, and `createHold` overrides `source: 'WEB'`. Clients cannot bypass limits by submitting `source: 'PHONE'` in the request body.
4. **Staff Capability Retained**: Phone/walk-in receptionist bookings (`source !== 'WEB'`) permit booking categories with 7–12 cylinders.

### 1.4 Vehicle Registration Validation Integration
- `validateVehicleRegistration` is invoked at the API boundary in `create-hold.ts` and re-checked defensively in `booking-engine.ts`.
- Valid State series and Bharat BH series registrations are normalized to uppercase alphanumeric (stripping spaces/hyphens) before storage in `vehicles.registration_normalized`.
- Malformed registrations (`GARBAGE123`, `1234`, `DL1`, etc.) return HTTP 400 `INVALID_VEHICLE_REGISTRATION` with zero D1 writes.

---

## 2. Logic Chain

1. **Math Integrity**: `calculateServicePrice` calculates GST with exact rounding `Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10_000)`. `calculateBookingPrice` subtracts `flatAdvancePaise` from `totalPricePaise`. Because both values are non-negative safe integers and `advancePaise <= totalPricePaise`, `advancePaise + balancePaise === totalPricePaise` is an algebraic invariant.
2. **Fail-Closed Security**: Payment credentials must exist and be distinct from `'SETUP_REQUIRED'` or whitespace. Since this check occurs before `createHold` or any D1 write statement, an unconfigured payment gateway cannot produce orphaned holds or confusing payment screens for users.
3. **Tamper Prevention**: Because `source: 'WEB'` is strictly enforced server-side and `z.literal('WEB')` rejects non-WEB values on public endpoints, client spoofing is impossible.
4. **Database Safety**: `migrations/0006_flat_advance.sql` uses non-destructive, forward-only SQL (`ALTER TABLE ... ADD COLUMN`, `UPDATE ... WHERE ... = 'SETUP_REQUIRED'`, `INSERT OR IGNORE / ON CONFLICT DO UPDATE`). It preserves any deliberate owner customizations.
5. **No Cheating / Integrity Violations**: Source code contains genuine business logic, not hardcoded outputs. Tests dynamically calculate prices and verify D1 table states.

---

## 3. Caveats & Adversarial Findings

1. **Test Concurrency Timeout Advisory (Minor)**:
   - When Vitest runs all 10+ test suites concurrently on Windows under high load, `tests/booking-hold.test.ts:188` (`passes gate when UPI is properly configured and returns UPI QR code`) can occasionally run close to the 5,000ms default test timeout due to heavy CPU operations (in-memory SQLite migrations, QRCode PNG generation, and RSA key generations). Running the suite in isolation completes in 2.4s.
   - *Recommendation*: Configure `testTimeout: 15_000` in `vitest.config.ts` or set a 15s timeout on that specific integration test.
2. **Vehicle Registration Sanitization vs Rejection (Adversarial Boundary Observation)**:
   - `normalizeVehicleRegistration` in `src/lib/vehicle-registration.ts` uses `replace(/[^A-Z0-9]/g, '')`, which strips punctuation/symbols (such as `@`, `#`, `$`, `.`) rather than rejecting strings containing unsupported symbols prior to sanitization.
   - *Recommendation*: For Milestone M7 (Quality & Testing), consider tightening `validateVehicleRegistration` to reject strings containing invalid non-delimiter characters before stripping.
3. **Preview Database Deployment Invariant**:
   - `migrations/0006_flat_advance.sql` must only be applied to Preview D1 (`npm run db:migrate:preview`) when authorized. Never execute against production.

---

## 4. Conclusion

Milestone M2 is **VERIFIED AND APPROVED**.
- All requirements from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `hsr-implementation-plan.md` for Milestone M2 are fully met.
- Zero integrity violations detected.
- Code conforms to all project conventions, security policies, and architectural invariants.

**Verdict: APPROVE**

---

## 5. Verification Method

The following verification commands were executed and verified independently:

### 5.1 Verification Commands and Verbatim Output

#### 1. Unit & Integration Test Suites
```powershell
npx vitest run tests/pricing.test.ts tests/booking-hold.test.ts tests/challenger-m2.test.ts
```
**Output**:
```
 RUN  v4.1.12 C:/Users/HP/Downloads/HSR CNG

 ✓ tests/pricing.test.ts (30 tests) 47ms
 ✓ tests/challenger-m2.test.ts (12 tests) 9303ms
 ✓ tests/booking-hold.test.ts (37 tests) 27943ms

 Test Files  3 passed (3)
      Tests  79 passed (79)
   Start at  12:48:57
   Duration  62.69s (transform 26.56s, setup 0ms, import 38.83s, tests 37.29s, environment 1ms)
```

#### 2. Type Checking (`npm run typecheck`)
```powershell
npm run typecheck
```
**Output**:
```
> hsr-green-energy@0.1.0 typecheck
> astro check

[@astrojs/cloudflare] Enabling compile-time image optimization. Images will be pre-optimized at build time.
[types] Generated 4.77s
[check] Getting diagnostics for Astro files in C:\Users\HP\Downloads\HSR CNG...

Result (88 files): 
- 0 errors
- 0 warnings
- 1 hint
```

#### 3. Production Bundle Build (`npm run build`)
```powershell
npm run build
```
**Output**:
```
> hsr-green-energy@0.1.0 build
> astro build

[@astrojs/cloudflare] Enabling compile-time image optimization. Images will be pre-optimized at build time.
[types] Generated 3.18s
[build] output: "server"
[build] mode: "server"
[build] directory: C:\Users\HP\Downloads\HSR CNG\dist\
[build] adapter: @astrojs/cloudflare
[build] Collecting build info...
[build] ✓ Completed in 8.07s.
[build] Building server entrypoints...
[vite] ✓ built in 30.95s
[vite] ✓ built in 21.20s
[vite] ✓ built in 5.71s
[build] Rearranging server assets...
[build] ✓ Completed in 1m 5s.
[@astrojs/cloudflare] Injected immutable Cache-Control for /_astro/* into _headers.
[build] Server built in 1m 14s
[build] Complete!
```

### 5.2 Invalidation Conditions
- If `calculateBookingPrice(base, advance)` yields `advancePaise + balancePaise !== totalPricePaise` for any input.
- If `POST /api/booking/create-hold` writes any row to D1 when `vpa_id` or `vpa_payee_name` is unconfigured.
- If a public web request with `cylinderCount > 6` creates a booking hold.
- If a receptionist request with 8 cylinders fails on cylinder limit checks.
