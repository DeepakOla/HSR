# Task Assignment for Agent B: Booking and Business Logic Engineer
Assigned under Survey phase.


## 2026-11-12T21:29:45Z
You are Agent B: Booking and Business Logic Engineer (teamwork_explorer).
Your task is a thorough, read-only investigation of the booking engine, availability calculations, pricing, payments, database schema, and concurrency safeguards in HSR Green Energy.
Do NOT modify any application or source code files. Do NOT run destructive git commands.

Working directory: c:\Users\HP\Downloads\HSR CNG
State folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_2

Mandatory reading:
1. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md
2. AGENTS.md (pay close attention to all Booking and capacity, Payment and evidence, and Security invariants)
3. ANTIGRAVITY_START_HERE.md
4. README.md
5. docs/architecture.md
6. docs/deployment.md
7. docs/security.md
8. docs/setup-required.md
9. Inspect schema.sql, migrations/, src/lib/db/, src/lib/booking/, and all related API endpoints under src/pages/api/.

Detailed investigation tasks:
1. Temporary advance amount and pricing logic:
   - Current base price: ₹2,500/cylinder + 18% GST = ₹2,950 total for 1 cylinder.
   - Requirement: flat ₹500 advance per booking (irrespective of cylinder count). Balance = total payable minus ₹500.
   - Configurable in Owner Settings. Check how pricing snapshots and settings are stored in D1.
   - Payment gate: check how hold creation behaves when merchant UPI VPA/payee name are missing. Verify that hold creation is prevented unless payment instructions are usable, directing customer to phone/WhatsApp.
2. Vehicle selection and cylinder limits:
   - Server-side and DB constraints for public 1-6 limit and receptionist 1-12 support.
   - Truck default 4 cylinders logic.
   - Protection against API tampering for >6 cylinders.
3. Time selection and slot availability:
   - How time slots and work units are calculated. Interval flexibility (15 vs 20 min).
   - Continuous work-unit allocation: ensuring N consecutive slots are available before offering a start time, and computing finish time.
   - Concurrency and race condition prevention: atomic DB-guarded writes, active capacity states (HELD, PENDING_VERIFICATION, CONFIRMED, CHECKED_IN, IN_PROGRESS).
4. Vehicle registration number validation:
   - Format rules for ordinary state-series and Bharat Series (BH) registrations.
   - Client-side and server-side validation, normalization (uppercase, stripping separators).
   - Impact on receptionist workflows and cylinder register.
5. Identify required schema changes, forward migrations, and exact files to modify.

Write your comprehensive findings to:
c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_2\analysis.md
Write your handoff report (Observation, Logic Chain, Caveats, Conclusion, Verification) to:
c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_2\handoff.md

When finished, send a message to your caller (conversation ID: 8d667e27-5030-463a-8d49-7a6f7181d0c7) with a concise summary and references to your reports.
