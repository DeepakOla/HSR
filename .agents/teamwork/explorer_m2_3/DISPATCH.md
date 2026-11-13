# Dispatch: Explorer M2-3 (Booking Hold API & Pre-Write Payment Gate)

- Task: Investigate existing booking hold endpoint in `src/pages/api/booking/create-hold.ts`, booking engine in `src/lib/booking-engine.ts`, capacity guards, and error responses.
- Objective: Formulate exact specifications for:
  1. Pre-write payment gate: check `business_settings` before any D1 write. If `vpa_id` or `vpa_payee_name` missing or `SETUP_REQUIRED`, fail-closed with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` and phone/WhatsApp info (+91 9910055355). Zero D1 writes!
  2. Server-side public cylinder limit: if `source === 'WEB'` and requested `cylinderCount > 6`, reject with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED`.
  3. Integration with `validateVehicleRegistration` from `src/lib/vehicle-registration.ts`.
- Files to read:
  - `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
  - `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
  - `src/pages/api/booking/create-hold.ts`
  - `src/lib/booking-engine.ts`
  - `src/lib/vehicle-registration.ts`
  - `tests/`
- Write report to: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_3\handoff.md`


## 2026-11-13T06:16:33Z
You are Explorer M2-3 (Booking Hold & Payment Gate Explorer).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_3

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_3\DISPATCH.md
- `src/pages/api/booking/create-hold.ts`
- `src/lib/booking-engine.ts`
- `src/lib/vehicle-registration.ts`
- `src/lib/schemas.ts`

TASK:
Investigate booking hold creation, pre-write payment gating, and server-side public cylinder validation:
1. Examine `src/pages/api/booking/create-hold.ts` and `src/lib/booking-engine.ts`:
   - Trace the exact flow of `POST /api/booking/create-hold`.
   - Identify where DB writes occur (e.g. `createHold`, capacity guards).
2. Detail the **Pre-Write Payment Gate**:
   - Before ANY D1 write occurs, query `business_settings`.
   - Check if `vpa_id` or `vpa_payee_name` is null, empty string, or `'SETUP_REQUIRED'`.
   - If missing/unusable, fail-closed immediately with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE`.
   - Return structured error payload with contact details (phone and WhatsApp +91 9910055355) so customer is cleanly routed to phone/WhatsApp booking.
   - Confirm ZERO D1 writes occur when payment setup is incomplete.
3. Detail the **Server-Side Public Cylinder Limit**:
   - Check request `source` or client context.
   - For public web requests (`source === 'WEB'`), if requested `cylinderCount > 6`, reject immediately with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED`.
   - Ensure receptionist/internal routes (`source === 'RECEPTION'`) can still create holds for 1-12 cylinders.
4. Detail the **Vehicle Registration Validation Integration**:
   - Integrate `validateVehicleRegistration` from `src/lib/vehicle-registration.ts`.
   - Validate and normalize registration number on the server before hold creation.
5. Identify all tests needed in `tests/` to verify pre-write payment gating, cylinder limit enforcement, and registration validation in `create-hold.ts`.

DO NOT modify any source code files. You are an Explorer; produce a comprehensive handoff report at:
`c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_3\handoff.md`

Send a completion message back to the caller when done.
