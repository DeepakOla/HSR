# Dispatch: Worker M2 (Pricing Engine, Flat ₹500 Advance & Pre-Write Payment Gate)

## Objectives
Implement Milestone M2 with genuine business logic, atomic guarantees, and comprehensive test coverage.

## Input Documents (Mandatory Reading First)
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user requirements)
- `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
- `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1\handoff.md` (Database migration & schema)
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2\handoff.md` (Pricing engine & test matrix)
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_3\handoff.md` (Booking hold API, payment gating, validation)

## File Ownership
You exclusively own and may edit or create:
- `migrations/0006_flat_advance.sql` (NEW)
- `src/lib/pricing.ts` (MODIFY)
- `src/lib/types.ts` (MODIFY)
- `src/pages/api/admin/settings.ts` (MODIFY)
- `src/pages/api/public/config.ts` (MODIFY)
- `src/pages/api/booking/create-hold.ts` (MODIFY)
- `src/lib/booking-engine.ts` (MODIFY)
- `tests/pricing.test.ts` (MODIFY)
- `tests/booking-hold.test.ts` (NEW)
- `tests/helpers/test-harness.test.ts` (MODIFY if needed for migration defaults)
- `tests/helpers/d1-mock.ts` (MODIFY if needed for clean typecheck)

## Mandatory Tasks
1. Create `migrations/0006_flat_advance.sql`:
   - Add `flat_advance_paise INTEGER NOT NULL DEFAULT 50000` to `business_settings`.
   - Update default `business_name_en = 'HSR'`, `business_name_hi = 'एचएसआर'` where unset, empty, SETUP_REQUIRED, or 'HSR Green Energy'.
   - Update default `city = 'Rewari'` where unset, empty, or SETUP_REQUIRED.
   - Update default `contact_phone = '+919910055355'`, `whatsapp_number = '+919910055355'` where unset, empty, or SETUP_REQUIRED.
   - Insert/update `kumardeepakola@gmail.com` with role `OWNER` and `is_active = 1` in `staff_users` on conflict.
2. Update `src/lib/types.ts`:
   - Add `flat_advance_paise: number` to `BusinessSettings`.
   - Export `BookingPriceBreakdown` from `pricing.ts`.
3. Update `src/pages/api/admin/settings.ts`:
   - Add `flat_advance_paise: z.number().int().min(0).max(10_000_000).optional()` to `editableSchema`.
4. Update `src/pages/api/public/config.ts`:
   - Return `flatAdvancePaise: settings.flat_advance_paise`.
5. Update `src/lib/pricing.ts`:
   - Export `BookingPriceBreakdown` extending `ServicePrice` with `advancePaise: number` and `balancePaise: number`.
   - Implement `calculateBookingPrice(basePricePaise: number, flatAdvancePaise: number): BookingPriceBreakdown`.
   - Validate integer, non-negative, and `advancePaise <= totalPricePaise` with `RangeError`.
6. Update `src/pages/api/booking/create-hold.ts`:
   - Integrate `validateVehicleRegistration` from `src/lib/vehicle-registration.ts`. Reject invalid registrations with HTTP 400 `INVALID_VEHICLE_REGISTRATION`.
   - Pre-write payment gate: query `business_settings`. If `vpa_id` or `vpa_payee_name` is missing, whitespace, or `'SETUP_REQUIRED'`, fail-closed with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` and phone/WhatsApp contact (+91 9910055355). Ensure ZERO D1 writes occur!
   - Server-side public cylinder limit: If `source === 'WEB'` and category `cylinderCount > 6`, reject with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` and phone/WhatsApp contact.
   - Pass normalized vehicle registration and flat advance to hold creation.
7. Update `src/lib/booking-engine.ts`:
   - Integrate flat advance from `business_settings.flat_advance_paise` for web bookings.
   - Use `calculateBookingPrice` for snapshot pricing fields.
   - Add defense-in-depth registration validation and public cylinder limit checks.
8. Expand `tests/pricing.test.ts`:
   - Add comprehensive test suite for `calculateBookingPrice` across all 1 to 12 cylinders, zero advance, full advance, custom base price, and all error conditions.
9. Create `tests/booking-hold.test.ts`:
   - Implement comprehensive tests covering pre-write payment gating (fail-closed 422), zero D1 writes assertion, server-side cylinder tampering rejection (400 for 7+ cylinders on WEB), reception exemption (allowed 1-12 for PHONE/WALKIN), registration validation (State and Bharat BH series accepted, malformed rejected), flat ₹500 advance breakdown, and atomic hold creation.
10. Run builds and tests:
   - Run `npm run test` (must pass 100%).
   - Run `npm run typecheck` (diagnostics must be resolved or documented).
   - Run `npm run build` (Astro build must succeed).

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Handoff Requirements
Write complete report to `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m2\handoff.md` with:
- Exact files modified and created.
- Verification commands executed (`npm run test`, `npm run typecheck`, `npm run build`) with exact outputs.
- Test counts and coverage summary.


## 2026-11-13T06:29:38Z
[Message] timestamp=2026-11-13T06:29:38Z sender=423f96b4-d134-4c92-9308-9dcadcc0a1a3 priority=MESSAGE_PRIORITY_HIGH content=You are Worker M2 (Milestone M2 Implementation Worker).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m2

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m2\DISPATCH.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1\handoff.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2\handoff.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK:
Implement Milestone M2:
1. Create `migrations/0006_flat_advance.sql`:
   - Add column `flat_advance_paise INTEGER NOT NULL DEFAULT 50000` to `business_settings`.
   - Update default business name: `business_name_en = 'HSR'`, `business_name_hi = 'एचएसआर'` where unset, empty, 'SETUP_REQUIRED', or 'HSR Green Energy'.
   - Update default city: `city = 'Rewari'` where unset, empty, or 'SETUP_REQUIRED'.
   - Update default contact phone and WhatsApp: `contact_phone = '+919910055355'`, `whatsapp_number = '+919910055355'` where unset, empty, or 'SETUP_REQUIRED'.
   - Upsert `kumardeepakola@gmail.com` with role `'OWNER'` and `is_active = 1` in `staff_users` on conflict.
2. Update `src/lib/types.ts`:
   - Add `flat_advance_paise: number;` to `BusinessSettings`.
   - Re-export `BookingPriceBreakdown` and `calculateBookingPrice` from `pricing.ts`.
3. Update `src/pages/api/admin/settings.ts`:
   - Add `flat_advance_paise: z.number().int().min(0).max(10_000_000).optional()` to `editableSchema`.
4. Update `src/pages/api/public/config.ts`:
   - Expose `flatAdvancePaise: settings.flat_advance_paise` in public config.
5. Update `src/lib/pricing.ts`:
   - Export `BookingPriceBreakdown` extending `ServicePrice` with `advancePaise: number` and `balancePaise: number`.
   - Implement `calculateBookingPrice(basePricePaise: number, flatAdvancePaise: number): BookingPriceBreakdown`.
   - Validate integer, non-negative, and `advancePaise <= totalPricePaise` with `RangeError`.
6. Update `src/pages/api/booking/create-hold.ts`:
   - Integrate `validateVehicleRegistration` from `src/lib/vehicle-registration.ts`. Reject invalid registrations with HTTP 400 `INVALID_VEHICLE_REGISTRATION`.
   - Pre-write payment gate: read `business_settings`. If `vpa_id` or `vpa_payee_name` is missing, whitespace, or `'SETUP_REQUIRED'`, fail-closed with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` and phone/WhatsApp contact (+91 9910055355). Ensure ZERO D1 writes occur!
   - Server-side public cylinder limit: If `source === 'WEB'` and requested category has `cylinderCount > 6`, reject with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` and phone/WhatsApp contact.
   - Pass normalized vehicle registration and flat advance to hold creation.
7. Update `src/lib/booking-engine.ts`:
   - Integrate flat advance from `business_settings.flat_advance_paise` for web bookings.
   - Use `calculateBookingPrice` for snapshot pricing fields.
   - Add defense-in-depth registration validation and public cylinder limit checks.
8. Expand `tests/pricing.test.ts`:
   - Add comprehensive tests for `calculateBookingPrice` across 1 to 12 cylinders, zero advance, full advance, custom base price, and all error conditions.
9. Create `tests/booking-hold.test.ts`:
   - Test pre-write payment gating (fail-closed 422).
   - Test ZERO D1 writes assertion after rejection.
   - Test server-side cylinder tampering rejection (400 for 7+ cylinders on WEB).
   - Test reception exemption (allowed 1-12 for PHONE/WALKIN).
   - Test vehicle registration validation (State and Bharat BH series accepted, malformed rejected).
   - Test flat ₹500 advance breakdown and atomic hold creation.
10. Fix any typing mismatches in `tests/helpers/d1-mock.ts` if needed so that `npm run typecheck` passes cleanly.
11. Run verification commands:
   - `npm run test`
   - `npm run typecheck`
   - `npm run build`
12. Write handoff report to `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m2\handoff.md` and send completion message to caller.
