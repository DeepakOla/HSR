# Handoff Report: Pricing Engine & Calculations (Milestone M2)

**Agent**: Explorer M2-2 (Pricing Logic Explorer)  
**Date**: 2026-11-13T06:25:00Z  
**Status**: COMPLETE (Hard Handoff)  
**Recipient**: Orchestrator / Worker M2  

---

## 1. Observation

### 1.1 Existing Pricing Implementation (`src/lib/pricing.ts`)
Inspection of `src/lib/pricing.ts` (lines 1–23) reveals:
```typescript
export const FIXED_GST_RATE_BPS = 1800;

export interface ServicePrice {
  basePricePaise: number;
  gstRateBps: typeof FIXED_GST_RATE_BPS;
  gstAmountPaise: number;
  totalPricePaise: number;
}

/** Apply the fixed 18% GST rate to the owner-configured base service price. */
export function calculateServicePrice(basePricePaise: number): ServicePrice {
  if (!Number.isSafeInteger(basePricePaise) || basePricePaise < 0) {
    throw new RangeError('Base service price must be a non-negative integer number of paise');
  }

  const gstAmountPaise = Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10_000);
  return {
    basePricePaise,
    gstRateBps: FIXED_GST_RATE_BPS,
    gstAmountPaise,
    totalPricePaise: basePricePaise + gstAmountPaise,
  };
}
```

Direct observations:
1. `calculateServicePrice` calculates only base price, 18% GST, and total payable amount.
2. It has **no parameter or logic for booking advance** (`flatAdvancePaise` / `advancePaise`).
3. It has **no calculation for remaining balance** (`balancePaise`).
4. Validation only guards against `!Number.isSafeInteger(basePricePaise) || basePricePaise < 0`.

### 1.2 Existing Pricing Tests (`tests/pricing.test.ts`)
Inspection of `tests/pricing.test.ts` (lines 1–35) reveals:
- 11 unit tests across 3 `it` blocks:
  1. `it.each` testing default pricing for 9 cylinder counts: 1, 2, 3, 4, 5, 6, 8, 10, 12.
     - **Omitted cylinder counts**: 7, 9, 11 are not in the test array.
  2. One test verifying that discounting one cylinder count does not alter another.
  3. One test verifying `RangeError` on invalid base prices (`-1`, `1.5`).
- **Zero tests** exist for booking advances, flat ₹500 advance, or balance calculation.

### 1.3 Baseline Test Suite Execution
Execution of `npm run test` (vitest v4.1.12):
```
 ✓ tests/vehicle-registration.test.ts (73 tests)
 ✓ tests/security.test.ts (6 tests)
 ✓ tests/appointment-slots.test.ts (10 tests)
 ✓ tests/schedule.test.ts (3 tests)
 ✓ tests/helpers/test-harness.test.ts (24 tests)
 ✓ tests/pricing.test.ts (11 tests)
 ✓ tests/expiry.test.ts (5 tests)
 ✓ tests/routes.test.ts (1 test)
 ✓ tests/utils.test.ts (3 tests)

 Test Files  9 passed (9)
      Tests  136 passed (136)
```
All 136 baseline tests pass.

### 1.4 Database Schema & Seed State Observations
1. **`migrations/0001_init.sql`**:
   - `business_settings` (lines 8–29): contains business identity, hours, VPA details, but **lacks `flat_advance_paise`**.
   - `vehicle_categories` (lines 51–63): defines columns `base_price_paise`, `gst_rate_bps`, `advance_paise` (nullable).
   - `bookings` (lines 141–174): stores immutable snapshot pricing columns:
     - `base_price_paise_snapshot INTEGER NOT NULL`
     - `gst_rate_bps_snapshot INTEGER NOT NULL`
     - `gst_amount_paise_snapshot INTEGER NOT NULL`
     - `total_price_paise_snapshot INTEGER NOT NULL`
     - `amount_paid_paise INTEGER NOT NULL DEFAULT 0` (via `0003_amount_paid.sql`)
     - `advance_paise_snapshot INTEGER`
     - `balance_paise_snapshot INTEGER`
2. **`migrations/0005_cylinder_work_units.sql`**:
   - Lines 58–77 seeded vehicle categories `CYL_01` to `CYL_12` with:
     ```sql
     base_price_paise = 250000 * n,
     gst_rate_bps = 1800,
     advance_paise = NULL
     ```
   - Because `advance_paise` was seeded as `NULL`, `BookingWizard.tsx` (lines 308, 363) currently treats online booking as disabled unless manually configured.
3. **`migrations/0006_flat_advance.sql` (Planned for M2)**:
   - Forward migration to add `flat_advance_paise INTEGER NOT NULL DEFAULT 50000` to `business_settings`.

### 1.5 Call Sites and Fragmented Balance Calculations
- **`src/lib/booking-engine.ts`** (lines 260–268):
  ```typescript
  const price = calculateServicePrice(categoryRow.basePricePaise);
  const gstAmountPaise = price.gstAmountPaise;
  const totalPricePaise = price.totalPricePaise;
  const advancePaise = categoryRow.advancePaise;
  const amountPaidPaise = input.paymentCollected ? totalPricePaise : 0;
  const balancePaise = input.reservationState === 'CONFIRMED'
    ? input.paymentCollected ? 0 : totalPricePaise
    : advancePaise == null ? null : totalPricePaise - advancePaise;
  ```
- **`src/components/booking/BookingWizard.tsx`** (line 307):
  ```tsx
  {category.advancePaise != null && <p>{labels.balance}: {inr(category.totalPaise - category.advancePaise)}</p>}
  ```
- **`src/pages/api/admin/categories.ts`** (lines 25–29):
  ```typescript
  const gst = Math.round((item.basePricePaise * item.gstRateBps) / 10_000);
  const total = item.basePricePaise + gst;
  if (item.advancePaise !== null && item.advancePaise > total) {
    context.addIssue({ code: 'custom', path: ['categories', index, 'advancePaise'], message: 'Advance cannot exceed the total price' });
  }
  ```

---

## 2. Logic Chain

1. **Fragmentation & Invariant Vulnerability**:
   - Observation 1.1 and 1.5 show that balance arithmetic (`total - advance`) is currently duplicated in `booking-engine.ts`, `BookingWizard.tsx`, and `categories.ts`.
   - AGENTS.md establishes: *"Preserve snapshot pricing, slot labels, capacity and config version on each booking"* and *"Never trust role or pricing from browser"*.
   - Without a centralized `calculateBookingPrice` function, balance calculations risk drifting or allowing edge-case arithmetic anomalies (e.g. negative balances or NaN).

2. **Milestone M2 Business Specification**:
   - Original Request Section 5.1 & Follow-up confirmed decisions:
     - Base service charge: ₹2,500/cylinder (250,000 paise).
     - GST: 18% (45,000 paise per cylinder).
     - Total per cylinder: ₹2,950 (295,000 paise).
     - Temporary advance: **Flat ₹500 (50,000 paise) per booking**, regardless of cylinder count for online self-service (1–6 cylinders). Stored in `business_settings.flat_advance_paise = 50000` as the single source of truth.
     - Remaining balance = Total payable minus advance.
     - The customer must see the exact same base, GST, total, advance, and balance across cylinder selection, booking confirmation, and post-booking status.

3. **Mathematical Invariant**:
   For any cylinder count $N \in [1, 12]$ and base service price $B = 250,000 \times N$:
   - $\text{Base} = B$
   - $\text{GST} = \text{round}\left(\frac{B \times 1800}{10000}\right) = 45,000 \times N$
   - $\text{Total} = B + \text{GST} = 295,000 \times N$
   - $\text{Advance} = A = 50,000$ (default flat advance)
   - $\text{Balance} = \text{Total} - A = (295,000 \times N) - 50,000$
   - Invariant: $\text{Advance} + \text{Balance} \equiv \text{Total}$.

4. **Interface and Function Specification**:
   To satisfy single source of truth and backward compatibility:
   ```typescript
   export interface BookingPriceBreakdown extends ServicePrice {
     advancePaise: number;
     balancePaise: number;
   }

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
   *Validation rationale*:
   - Passing `flatAdvancePaise < 0` throws `RangeError`.
   - Passing non-integer `flatAdvancePaise` (e.g. `500.5`) throws `RangeError`.
   - Passing `flatAdvancePaise > price.totalPricePaise` throws `RangeError('Advance amount cannot exceed the total price')`. This strictly aligns with `src/pages/api/admin/categories.ts:28` where advance exceeding total is disallowed.
   - For defense in depth against rounding or edge arithmetic, `balancePaise` is strictly non-negative.
   - When `flatAdvancePaise === 0` (e.g. counter walk-in or advance not required), `advancePaise = 0` and `balancePaise = totalPricePaise`.

5. **Test Matrix Design**:
   The test matrix in `tests/pricing.test.ts` must comprehensively cover:
   - Full 1–12 cylinder counts under default pricing (₹2,500/cyl, 18% GST, ₹500 advance).
   - Zero advance (`flatAdvancePaise = 0`).
   - Full advance (`flatAdvancePaise = totalPricePaise`).
   - Custom owner-discounted base prices with flat advance.
   - All validation boundary conditions: negative base, fractional base, negative advance, fractional advance, advance exceeding total, non-finite values.
   - Structural compatibility: `calculateBookingPrice` output must contain all properties of `calculateServicePrice` with identical values.

---

## 3. Caveats

1. **Receptionist Bookings (7–12 Cylinders)**:
   - Online public self-service is restricted to 1–6 cylinders (`source === 'WEB'`).
   - Reception staff can book 1–12 cylinders (`source IN ('PHONE', 'WHATSAPP', 'WALKIN')`).
   - The pricing function `calculateBookingPrice` itself is agnostic to booking channel and safely handles all cylinder counts (1–12+).
2. **GST Rate Invariant**:
   - `FIXED_GST_RATE_BPS = 1800` (18%) is an agent and business invariant. It must not be altered without explicit owner instructions and regulatory verification.
3. **Pre-Write Payment Gate Dependency**:
   - `calculateBookingPrice` calculates prices and advances in memory.
   - However, in `src/pages/api/booking/create-hold.ts`, hold creation must also enforce the **pre-write payment gate**: if merchant UPI VPA (`vpa_id`) or payee (`vpa_payee_name`) is empty or `SETUP_REQUIRED`, online booking must fail-closed before any D1 write, routing to phone/WhatsApp (+91 9910055355).

---

## 4. Conclusion & Actionable Specifications

### 4.1 Interface Specification for `src/lib/pricing.ts`

```typescript
export const FIXED_GST_RATE_BPS = 1800;

export interface ServicePrice {
  basePricePaise: number;
  gstRateBps: typeof FIXED_GST_RATE_BPS;
  gstAmountPaise: number;
  totalPricePaise: number;
}

export interface BookingPriceBreakdown extends ServicePrice {
  advancePaise: number;
  balancePaise: number;
}

/** Apply the fixed 18% GST rate to the owner-configured base service price. */
export function calculateServicePrice(basePricePaise: number): ServicePrice {
  if (!Number.isSafeInteger(basePricePaise) || basePricePaise < 0) {
    throw new RangeError('Base service price must be a non-negative integer number of paise');
  }

  const gstAmountPaise = Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10_000);
  return {
    basePricePaise,
    gstRateBps: FIXED_GST_RATE_BPS,
    gstAmountPaise,
    totalPricePaise: basePricePaise + gstAmountPaise,
  };
}

/**
 * Single source of truth for booking price, advance deposit, and balance calculations.
 * Applies 18% GST to base price and subtracts flat advance to determine remaining balance.
 */
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

### 4.2 Comprehensive Test Matrix for `tests/pricing.test.ts`

The following test suites must be added to `tests/pricing.test.ts`:

```typescript
describe('HSR booking price calculations with flat advance', () => {
  const DEFAULT_FLAT_ADVANCE_PAISE = 50000; // ₹500

  // 1. Default commercial matrix for all 1 to 12 cylinders
  it.each([
    // [cylinders, basePaise, gstPaise, totalPaise, advancePaise, balancePaise]
    [1,  250000,  45000,  295000, 50000,  245000], // ₹2,500 base + ₹450 GST = ₹2,950 total, ₹500 adv, ₹2,450 bal
    [2,  500000,  90000,  590000, 50000,  540000], // ₹5,000 base + ₹900 GST = ₹5,900 total, ₹500 adv, ₹5,400 bal
    [3,  750000, 135000,  885000, 50000,  835000], // ₹7,500 base + ₹1,350 GST = ₹8,850 total, ₹500 adv, ₹8,350 bal
    [4, 1000000, 180000, 1180000, 50000, 1130000], // ₹10,000 base + ₹1,800 GST = ₹11,800 total, ₹500 adv, ₹11,300 bal
    [5, 1250000, 225000, 1475000, 50000, 1425000], // ₹12,500 base + ₹2,250 GST = ₹14,750 total, ₹500 adv, ₹14,250 bal
    [6, 1500000, 270000, 1770000, 50000, 1720000], // ₹15,000 base + ₹2,700 GST = ₹17,700 total, ₹500 adv, ₹17,200 bal
    [7, 1750000, 315000, 2065000, 50000, 2015000], // ₹17,500 base + ₹3,150 GST = ₹20,650 total, ₹500 adv, ₹20,150 bal
    [8, 2000000, 360000, 2360000, 50000, 2310000], // ₹20,000 base + ₹3,600 GST = ₹23,600 total, ₹500 adv, ₹23,100 bal
    [9, 2250000, 405000, 2655000, 50000, 2605000], // ₹22,500 base + ₹4,050 GST = ₹26,550 total, ₹500 adv, ₹26,050 bal
    [10, 2500000, 450000, 2950000, 50000, 2900000], // ₹25,000 base + ₹4,500 GST = ₹29,500 total, ₹500 adv, ₹29,000 bal
    [11, 2750000, 495000, 3245000, 50000, 3195000], // ₹27,500 base + ₹4,950 GST = ₹32,450 total, ₹500 adv, ₹31,950 bal
    [12, 3000000, 540000, 3540000, 50000, 3490000], // ₹30,000 base + ₹5,400 GST = ₹35,400 total, ₹500 adv, ₹34,900 bal
  ])(
    'calculates correct breakdown for %i cylinder(s) with ₹500 flat advance',
    (_cylinders, base, gst, total, advance, balance) => {
      const breakdown = calculateBookingPrice(base, advance);
      expect(breakdown).toEqual({
        basePricePaise: base,
        gstRateBps: 1800,
        gstAmountPaise: gst,
        totalPricePaise: total,
        advancePaise: advance,
        balancePaise: balance,
      });
      // Invariant: advance + balance === total
      expect(breakdown.advancePaise + breakdown.balancePaise).toBe(breakdown.totalPricePaise);
    }
  );

  // 2. Boundary case: Zero advance
  it('correctly handles zero advance (full balance payable at counter)', () => {
    const breakdown = calculateBookingPrice(250000, 0);
    expect(breakdown.advancePaise).toBe(0);
    expect(breakdown.balancePaise).toBe(295000);
    expect(breakdown.totalPricePaise).toBe(295000);
  });

  // 3. Boundary case: Full advance
  it('correctly handles full advance equal to total price (zero balance)', () => {
    const total = 295000;
    const breakdown = calculateBookingPrice(250000, total);
    expect(breakdown.advancePaise).toBe(total);
    expect(breakdown.balancePaise).toBe(0);
  });

  // 4. Custom owner-configured base price & advance
  it('calculates custom discounted base price with owner-configured advance', () => {
    // Discounted 2-cylinder price: ₹4,500 base + 18% GST (₹810) = ₹5,310 total
    // Owner sets ₹1,000 advance -> Balance = ₹4,310
    const breakdown = calculateBookingPrice(450000, 100000);
    expect(breakdown.totalPricePaise).toBe(531000);
    expect(breakdown.advancePaise).toBe(100000);
    expect(breakdown.balancePaise).toBe(431000);
  });

  // 5. Compatibility with calculateServicePrice
  it('retains exact equivalence with calculateServicePrice for service price fields', () => {
    const servicePrice = calculateServicePrice(1000000);
    const bookingPrice = calculateBookingPrice(1000000, 50000);
    expect(bookingPrice.basePricePaise).toBe(servicePrice.basePricePaise);
    expect(bookingPrice.gstRateBps).toBe(servicePrice.gstRateBps);
    expect(bookingPrice.gstAmountPaise).toBe(servicePrice.gstAmountPaise);
    expect(bookingPrice.totalPricePaise).toBe(servicePrice.totalPricePaise);
  });

  // 6. Validation and Error Handling
  it('rejects invalid advance amounts', () => {
    expect(() => calculateBookingPrice(250000, -1)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, -50000)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, 50000.5)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, NaN)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000, Infinity)).toThrow(RangeError);
  });

  it('rejects advance amount exceeding total price', () => {
    // Total for 1 cylinder is 295000 paise (₹2,950). Advance of 300000 paise (₹3,000) must throw.
    expect(() => calculateBookingPrice(250000, 300000)).toThrow(RangeError);
  });

  it('rejects invalid base price when called via calculateBookingPrice', () => {
    expect(() => calculateBookingPrice(-250000, 50000)).toThrow(RangeError);
    expect(() => calculateBookingPrice(250000.75, 50000)).toThrow(RangeError);
  });
});
```

### 4.3 Complete Codebase Pricing Call Sites Inventory

| # | File Path | Lines | Current Usage | Required M2 Change |
|---|-----------|-------|---------------|-------------------|
| 1 | `src/lib/pricing.ts` | 1–23 | Contains `calculateServicePrice` & `ServicePrice` | Add `BookingPriceBreakdown` and `calculateBookingPrice` |
| 2 | `src/lib/types.ts` | 1–20, 40–50 | `BusinessSettings`, `VehicleCategory` | Add `flat_advance_paise: number;` to `BusinessSettings`; re-export `BookingPriceBreakdown` |
| 3 | `src/lib/booking-engine.ts` | 7, 75–115 | `fetchVehicleCategories` returns `advancePaise: row.advancePaise` (which is NULL) | Join/read `business_settings.flat_advance_paise` and return `row.advancePaise ?? settings.flat_advance_paise` |
| 4 | `src/lib/booking-engine.ts` | 260–268 | Ad-hoc calculation of `gstAmountPaise`, `totalPricePaise`, and `balancePaise` | Use `calculateBookingPrice(categoryRow.basePricePaise, flatAdvancePaise)` for single source of truth |
| 5 | `src/lib/booking-engine.ts` | 326–334 | `responseSnapshot.pricing` | Return `calculateBookingPrice` breakdown object |
| 6 | `src/lib/booking-engine.ts` | 356–370 | `INSERT INTO bookings(...)` snapshot fields | Populate `base_price_paise_snapshot`, `gst_amount_paise_snapshot`, `total_price_paise_snapshot`, `advance_paise_snapshot`, `balance_paise_snapshot` from breakdown |
| 7 | `src/pages/api/booking/create-hold.ts` | 27–45 | Hold creation & QR generation | Enforce pre-write payment gating (`vpa_id` / `payeeName` configured); reject `source === 'WEB' && cylinderCount > 6` with HTTP 400 |
| 8 | `src/components/booking/BookingWizard.tsx` | 303–308, 357–363, 378–382 | Frontend display of price, GST, total, advance, balance | Use single breakdown: Base, 18% GST, Total, ₹500 Advance, Balance |
| 9 | `src/pages/api/admin/categories.ts` | 23–30, 60–85 | Validates `advancePaise <= total` and updates category pricing | Retain validation; ensure parity with `calculateBookingPrice` constraints |
| 10 | `src/pages/api/admin/manual-bookings.ts` | 48–54 | Receptionist manual booking API | Returns `totalPricePaise`, `amountPaidPaise`, `balancePaise` from engine |
| 11 | `src/pages/api/admin/bookings.ts` | 31–34, 113 | Admin booking list query and `amount_paid_paise` updates | Displays snapshot balance and advances correctly |
| 12 | `src/pages/api/admin/exports/bookings.csv.ts` | 24–25, 39 | CSV export of booking data | Exports snapshot pricing, advance, and balance |
| 13 | `src/components/admin/OwnerSettings.tsx` | 182–184 | Category base price & advance editor | Add `flat_advance_paise` editor for single source of truth |
| 14 | `tests/pricing.test.ts` | 1–35 | 11 unit tests for `calculateServicePrice` | Expand with comprehensive test matrix for `calculateBookingPrice` and 1–12 cylinder coverage |
| 15 | `migrations/0006_flat_advance.sql` | [NEW] | Does not exist | Add `flat_advance_paise INTEGER NOT NULL DEFAULT 50000` to `business_settings` |

---

## 5. Verification Method

To independently verify the pricing engine specifications:

1. **Unit Testing**:
   Run the project test suite:
   ```powershell
   npm run test
   ```
   *Expected outcome after implementer adds code*: All existing 136 tests pass, plus all new `calculateBookingPrice` matrix tests pass with zero failures.

2. **Type Checking**:
   Run Astro & TypeScript diagnostics:
   ```powershell
   npm run typecheck
   ```
   *Expected outcome*: Zero diagnostics errors across `.ts` and `.astro` files.

3. **Production Build**:
   Verify bundle compilation:
   ```powershell
   npm run build
   ```
   *Expected outcome*: Clean build output with no import errors.

4. **Invalidation Conditions**:
   The logic formulated herein is invalidated if:
   - Advance calculation is performed per-cylinder instead of flat ₹500 per booking.
   - Advance amount is allowed to be negative or non-integer.
   - Advance amount is allowed to exceed total price without throwing `RangeError`.
   - `advancePaise + balancePaise !== totalPricePaise`.
   - Historical bookings have their snapshot pricing mutated when Owner changes category prices.
