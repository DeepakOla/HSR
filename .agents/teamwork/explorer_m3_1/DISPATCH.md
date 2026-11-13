# Dispatch: Explorer M3-1 (UI/UX, Date & Vehicle Step Overhaul)

- Task: Investigate `src/components/booking/BookingWizard.tsx` and design exact specifications for Step 1 (Date), Step 2 (Vehicle), and Step 3 (Cylinders).
- Focus areas:
  1. Single-tap date progression: Tapping/clicking an available date automatically sets date and advances to Step 2 (`setStep(2)`), removing the redundant Continue button while preserving keyboard accessibility.
  2. Vehicle selection: "Which vehicle do you have?" dropdown with options (Car, Taxi, Tempo, Van, LCV, Truck, Bus, Other) and optional make/model text input.
  3. Truck 4-cylinder preselection: When Truck is selected, automatically set cylinder count to 4 (with clear notice that it is adjustable).
  4. Public 1–6 cylinder dropdown & contact card: Public dropdown shows 1, 2, 3, 4, 5, 6 cylinders, and "More than 6". When "More than 6" is selected, stop online self-service and show a dedicated contact card with phone and WhatsApp (+91 9910055355).
  5. Direction A Industrial UI alignment: Clean industrial typography, high-contrast tokens, accessible touch targets (>=44px).
- Mandatory read first:
  - `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
  - `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
  - `src/components/booking/BookingWizard.tsx`
- Write report to: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_1\handoff.md`


## 2026-11-13T07:53:00Z
You are Explorer M3-1 (UI/UX, Date & Vehicle Step Explorer).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_1

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_1\DISPATCH.md
- `src/components/booking/BookingWizard.tsx`

TASK:
Investigate and design exact specifications for:
1. Single-tap date progression:
   - Tapping/clicking an available date sets `date` and auto-advances to Step 2 (`setStep(2)`).
   - Redundant "Continue" button removed from Step 1.
   - Keyboard accessible (Enter/Space on date button triggers selection and auto-advance).
   - Past/unavailable dates remain non-interactive.
2. Vehicle selection (Step 2):
   - "Which vehicle do you have?" dropdown: Car, Taxi, Tempo, Van, LCV, Truck, Bus, Other.
   - Optional vehicle make/model text input.
   - Truck preselection: Selecting "Truck" sets `cylinderCount` to 4 (with clear notice that it is adjustable).
3. Public 1–6 cylinder dropdown & contact card (Step 3):
   - Dropdown options: 1 cylinder, 2 cylinders, 3 cylinders, 4 cylinders, 5 cylinders, 6 cylinders, More than 6.
   - Selecting "More than 6" stops self-service and displays a contact card directing customer to call or WhatsApp +91 9910055355.
4. Direction A Industrial styling: Clean industrial palette, accessible touch targets (>=44px), bilingual English/Hindi.

DO NOT modify source code files. You are an Explorer; write a comprehensive handoff report to:
`c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_1\handoff.md`
Send completion message to caller when done.