# Dispatch: Explorer M3-3 (Registration Validation, Pricing Breakdown & API Contract)

- Task: Investigate customer details, registration validation, and pricing breakdown in `src/components/booking/BookingWizard.tsx` and connection to API.
- Focus areas:
  1. Vehicle registration field:
     - Automatically convert typed letters to uppercase.
     - Integrate client-side validation using `validateVehicleRegistration(value, locale)` on blur / change.
     - Display localized inline validation message.
  2. Pricing breakdown display:
     - Consistently display:
       - Base Service Price: ₹2,500 × cylinders
       - GST (18%): ₹450 × cylinders
       - Total Amount: ₹2,950 × cylinders
       - Temporary Advance: flat ₹500 (from `business_settings.flat_advance_paise`)
       - Balance: Total - ₹500
     - Bilingual labels (English and Hindi).
  3. API payload alignment:
     - Ensure data submitted to `POST /api/booking/create-hold` satisfies `createHoldSchema` and the updated M2 backend.
- Mandatory read first:
  - `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
  - `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
  - `src/components/booking/BookingWizard.tsx`
  - `src/lib/vehicle-registration.ts`
  - `src/lib/pricing.ts`
  - `src/pages/api/booking/create-hold.ts`
- Write report to: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_3\handoff.md`


## 2026-11-13T07:53:27Z
You are Explorer M3-3 (Registration Validation & Pricing Breakdown Explorer).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_3

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_3\DISPATCH.md
- `src/components/booking/BookingWizard.tsx`
- `src/lib/vehicle-registration.ts`
- `src/lib/pricing.ts`
- `src/pages/api/booking/create-hold.ts`

TASK:
Investigate and design exact specifications for:
1. Vehicle registration field in Step 5:
   - Auto-uppercase entered text.
   - Client-side validation on blur / change using `validateVehicleRegistration(value, locale)`.
   - Display inline validation error message if invalid.
2. Consistent pricing breakdown across all steps:
   - Use `business_settings.flat_advance_paise` (flat ₹500 advance).
   - Display:
     - Base Service Price: ₹2,500 × cylinders
     - GST (18%): ₹450 × cylinders
     - Total Amount: ₹2,950 × cylinders
     - Temporary Advance: ₹500
     - Balance: Total - ₹500
   - Synchronize across Cylinder selection step, Details confirmation step, and Booking confirmation result.
3. API payload alignment:
   - Confirm submitted payload meets `createHoldSchema` requirements and server-side M2 expectations.
4. Bilingual English and Hindi support.

DO NOT modify source code files. You are an Explorer; write a comprehensive handoff report to:
`c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_3\handoff.md`
Send completion message to caller when done.
