# BRIEFING — 2026-11-13T06:24:00Z

## Mission
Investigate pricing engine for Milestone M2: evaluate `src/lib/pricing.ts`, formulate `calculateBookingPrice` interface and logic (₹500 flat advance per booking, balance calculation), test matrix for 1-12 cylinders, and locate all pricing call sites.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, synthesis, pricing logic investigator
- Working directory: c:\Users\HP\Downloads\HSR CNG
- State folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2
- Original parent: 423f96b4-d134-4c92-9308-9dcadcc0a1a3
- Milestone: Milestone M2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do not modify source code files
- Preserve agent invariants (snapshot pricing, slot labels, capacity, etc.)
- Use files for reports/handoffs, messages for coordination

## Current Parent
- Conversation ID: 423f96b4-d134-4c92-9308-9dcadcc0a1a3
- Updated: 2026-11-13T06:24:00Z

## Investigation State
- **Explored paths**:
  - `src/lib/pricing.ts`, `tests/pricing.test.ts`, `src/lib/types.ts`
  - `src/lib/booking-engine.ts`, `src/pages/api/booking/create-hold.ts`
  - `src/pages/api/admin/categories.ts`, `src/pages/api/admin/bookings.ts`, `src/pages/api/admin/manual-bookings.ts`
  - `src/components/booking/BookingWizard.tsx`, `src/components/admin/OwnerSettings.tsx`
  - `migrations/0001_init.sql`, `migrations/0005_cylinder_work_units.sql`
  - `tests/fixtures/synthetic-data.ts`, `tests/helpers/test-harness.test.ts`
- **Key findings**:
  - `pricing.ts` currently only exposes `calculateServicePrice(basePricePaise)` with 18% GST calculation; no advance or balance calculations exist.
  - In `0005_cylinder_work_units.sql`, vehicle categories `CYL_01` to `CYL_12` were seeded with `advance_paise = NULL`.
  - M2 requirement establishes `business_settings.flat_advance_paise` (default 50000 = ₹500) as single source of truth for online bookings (1-6 cylinders).
  - Snapshot pricing invariants require preserving `base_price_paise_snapshot`, `gst_rate_bps_snapshot`, `gst_amount_paise_snapshot`, `total_price_paise_snapshot`, `advance_paise_snapshot`, `balance_paise_snapshot` on each booking.
  - Pre-write payment gating requires failing closed (HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE`) if UPI VPA/payee is missing or `SETUP_REQUIRED`.
  - Exact specification for `calculateBookingPrice` formulated with strict validation on `flatAdvancePaise` and comprehensive test matrix for 1-12 cylinders.
- **Unexplored areas**: None for M2 pricing scope. All call sites and dependencies identified.

## Key Decisions Made
- Formulated `calculateBookingPrice` to inherit and spread `calculateServicePrice` result, validate non-negative integer advance, ensure advance does not exceed total (or clamp balance to 0), and compute exact balance.
- Formulated full 1-12 cylinder test matrix, edge cases (advance = 0, advance = total, discounted prices), and boundary/error cases.

## Artifact Index
- DISPATCH.md — Received dispatch instructions
- progress.md — Liveness heartbeat
- BRIEFING.md — Persistent working memory
- handoff.md — Final investigation report
