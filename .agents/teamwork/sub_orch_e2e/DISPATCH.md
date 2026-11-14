# Task Assignment for E2E Testing Track Orchestrator
E2E Testing Track under Project Plan.
Publishes TEST_READY.md upon completion of Tiers 1-4.


## 2026-11-12T21:46:32Z
You are the E2E Testing Track Orchestrator for the HSR Green Energy project.
Your scope:
Design, build, and verify the comprehensive, opaque-box E2E test suite and test infrastructure derived from user requirements and Section 5.9.

Working directory: c:\Users\HP\Downloads\HSR CNG
State folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\sub_orch_e2e
Your parent conversation ID: 8d667e27-5030-463a-8d49-7a6f7181d0c7

Mandatory reading:
1. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md (especially Section 5.9 Full testing requirements)
2. c:\Users\HP\Downloads\HSR CNG\PROJECT.md
3. AGENTS.md
4. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\teamwork_explorer_survey_4\analysis.md (exhaustive test matrix and gap analysis from Agent D)

Responsibilities:
1. Create `TEST_INFRA.md` at project root documenting test architecture, methodology, runner invocation, and coverage thresholds.
2. Build the test infrastructure:
   - In-memory / mock D1 test harness (`better-sqlite3` or local D1 runner) enabling automated integration testing of SQL schema, migrations, triggers (`bookings_capacity_guard`), and transactions.
   - Synthetic RS256 Cloudflare Access JWT assertion generator for mocking Cloudflare Access authentication in tests.
   - Playwright browser E2E test harness in `tests/e2e/`.
3. Implement the exhaustive 4-tier test cases:
   - Tier 1: Feature Coverage (>=5 per feature across all 15 inventoried features in PROJECT.md).
   - Tier 2: Boundary & Corner Cases (>=5 per feature: limits, invalid registrations, boundary cylinder counts, missing configs).
   - Tier 3: Cross-Feature Interactions & Pairwise Combinations (intervals, cylinder counts, payment gating, concurrency).
   - Tier 4: Real-World Application Scenarios (customer self-service, receptionist operations, owner settings).
4. Follow the Project Pattern iteration loop:
   - Dispatch Explorer / Spec Miner.
   - Dispatch Test Writer (`teamwork_test_writer`) to author test files.
   - Dispatch Reviewer (`teamwork_reviewer`) to verify opaque-box compliance and independence.
   - Dispatch Challenger and Forensic Auditor (`teamwork_auditor`).
5. When complete, publish `TEST_READY.md` at project root with full runner instructions, coverage summary, and feature checklist.
6. Notify your parent (8d667e27-5030-463a-8d49-7a6f7181d0c7) upon publishing `TEST_READY.md`.
