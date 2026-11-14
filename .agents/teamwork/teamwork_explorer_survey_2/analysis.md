# Comprehensive Investigation: Booking Engine, Availability, Pricing, and Concurrency Safeguards

**Author**: Agent B — Booking and Business Logic Engineer (`teamwork_explorer`)  
**Date**: 2026-11-12  
**Working Directory**: `c:\Users\HP\Downloads\HSR CNG`  
**State Folder**: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_2`  

---

## 1. Executive Summary

This investigation analyzed the HSR Green Energy booking platform, covering D1 database schema, migrations, booking engine allocation, pricing and advance logic, payment gating, concurrency defenses, and vehicle registration validation.

### Key Discoveries & Architectural Gaps
1. **Advance Amount & Pricing Logic**:
   - The pricing model calculates ₹2,500 base per cylinder + 18% GST = ₹2,950 total for 1 cylinder.
   - Migration `0005_cylinder_work_units.sql` seeded categories `CYL_01` through `CYL_12` with `advance_paise = NULL`. Because advance is null, the booking wizard currently blocks online booking unless manually configured.
   - The requirement calls for a flat **₹500 advance per booking** (not per cylinder) for public options 1–6, with `balance = total - ₹500`.
   - **Payment Gate Vulnerability**: In `src/pages/api/booking/create-hold.ts`, `createHold()` is executed **before** checking whether merchant UPI credentials (`vpa_id`, `vpa_payee_name`) are configured. If they are `SETUP_REQUIRED`, a booking hold is created in D1 and work units are locked for 15 minutes, but `upiUri` is null. The customer is stranded without payment instructions, locking station capacity unnecessarily.
2. **Vehicle Selection & Public Cylinder Limit**:
   - The public wizard dropdown currently offers 1–12 cylinders. It must be constrained to 1–6 and "More than 6" (directing to phone/centre contact).
   - Currently, server-side APIs (`/api/booking/create-hold`, `/api/public/availability`) do not enforce the maximum 6 cylinder limit for web bookings. A malicious actor can bypass the React frontend and reserve 7–12 cylinders online.
   - Truck selection must automatically default to 4 cylinders while allowing customer adjustments.
   - Receptionists require manual booking capability for 1–12 cylinders. Currently, `ReceptionDashboard.tsx` fetches categories from `/api/public/vehicle-categories`. If public categories are restricted to 1–6, receptionists would lose access to 7–12 unless `/api/admin/categories` GET is updated to allow `RECEPTIONIST` role (currently restricted to `OWNER` only).
3. **Time Selection & Consecutive Slots**:
   - Time slots represent work units of 15 or 20 minutes per cylinder. Multi-cylinder appointments reserve a contiguous run of work units.
   - The current UI shows a flat button list of available times. The user requirement demands two linked dropdowns: **Hour selection** first (e.g. 6 AM, 7 AM), followed by **Exact start time** (e.g. 06:00, 06:20), displaying the computed finish time clearly.
   - Concurrency is guarded across 5 layers: client filtering, server run verification, atomic D1 batching, a `UNIQUE(slot_snapshot_id)` constraint on `booking_slot_allocations`, and the `bookings_capacity_guard` database trigger.
4. **Vehicle Registration Validation**:
   - Currently, `normalizeVehicleRegistration` in `src/lib/utils.ts` retains hyphens (`replace(/[^A-Z0-9-]/g, '')`) and accepts arbitrary text of length 4–20. `DL 01 AB 1234` and `DL-01-AB-1234` normalize differently, causing duplicate vehicle rows.
   - Robust regex patterns must be added for standard Indian State/UT series (`^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$`) and Bharat Series (`^\d{2}BH\d{4}[A-Z]{1,2}$`), stripping all hyphens and whitespace during normalization. Client-side and server-side parity is required across Public Booking, Reception Desk, and Cylinder Register.
5. **Schema & Migration Impact**:
   - Safe forward-only migration `0006_advance_pricing.sql` is needed to seed `advance_paise = 50000` (₹500) where `advance_paise IS NULL` for categories `CYL_01` to `CYL_06`, normalize existing vehicle registration rows, and harden the database trigger to reject public web bookings for >6 cylinders.

---

## 2. Topic 1: Pricing Logic, Flat ₹500 Advance & Payment Gate

### 2.1 Pricing Calculation & Snapshots
- Base calculation is defined in `src/lib/pricing.ts`:
  ```ts
  export const FIXED_GST_RATE_BPS = 1800; // 18.00%
  export function calculateServicePrice(basePricePaise: number): ServicePrice {
    const gstAmountPaise = Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10_000);
    return {
      basePricePaise,
      gstRateBps: FIXED_GST_RATE_BPS,
      gstAmountPaise,
      totalPricePaise: basePricePaise + gstAmountPaise,
    };
  }
  ```
- Seeded base prices (`0005_cylinder_work_units.sql` lines 63–77): `250000 * n` (i.e. ₹2,500 per cylinder).
- Breakdown across public cylinder counts (1–6):
  | Cylinders | Base Price (₹) | 18% GST (₹) | Total Payable (₹) | Flat Advance (₹) | Balance Payable (₹) |
  |:---:|:---:|:---:|:---:|:---:|:---:|
  | **1** | ₹2,500 (250,000 p) | ₹450 (45,000 p) | ₹2,950 (295,000 p) | **₹500** (50,000 p) | **₹2,450** (245,000 p) |
  | **2** | ₹5,000 (500,000 p) | ₹900 (90,000 p) | ₹5,900 (590,000 p) | **₹500** (50,000 p) | **₹5,400** (540,000 p) |
  | **3** | ₹7,500 (750,000 p) | ₹1,350 (135,000 p) | ₹8,850 (885,000 p) | **₹500** (50,000 p) | **₹8,350** (835,000 p) |
  | **4** | ₹10,000 (1,000,000 p) | ₹1,800 (180,000 p) | ₹11,800 (1,180,000 p) | **₹500** (50,000 p) | **₹11,300** (1,130,000 p) |
  | **5** | ₹12,500 (1,250,000 p) | ₹2,250 (225,000 p) | ₹14,750 (1,475,000 p) | **₹500** (50,000 p) | **₹14,250** (1,425,000 p) |
  | **6** | ₹15,000 (1,500,000 p) | ₹2,700 (270,000 p) | ₹17,700 (1,770,000 p) | **₹500** (50,000 p) | **₹17,200** (1,720,000 p) |

- Pricing Snapshots in `bookings` Table:
  Every booking stores immutable snapshots at insertion (`src/lib/booking-engine.ts` lines 352–373):
  `base_price_paise_snapshot`, `gst_rate_bps_snapshot`, `gst_amount_paise_snapshot`, `total_price_paise_snapshot`, `advance_paise_snapshot`, `balance_paise_snapshot`, and `amount_paid_paise`. Subsequent changes to prices in Owner Settings never mutate prior bookings.

### 2.2 Payment Gate & Hold Creation Safeguards
- **Current Defect**:
  In `src/pages/api/booking/create-hold.ts`:
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
    upiQrDataUrl = await QRCode.toDataURL(upiUri, ...);
  }
  ```
  `createHold` executes the full D1 database batch transaction before checking whether `vpaId` or `payeeName` are usable. If the owner has not set up merchant UPI details (`vpa_id = 'SETUP_REQUIRED'`), the appointment slot is locked in `booking_slot_allocations` for 15 minutes, but the customer cannot pay.
- **Required Invariant**:
  When merchant UPI VPA or payee name is missing, empty, or `SETUP_REQUIRED`, or when advance is not configured:
  1. `createHold` (and `POST /api/booking/create-hold`) MUST reject hold creation **before** any database write, returning HTTP 422/400 (`PAYMENT_INSTRUCTIONS_UNAVAILABLE`).
  2. The response must include center contact phone/WhatsApp for manual booking.
  3. `BookingWizard.tsx` must inspect payment readiness upon loading and guide customers to Phone/WhatsApp directly, disabling hold submission.

---

## 3. Topic 2: Vehicle Selection and Cylinder Limits

### 3.1 Public Online Booking (1–6 Limit)
- Customer Journey Step 2 (Vehicle):
  - Dropdown options: `Car`, `Taxi`, `Tempo`, `Van`, `LCV`, `Truck`, `Bus`, `Other`.
  - When **Truck** is selected, automatically set `cylinderCount = 4`. The user can manually override the count.
  - Optional field: Make/Model (e.g. "Maruti WagonR", "Tata 407").
- Customer Journey Step 3 (Cylinder Count):
  - Public dropdown options: `1 cylinder`, `2 cylinders`, `3 cylinders`, `4 cylinders`, `5 cylinders`, `6 cylinders`, `More than 6`.
  - Selecting "More than 6" immediately suspends self-service progression and renders clear contact instructions for the center with phone and WhatsApp links.
  - Server-side enforcement:
    - `/api/public/availability`: Restrict `cylinderCount` query param to `min(1).max(6)`.
    - `/api/public/vehicle-categories`: Only return categories where `cylinder_count <= 6`.
    - `/api/booking/create-hold` and `createHold`: Reject any request where `source === 'WEB'` and `cylinderCount > 6`.
    - D1 Trigger `bookings_capacity_guard`: Add `SELECT RAISE(ABORT, 'PUBLIC_CYLINDER_LIMIT_EXCEEDED') WHERE NEW.source = 'WEB' AND NEW.cylinder_count_snapshot > 6;`.

### 3.2 Receptionist Manual Booking (1–12 Support)
- Reception desk (`/admin/reception/` and `/api/admin/manual-bookings`) supports `PHONE`, `WHATSAPP`, and `WALKIN` sources.
- Receptionists can book 1 to 12 cylinders.
- **Critical Fix**: Currently, `ReceptionDashboard.tsx` loads categories from `/api/public/vehicle-categories`. Restricting public categories to 1–6 would break receptionist access to categories 7–12.
  - Fix: Update `src/pages/api/admin/categories.ts` GET handler from `requireRole(request, env, ['OWNER'])` to `requireRole(request, env, ['OWNER', 'RECEPTIONIST'])`, and update `ReceptionDashboard.tsx` to fetch from `/api/admin/categories`.

---

## 4. Topic 3: Time Selection, Linked Dropdowns & Slot Availability

### 4.1 Time Slots & Work Units
- 1 work unit = 1 cylinder = 15 or 20 minutes (configurable via `weekly_schedule.slot_interval_minutes`).
- Consecutive Run Allocation:
  - An appointment for $N$ cylinders requires $N$ contiguous, unreserved, open, public slots.
  - For $N=6$ cylinders at 20-minute interval:
    - Slot 1: 06:00 – 06:20
    - Slot 2: 06:20 – 06:40
    - Slot 3: 06:40 – 07:00
    - Slot 4: 07:00 – 07:20
    - Slot 5: 07:20 – 07:40
    - Slot 6: 07:40 – 08:00
    - Total duration: 120 minutes (2 hours). Start: 06:00, Finish: 08:00.
  - Handled by `markBookableStarts()` and `findConsecutiveAvailableSlots()` in `src/lib/appointment-slots.ts`.

### 4.2 Linked Dropdowns UI Implementation
In `BookingWizard.tsx`, replace the flat button list with two linked selectors:
1. **Dropdown 1: Select Hour**
   - Populated from distinct hours among slots where `canStartBooking === true` on the selected date.
   - Format: "6 AM", "7 AM", "12 PM", "1 PM" (English) / "सुबह 6 बजे", "सुबह 7 बजे" (Hindi).
2. **Dropdown 2: Select Exact Starting Time**
   - Filtered by the selected hour.
   - Displays starting time and finish time:
     `06:00 (Finishes at 08:00 · 6 cylinders, 120 mins)`
   - Single-tap date selection in Step 1: Clicking an available date immediately advances to Step 2 without requiring a secondary "Continue" button.

### 4.3 Concurrency & Database Consistency
The platform employs 5 defensive layers against race conditions and double bookings:
```
[Layer 1: Client] UI filters slots by canStartBooking (cylinderCount consecutive run)
       │
[Layer 2: App Query] booking-engine verifies candidate run via findConsecutiveAvailableSlots
       │
[Layer 3: Transaction] db.batch([ ... ]) executes all statements in a single SQLite transaction
       │
[Layer 4: DB Unique Constraint] booking_slot_allocations.slot_snapshot_id UNIQUE
       │  (Fails immediately if another transaction allocated any unit in the run)
       ▼
[Layer 5: Trigger Guard] bookings_capacity_guard BEFORE INSERT ON bookings
          (Aborts if slot closed, non-consecutive, or duration mismatch)
```
- **Active Capacity States**:
  `HELD`, `PENDING_VERIFICATION`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.
- **Released States**:
  `CANCELLED`, `EXPIRED`, `REJECTED`.
- **Hold Expiry**:
  Triggered via scheduled cron (`expireDueHolds` in `src/lib/booking-engine.ts`), strictly targeting `reservation_state = 'HELD' AND payment_state = 'ADVANCE_PENDING' AND hold_expires_at <= now`.
  Evidence-submitted bookings (`PENDING_VERIFICATION` + `EVIDENCE_SUBMITTED`) are protected and never auto-released.

---

## 5. Topic 4: Vehicle Registration Number Validation & Normalization

### 5.1 Format Rules
Indian vehicle registrations follow two primary legal patterns:
1. **Standard State / Union Territory Series** (CMVR 1989 Rule 50):
   - Format: `[State 2 Letters][RTO 1-2 Digits][Series 0-3 Letters][Number 1-4 Digits]`
   - Normalized Regex: `^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$`
   - Valid Examples: `DL01AB1234`, `HR26DQ5555`, `MH121234`, `UP16Z9999`, `KA05M9`, `DL1C1234`.
2. **Bharat Series (BH Series)** (MoRTH 2021 Notification):
   - Format: `[Year 2 Digits] BH [Number 4 Digits] [Series 1-2 Letters]`
   - Normalized Regex: `^\d{2}BH\d{4}[A-Z]{1,2}$`
   - Valid Examples: `22BH1234AA`, `21BH9999A`, `24BH0001Z`.

### 5.2 Normalization & Storage
- Current implementation in `src/lib/utils.ts` line 28:
  `return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');` (preserves hyphens).
- **Corrected Normalization**:
  Strip all whitespace, hyphens, and non-alphanumeric characters:
  ```ts
  export function normalizeVehicleRegistration(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  ```
  `DL 01 AB 1234`, `dl-01-ab-1234`, and `DL01AB1234` all normalize to `DL01AB1234`.
- **Validation Helper**:
  ```ts
  export const STATE_SERIES_REGEX = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/;
  export const BH_SERIES_REGEX = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

  export function isValidVehicleRegistration(value: string): boolean {
    const normalized = normalizeVehicleRegistration(value);
    return STATE_SERIES_REGEX.test(normalized) || BH_SERIES_REGEX.test(normalized);
  }
  ```
- **Parity Across Workflows**:
  - `src/lib/schemas.ts` (`createHoldSchema`): Apply `isValidVehicleRegistration`.
  - `src/components/booking/BookingWizard.tsx`: Real-time validation message below input.
  - `src/components/admin/ReceptionDashboard.tsx`: Validation on manual booking submission.
  - `src/pages/api/admin/manual-bookings.ts`: Server-side schema validation.
  - `src/pages/api/admin/register.ts` and `RegisterConsole.tsx`: Cylinder register validation.

---

## 6. Topic 5: Schema Changes, Migration Strategy & Files to Modify

### 6.1 Safe Forward Migration: `migrations/0006_advance_pricing.sql`
```sql
-- Migration 0006: Temporary flat advance and vehicle registration normalization

-- 1. Populate default ₹500 (50,000 paise) flat advance for public options 1 to 6
-- only where the owner has not already configured an advance amount.
UPDATE vehicle_categories
SET advance_paise = 50000,
    updated_at = datetime('now')
WHERE code IN ('CYL_01', 'CYL_02', 'CYL_03', 'CYL_04', 'CYL_05', 'CYL_06')
  AND advance_paise IS NULL;

-- 2. Strip any legacy hyphens in normalized vehicle registrations
UPDATE vehicles
SET registration_normalized = replace(registration_normalized, '-', '')
WHERE registration_normalized LIKE '%-%';

-- 3. Update database trigger to enforce public web cylinder limit (1 to 6)
DROP TRIGGER IF EXISTS bookings_capacity_guard;
CREATE TRIGGER bookings_capacity_guard
BEFORE INSERT ON bookings
FOR EACH ROW
WHEN NEW.reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
BEGIN
  SELECT RAISE(ABORT, 'CYLINDER_COUNT_OUT_OF_RANGE')
  WHERE NEW.cylinder_count_snapshot < 1 OR NEW.cylinder_count_snapshot > 20;

  SELECT RAISE(ABORT, 'PUBLIC_CYLINDER_LIMIT_EXCEEDED')
  WHERE NEW.source = 'WEB' AND NEW.cylinder_count_snapshot > 6;

  SELECT RAISE(ABORT, 'SLOT_CLOSED_OR_PRIVATE')
  WHERE NOT EXISTS (
    SELECT 1
    FROM daily_slot_snapshots dss
    WHERE dss.id = NEW.slot_snapshot_id
      AND dss.service_date = NEW.service_date
      AND dss.config_version = NEW.config_version_snapshot
      AND dss.start_time = NEW.slot_start_snapshot
      AND dss.is_closed = 0
      AND (NEW.source <> 'WEB' OR dss.is_public = 1)
  );

  SELECT RAISE(ABORT, 'CONSECUTIVE_CAPACITY_EXCEEDED')
  WHERE (
    SELECT COUNT(*)
    FROM daily_slot_snapshots dss
    WHERE dss.service_date = NEW.service_date
      AND dss.config_version = NEW.config_version_snapshot
      AND dss.is_closed = 0
      AND dss.start_time >= NEW.slot_start_snapshot
      AND dss.end_time <= NEW.slot_end_snapshot
      AND (NEW.source <> 'WEB' OR dss.is_public = 1)
      AND NOT EXISTS (
        SELECT 1
        FROM booking_slot_allocations allocation
        WHERE allocation.slot_snapshot_id = dss.id
      )
  ) <> NEW.cylinder_count_snapshot
  OR (
    SELECT strftime('%s', '2000-01-01 ' || NEW.slot_end_snapshot)
      - strftime('%s', '2000-01-01 ' || NEW.slot_start_snapshot)
  ) <> NEW.cylinder_count_snapshot * (
    SELECT interval_minutes
    FROM daily_slot_snapshots
    WHERE id = NEW.slot_snapshot_id
  ) * 60;
END;
```

### 6.2 Exact Files to Modify in Phase B

| File | Nature of Change |
|---|---|
| `migrations/0006_advance_pricing.sql` | **New file**: Seeds ₹500 advance for categories 1–6, strips legacy hyphens, hardens trigger with public 6-cylinder limit. |
| `src/lib/utils.ts` | Update `normalizeVehicleRegistration` to strip hyphens; add `isValidVehicleRegistration`. |
| `src/lib/schemas.ts` | Refine `createHoldSchema` to validate vehicle registration using `isValidVehicleRegistration`. |
| `src/lib/booking-engine.ts` | Enforce payment gate in `createHold` (throw before D1 write if UPI VPA/payee missing for WEB); enforce `cylinderCount <= 6` for WEB; validate vehicle registration. |
| `src/pages/api/booking/create-hold.ts` | Gate hold creation when payment instructions are unusable, returning clear phone/WhatsApp guidance. |
| `src/pages/api/public/availability.ts` | Constrain `cylinderCount` schema parameter to `min(1).max(6)`. |
| `src/pages/api/public/vehicle-categories.ts` | Filter to return only active categories with `cylinderCount <= 6`. |
| `src/pages/api/admin/categories.ts` | Allow `RECEPTIONIST` role for GET requests so reception desk can access all 1–12 cylinder categories. |
| `src/pages/api/admin/manual-bookings.ts` | Validate vehicle registration against `isValidVehicleRegistration`. |
| `src/pages/api/admin/register.ts` | Validate vehicle registration against `isValidVehicleRegistration`. |
| `src/pages/api/status/[bookingCode].ts` | Include pricing snapshots (`basePricePaise`, `gstAmountPaise`, `totalPricePaise`, `advancePaise`, `balancePaise`, `amountPaidPaise`) in JSON response. |
| `src/components/booking/BookingWizard.tsx` | Single-tap date progression; Truck preselects 4 cylinders; 1–6 + "More than 6" dropdown; linked Hour & Exact Time dropdowns with finish time display; Indian registration validation; payment gate alert. |
| `src/components/admin/ReceptionDashboard.tsx` | Fetch categories from `/api/admin/categories`; apply Indian registration validation. |
| `src/components/admin/RegisterConsole.tsx` | Apply Indian registration validation. |
| `src/pages/en/status/index.astro` & `hi/status/index.astro` | Display price, GST, advance, and balance snapshots. |
| `tests/booking-business-logic.test.ts` | **New test suite**: Verify ₹500 advance, payment gate rejection, public 6-cylinder tampering rejection, registration regex cases, and linked slot finish times. |
