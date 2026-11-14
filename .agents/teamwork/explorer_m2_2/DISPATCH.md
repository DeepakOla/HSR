# Dispatch: Explorer M2-2 (Pricing Engine & Calculations)

- Task: Investigate existing pricing logic in `src/lib/pricing.ts`, tests in `tests/pricing.test.ts`, and how pricing is used across booking workflows and API endpoints.
- Objective: Formulate exact specifications for `calculateBookingPrice(basePricePaise, flatAdvancePaise)` returning `advancePaise` and `balancePaise`, ensuring single source of truth for online bookings (1-6 cylinders), and comprehensive test coverage across 1-12 cylinders.
- Files to read:
  - `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
  - `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
  - `src/lib/pricing.ts`
  - `tests/pricing.test.ts`
  - `src/lib/types.ts`
- Write report to: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2\handoff.md`

## 2026-11-13T06:16:21Z
You are Explorer M2-2 (Pricing Logic Explorer).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2\DISPATCH.md
- `src/lib/pricing.ts`
- `tests/pricing.test.ts`
- `src/lib/types.ts`

TASK:
Investigate pricing engine for Milestone M2:
1. Examine `src/lib/pricing.ts` and existing pricing tests in `tests/pricing.test.ts`.
2. Analyze the requirements for flat ₹500 advance per booking (not per cylinder) and balance calculation:
   - Base service charge: ₹2,500/cylinder (250,000 paise).
   - GST: 18% (45,000 paise per cylinder).
   - Total per cylinder: ₹2,950 (295,000 paise).
   - Flat advance: ₹500 (50,000 paise) per booking regardless of cylinder count for online bookings 1-6.
   - Balance = Total payable - advance.
3. Formulate the exact interface and function signature for `calculateBookingPrice(basePricePaise: number, flatAdvancePaise: number)` returning `BookingPriceBreakdown` (with `advancePaise` and `balancePaise`).
4. Design the test matrix to be added to `tests/pricing.test.ts` covering 1 to 12 cylinders, boundary cases (e.g. advance > total, negative or 0 advance), and verify compatibility with existing `calculateServicePrice`.
5. Identify all places in the codebase where pricing functions are called or referenced.

DO NOT modify any source code files. You are an Explorer; produce a comprehensive handoff report at:
`c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_2\handoff.md`

Send a completion message back to the caller when done.
