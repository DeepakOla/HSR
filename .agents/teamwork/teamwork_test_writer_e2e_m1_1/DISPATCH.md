# Dispatch for Test Writer (Milestone E2E-M1)

## Objective
Implement the complete Test Infrastructure & Harness for the HSR Green Energy testing platform:
1. Create `TEST_INFRA.md` at project root documenting test architecture, runner invocations, and 4-tier matrix mapping per the exact specification in Spec Miner 3's report.
2. Create `tests/fixtures/synthetic-data.ts` providing standardized synthetic fixtures for customers, vehicles (State and Bharat series), staff, and payment configurations.
3. Create `tests/helpers/d1-mock.ts` implementing `D1Database` and `D1PreparedStatement` using Node 24 native `node:sqlite` with automated migration loading (`migrations/*.sql`), trigger execution (`bookings_capacity_guard`), and atomic `db.batch()` transaction rollbacks.
4. Create `tests/helpers/jwt-mock.ts` implementing synthetic RS256 keypair generation, assertion signing, and JWKS mock server for testing Cloudflare Access authentication in `src/lib/auth.ts`.
5. Create a verification test file `tests/helpers/test-harness.test.ts` exercising `d1-mock.ts` and `jwt-mock.ts` to verify migrations, triggers, rollbacks, and JWT signing/verification.
6. Run `npm run test` and `npm run typecheck` to verify that everything compiles and passes cleanly.

## Mandatory Reading
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically Section 5.9 Full testing requirements)
- `c:\Users\HP\Downloads\HSR CNG\PROJECT.md`
- `c:\Users\HP\Downloads\HSR CNG\AGENTS.md`
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\sub_orch_e2e\SCOPE.md`
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_e2e_m1_1\handoff.md` (D1 mock specification)
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_e2e_m1_2\handoff.md` (JWT mock specification)
- `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_spec_miner_e2e_m1_3\handoff.md` (Test Infra and TEST_INFRA.md specification)

## Write Ownership
You exclusively own:
- `TEST_INFRA.md` (project root)
- `tests/fixtures/synthetic-data.ts`
- `tests/helpers/d1-mock.ts`
- `tests/helpers/jwt-mock.ts`
- `tests/helpers/test-harness.test.ts`

DO NOT modify existing application source code in `src/`.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write `handoff.md` in your state folder `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_test_writer_e2e_m1_1\`.


## 2026-11-12T22:10:01Z
[Message] sender=5865c3e7-f765-4be5-a99d-c71fca150f03 priority=MESSAGE_PRIORITY_HIGH
Read the instructions and dispatch details in c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_test_writer_e2e_m1_1\DISPATCH.md.
Also read:
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md (specifically Section 5.9 Full testing requirements)
- c:\Users\HP\Downloads\HSR CNG\PROJECT.md
- c:\Users\HP\Downloads\HSR CNG\AGENTS.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\sub_orch_e2e\SCOPE.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_e2e_m1_1\handoff.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_e2e_m1_2\handoff.md
- c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_spec_miner_e2e_m1_3\handoff.md

Your role is Test Infrastructure Writer.
You exclusively own:
- TEST_INFRA.md (at project root)
- tests/fixtures/synthetic-data.ts
- tests/helpers/d1-mock.ts
- tests/helpers/jwt-mock.ts
- tests/helpers/test-harness.test.ts

DO NOT modify existing source files in src/.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Run `npm run test` and `npm run typecheck` to verify that everything builds and passes.
Write your structured handoff report in c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_test_writer_e2e_m1_1\handoff.md.
Once complete, send a message to the caller with your status and report path.


## 2026-11-12T22:21:02Z
[Message] sender=5865c3e7-f765-4be5-a99d-c71fca150f03 priority=MESSAGE_PRIORITY_HIGH
**Context**: Milestone E2E-M1 Test Infrastructure Implementation
**Content**: Checking in on your progress regarding `tests/helpers/d1-mock.ts`, `tests/helpers/jwt-mock.ts`, and `tests/helpers/test-harness.test.ts`. I noticed `TEST_INFRA.md` and `tests/fixtures/synthetic-data.ts` have been created successfully.
**Action**: Please continue implementing the remaining mock helpers and verification tests, run `npm run test` and `npm run typecheck`, and notify me when complete.
