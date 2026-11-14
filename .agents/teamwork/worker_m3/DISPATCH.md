## 2026-11-13T08:07:58Z
You are Worker M3 (Milestone M3 Implementation Worker).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m3

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m3\DISPATCH.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_1\handoff.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_2\handoff.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK:
Implement Milestone M3:
1. Update `src/components/booking/BookingWizard.tsx` incorporating all specifications from Explorers M3-1, M3-2, and M3-3:
   - Step 1: Single-tap date progression (tapping an available date advances immediately to Step 2, Enter/Space supported, redundant Continue button removed, unavailable dates disabled).
   - Step 2: Vehicle selection dropdown (`Car`, `Taxi`, `Tempo`, `Van`, `LCV`, `Truck`, `Bus`, `Other`), optional make/model field, Truck 4-cylinder auto-preselection with prominent callout banner.
   - Step 3: Public 1–6 cylinder dropdown. Selecting "More than 6" stops self-service and renders dedicated Fleet Contact Card with direct phone (`+919910055355`) and WhatsApp links. Transparent 5-row pricing breakdown card for 1–6 cylinders.
   - Step 4: Linked time dropdowns (Hour dropdown first, exact start time second), dynamic 15m/20m schedule support, consecutive work-unit availability filtering, finish time display card (e.g. "06:00 to 07:20 · 4 cylinders (80 minutes)").
   - Step 5: Vehicle registration field with auto-uppercase, client-side validation using `validateVehicleRegistration` on blur and live re-validation on change, inline error messages, and full 5-row pricing breakdown (Base, GST, Total, Advance, Balance).
   - Booking confirmation result: Consistent 5-row pricing breakdown.
   - Direction A Industrial Blue styling and touch targets (>=44px).
2. Create `tests/booking-wizard.test.ts` to test wizard helpers (such as `formatHourOption`, `calculateDurationMinutes`, vehicle options, and cylinder options).
3. Run verification commands:
   - `npm run test`
   - `npm run typecheck`
   - `npm run build`
4. Write handoff report to `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m3\handoff.md` and send completion message to caller.
