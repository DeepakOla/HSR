# Dispatch: Explorer M2-1 (Database Migration & Schema)

- Task: Investigate existing D1 migrations (`migrations/`), database schema, `business_settings` table, `staff_users` table, and how migrations are run in local/preview environments.
- Objective: Formulate exact specifications for forward-only migration `migrations/0006_flat_advance.sql` adding `flat_advance_paise`, default name HSR, Rewari, phone +919910055355, and owner user `kumardeepakola@gmail.com`. Check how test harness seeds DB in `tests/helpers/test-harness.ts`.
- Files to read:
  - `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
  - `C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md`
  - Existing migrations in `migrations/`
  - `tests/helpers/test-harness.ts`
- Write report to: `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1\handoff.md`


## 2026-11-13T06:16:12Z
Sender: 423f96b4-d134-4c92-9308-9dcadcc0a1a3
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are Explorer M2-1 (Database Migration & Schema).
Working Directory: c:\Users\HP\Downloads\HSR CNG
State Folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1

MANDATORY FIRST STEP:
Read c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md in full before starting work.

Also read:
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- C:\Users\HP\.gemini\antigravity\brain\62898b4b-62e3-434b-aa7b-d9685ecb2d7e\hsr-implementation-plan.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1\DISPATCH.md
- Existing migrations in `migrations/`
- Test database seeding in `tests/helpers/test-harness.ts`

TASK:
Investigate D1 schema and migrations for Milestone M2:
1. Examine existing migrations (0001 through 0005) to understand how `business_settings`, `staff_users`, and other tables are defined.
2. Design forward-only migration `migrations/0006_flat_advance.sql`:
   - Add column `flat_advance_paise INTEGER NOT NULL DEFAULT 50000` to `business_settings`.
   - Update default `business_name_en = 'HSR'`, `business_name_hi = 'एचएसआर'` where unset or `SETUP_REQUIRED`.
   - Update default `city = 'Rewari'` where unset or `SETUP_REQUIRED`.
   - Update default `contact_phone = '+919910055355'`, `whatsapp_number = '+919910055355'` where unset or `SETUP_REQUIRED`.
   - Ensure `kumardeepakola@gmail.com` exists in `staff_users` with role `'OWNER'` and `is_active = 1`.
3. Check how `tests/helpers/test-harness.ts` seeds the test database. Does the test harness need updating to include `flat_advance_paise` and default settings so that all tests pass seamlessly?
4. Document any schema types in TypeScript (e.g. `src/lib/types.ts` or similar) that represent `business_settings`.

DO NOT modify any source code files. You are an Explorer; produce a comprehensive handoff report at:
`c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1\handoff.md`

Send a completion message back to the caller when done.


## 2026-11-13T06:27:11Z
Sender: 423f96b4-d134-4c92-9308-9dcadcc0a1a3
Priority: MESSAGE_PRIORITY_HIGH
Content:
**Context**: Milestone M2-1 Database Migration & Schema Investigation
**Content**: Please check your typecheck results, wrap up your analysis, write your handoff report to `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m2_1\handoff.md`, and notify me.
**Action**: Conclude investigation and write handoff.md.
