# Dispatch: Explorer M3-2 (Time Selection Logic & Linked Dropdowns)

- Task: Investigate time selection in `src/components/booking/BookingWizard.tsx`, `src/lib/schedule.ts`, and `src/lib/booking-engine.ts`.
- Focus areas:
  1. Replace flat list of appointment times with two linked dropdowns:
     - Dropdown 1: Select Hour (e.g. 6 AM, 7 AM, 8 AM...). Dynamically derived from configured schedule and availability.
     - Dropdown 2: Exact Start Time within selected hour (e.g. 06:00, 06:20, 06:40).
  2. Support dynamic schedule intervals (15-min or 20-min).
  3. Filter start times so they only appear if the full consecutive work-unit run is available for the selected cylinder count (e.g., 6 cylinders at 20-min interval requires 6 consecutive slots = 2 hours).
  4. Display calculated finish time clearly (e.g., “06:00 to 07:20 · 4 cylinders”).
- Mandatory read first:
  - `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
  - `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
  - `src/components/booking/BookingWizard.tsx`
  - `src/lib/schedule.ts`
  - `src/lib/booking-engine.ts`
- Write report to: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m3_2\handoff.md`


## 2026-11-13T07:53:16Z
[Message] timestamp=2026-11-13T07:53:16Z sender=423f96b4-d134-4c92-9308-9dcadcc0a1a3 priority=MESSAGE_PRIORITY_HIGH
TASK:
Investigate and design exact specifications for:
1. Linked Time Dropdowns:
   - Replace flat list with two linked dropdowns:
     - Dropdown 1: Select Hour (e.g. 6 AM, 7 AM, 8 AM...). Dynamically generated from configured schedule and available slots.
     - Dropdown 2: Exact Start Time within selected hour (e.g. 06:00, 06:20, 06:40).
2. Interval compatibility:
   - Handle both 15-minute and 20-minute schedule intervals.
3. Consecutive work-unit availability:
   - Filter start times so they ONLY appear if the entire run of consecutive work units needed for the selected cylinder count is available (e.g., 4 cylinders at 20m = 80 min run).
4. Finish time display:
   - Clearly display expected start and finish time (e.g., "06:00 to 07:20 · 4 cylinders").
5. Bilingual formatting (English & Hindi).
