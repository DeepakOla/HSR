# Task Assignment for Milestone 1 Sub-Orchestrator: Vehicle Registration Validation Module
Milestone 1 under Project Track.


## 2026-11-12T21:46:20Z

You are the Sub-Orchestrator for Milestone 1 (M1): Vehicle Registration Validation Module.
Your scope:
Implement `src/lib/vehicle-registration.ts` and test suite `tests/vehicle-registration.test.ts`.

Working directory: c:\Users\HP\Downloads\HSR CNG
State folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\sub_orch_m1
Your parent conversation ID: 8d667e27-5030-463a-8d49-7a6f7181d0c7

Mandatory reading:
1. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\HP\Downloads\HSR CNG\PROJECT.md
3. AGENTS.md

Detailed technical requirements:
1. Module: `src/lib/vehicle-registration.ts`
   - Implement `normalizeVehicleRegistration(value: string): string`
     - Automatically convert to uppercase.
     - Strip all whitespace, hyphens, and non-alphanumeric characters (`value.toUpperCase().replace(/[^A-Z0-9]/g, '')`).
     - Example: "dl-01 ab 1234" -> "DL01AB1234", "22 bh 1234 aa" -> "22BH1234AA".
   - Implement `validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): { valid: boolean; normalized: string; error?: string; format?: 'STATE_SERIES' | 'BH_SERIES' }`
     - Support Indian Standard State Series: `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$` (e.g. DL01AB1234, HR26DQ5551, UP14A1234, MH021234).
     - Support Bharat Series (BH Series): `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$` (e.g. 22BH1234AA, 21BH0001A).
     - Reject malformed strings, arbitrary words (e.g. "CAR", "HELLO", "TEST1234"), invalid state/format lengths.
     - Provide helpful localized error message when invalid.
2. Unit tests: `tests/vehicle-registration.test.ts`
   - Test valid state series (various states DL, HR, UP, MH, KA, GJ, RJ, PB, etc., single/double digit RTO, 0-3 series letters, 4-digit numbers).
   - Test valid Bharat (BH) series (year 21-29, 4 digits, 1-2 letters).
   - Test normalization with spaces, hyphens, mixed case.
   - Test invalid cases (too short, too long, arbitrary words, invalid symbols).
3. Follow the Sub-Orchestrator 2B iteration loop:
   - Spawn Explorer (`teamwork_explorer`) to analyze exact test patterns and interfaces.
   - Spawn Worker (`teamwork_worker`) to implement `src/lib/vehicle-registration.ts` and `tests/vehicle-registration.test.ts`, and run `npm run test` and `npm run typecheck`. Include MANDATORY INTEGRITY WARNING.
   - Spawn 2 Reviewers (`teamwork_reviewer`) independently.
   - Spawn 2 Challengers (`teamwork_challenger`) with adversarial fuzzing / boundary cases.
   - Spawn 1 Forensic Auditor (`teamwork_auditor`) for integrity verification.
   - Evaluate gate in `GATE_STATUS.md`. All criteria must pass.

When the milestone gate passes, mark Milestone 1 done in `PROJECT.md` and `progress.md`, write `handoff.md`, and notify your parent (8d667e27-5030-463a-8d49-7a6f7181d0c7).
