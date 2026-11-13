# Handoff Report — Agent B: Booking and Business Logic Engineer

**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_2`  
**Handoff Type**: Hard Handoff (Investigation Complete)  
**Target Recipient**: Orchestrator (Conversation ID: `8d667e27-5030-463a-8d49-7a6f7181d0c7`)  

---

## 1. Observation

1. **Pricing & Advance Seed State**:
   - In `migrations/0005_cylinder_work_units.sql` lines 63–77:
     ```sql
     INSERT INTO vehicle_categories(code, sort_order, name_en, name_hi, cylinder_count, base_price_paise, gst_rate_bps, advance_paise, is_active)
     SELECT 'CYL_' || printf('%02d', n), n, ..., n, 250000 * n, 1800, NULL, 1 FROM cylinder_counts;
     ```
     `advance_paise` is initialized to `NULL` for all categories 1–12.
   - In `src/components/booking/BookingWizard.tsx` lines 160–165:
     ```tsx
     if (category.advancePaise == null || category.advancePaise <= 0) {
       setMessage(hindi ? 'ऑनलाइन अग्रिम भुगतान नीति अभी सेट नहीं है। कृपया फोन पर बुकिंग करें।' : 'Online advance-payment settings are not configured for this cylinder count. Please book by phone.');
       return;
     }
     ```
     Because `advancePaise` is null, self-service online booking is currently disabled out-of-the-box for all cylinder counts.

2. **Payment Gate Defect in Hold Creation**:
   - In `src/pages/api/booking/create-hold.ts` lines 33–44:
     ```ts
     const result = await createHold(db, { ...parsed.data, source: 'WEB' });
     let upiUri: string | null = null;
     let upiQrDataUrl: string | null = null;
     if (
       result.paymentConfig.vpaId !== 'SETUP_REQUIRED' &&
       result.paymentConfig.payeeName !== 'SETUP_REQUIRED' &&
       result.pricing.advancePaise != null
     ) {
       upiUri = buildUpiUrl(...);
       upiQrDataUrl = await QRCode.toDataURL(...);
     }
     ```
     `createHold` executes the database batch write (inserting customer, vehicle, booking, and allocating slots in `booking_slot_allocations`) **before** checking whether merchant UPI VPA and payee name are configured. When `vpa_id === 'SETUP_REQUIRED'`, a hold is created, locking work units for 15 minutes, but the customer receives no payment instructions.

3. **Public Cylinder Limit & API Tampering**:
   - In `src/pages/api/public/availability.ts` line 11:
     `cylinderCount: z.coerce.number().int().min(1).max(20).default(1)`
   - In `src/pages/api/booking/create-hold.ts` line 8:
     `categoryId: z.number().int().positive()`
   - In `src/lib/booking-engine.ts` lines 235–258:
     `SELECT ... FROM vehicle_categories WHERE id = ? AND is_active = 1`
     There is no constraint ensuring `categoryRow.cylinderCount <= 6` when `input.source === 'WEB'`.
   - In `migrations/0005_cylinder_work_units.sql` lines 235–236:
     The trigger only checks `NEW.cylinder_count_snapshot BETWEEN 1 AND 20`. Thus, an attacker can modify a web request to book 7–12 cylinders online.

4. **Receptionist Category Access**:
   - In `src/components/admin/ReceptionDashboard.tsx` line 123:
     `fetch('/api/public/vehicle-categories?locale=' + locale)`
   - In `src/pages/api/admin/categories.ts` line 34:
     `const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);`
     Receptionists are forbidden (`403 Forbidden`) from calling `/api/admin/categories`. If `/api/public/vehicle-categories` is restricted to 1–6 cylinders, the receptionist dashboard will only see 1–6 cylinders and lose manual booking capability for 7–12 cylinders.

5. **Vehicle Registration Normalization & Validation**:
   - In `src/lib/utils.ts` line 28:
     ```ts
     export function normalizeVehicleRegistration(value: string): string {
       return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
     }
     ```
     Hyphens are preserved. `DL 01 AB 1234` normalizes to `DL01AB1234`, while `DL-01-AB-1234` normalizes to `DL-01-AB-1234`, causing duplicate vehicle rows.
   - In `src/lib/schemas.ts` line 12:
     `vehicleRegistration: z.string().trim().min(4).max(20)`
     No format regex is applied. Arbitrary strings (e.g. `HELLO-WORLD`, `ABCD`) pass validation.

6. **Time Selection UX**:
   - In `src/components/booking/BookingWizard.tsx` lines 324–341:
     Appointment selection renders a single flat list of button elements for all start slots on that date. It lacks the two linked dropdowns (Hour first, Exact Start Time second) and finish time calculation requested in customer feedback 5.3.

---

## 2. Logic Chain

1. **Advance Amount & Balance (Refs: Obs 1, 2)**:
   - The owner requires a flat ₹500 advance per booking across public cylinder options 1–6.
   - Total price is `basePricePaise + round(basePricePaise * 0.18)`.
   - Balance payable is `totalPricePaise - 50000` paise.
   - To preserve owner edits without breaking existing configured values, forward migration `0006_advance_pricing.sql` must update `vehicle_categories SET advance_paise = 50000 WHERE code IN ('CYL_01',...,'CYL_06') AND advance_paise IS NULL`.

2. **Payment Gate Protection (Ref: Obs 2)**:
   - If merchant UPI details are not configured, online customers cannot complete advance payment.
   - Creating a hold in this state locks real station work units in `booking_slot_allocations`, denying capacity to phone/walk-in customers for 15 minutes.
   - Therefore, `createHold` must verify `settings.vpa_id !== 'SETUP_REQUIRED'` and `settings.vpa_payee_name !== 'SETUP_REQUIRED'` and `advancePaise > 0` before any SQL statement is executed, failing closed with a clean phone/WhatsApp referral.

3. **Public Limit vs. Receptionist Workflows (Refs: Obs 3, 4)**:
   - Public online customers must only be offered 1–6 cylinders.
   - Direct API requests for >6 cylinders from `source = 'WEB'` must be rejected in `createHoldSchema`, `createHold`, and enforced at the DB boundary in `bookings_capacity_guard`.
   - Receptionists need 1–12 cylinder booking support. Because `/api/public/vehicle-categories` will now return only categories 1–6, `/api/admin/categories` GET must allow `RECEPTIONIST` role so `ReceptionDashboard.tsx` can retrieve all 12 categories securely.

4. **Vehicle Registration Integrity (Ref: Obs 5)**:
   - To prevent duplicate vehicle records and garbage data, normalization must strip all hyphens, whitespace, and non-alphanumeric characters: `value.toUpperCase().replace(/[^A-Z0-9]/g, '')`.
   - Validation must accept both Indian State/UT series (`^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$`) and Bharat Series (`^\d{2}BH\d{4}[A-Z]{1,2}$`).
   - This check must be enforced symmetrically across public booking holds, admin manual bookings, and cylinder register entries.

5. **Time Selection Dropdowns (Ref: Obs 6)**:
   - Multi-cylinder bookings occupy contiguous work units (e.g. 6 cylinders = 6 units = 120 mins at 20-min interval, or 90 mins at 15-min interval).
   - Grouping bookable start slots by hour provides a clear two-step selection: Hour dropdown -> Exact start time dropdown.
   - The exact start time option clearly displays the calculated finish time (`bookingEndTime`).

---

## 3. Caveats

1. **R2 Preview Configuration**:
   - As documented in `docs/deployment.md`, Preview environments deliberately lack an R2 bucket binding. Evidence screenshot upload must remain disabled in Preview, with UTR reference text submission serving as the primary evidence submission path.
2. **Production SAC/GST Treatment**:
   - The current 18% GST calculation is an application configuration, not a formal tax/SAC legal determination. This is preserved per project requirements.
3. **No Unapproved Preview Writes**:
   - In accordance with read-only survey guidelines, no remote D1 migrations or Preview remote executions were executed during this investigation.

---

## 4. Conclusion

The booking and availability engine architecture in HSR Green Energy is solid: D1 batching, atomic slot allocation constraints, and trigger guards effectively prevent double bookings and race conditions. However, six critical business logic and security implementations are required:
1. Seed default flat ₹500 advance for options 1–6 via migration `0006_advance_pricing.sql`.
2. Implement strict payment gating before D1 hold writes when UPI merchant credentials are missing.
3. Enforce 1–6 cylinder limits on public web routes, API endpoints, and database triggers, with Truck defaulting to 4.
4. Allow `RECEPTIONIST` role to fetch all 12 categories via `/api/admin/categories` GET for manual bookings.
5. Implement Indian vehicle registration format validation (State & BH series) and hyphen-free normalization.
6. Refactor Booking Wizard time selection into linked Hour and Exact Time dropdowns with finish time display, and single-tap date selection.

---

## 5. Verification Method

1. **Unit & Logic Tests**:
   - Run Vitest suite:
     ```powershell
     npm run test
     ```
     Inspect that all 7 test files (39 tests) pass.
   - Run typecheck and lint:
     ```powershell
     npm run typecheck
     npm run lint
     ```
2. **File Inspection**:
   - Verify `migrations/0005_cylinder_work_units.sql` lines 63–77 for `advance_paise` seed state.
   - Verify `src/pages/api/booking/create-hold.ts` lines 33–44 for hold creation execution before UPI check.
   - Verify `src/lib/utils.ts` line 28 for hyphen retention in `normalizeVehicleRegistration`.
   - Verify `src/pages/api/admin/categories.ts` line 34 for `OWNER`-only restriction on GET.
3. **Phase B Implementation Verification**:
   - Add a dedicated test file `tests/booking-business-logic.test.ts` covering:
     - Flat ₹500 advance and balance computation for 1, 2, 4, 6 cylinders.
     - Hold creation failure when VPA/payee is `SETUP_REQUIRED`.
     - Rejection of `source = 'WEB'` requests for >6 cylinders.
     - Truck default 4 cylinders.
     - Valid and invalid vehicle registration strings (State and BH series).
     - Linked hour/start-time dropdown filtering and consecutive finish times.
