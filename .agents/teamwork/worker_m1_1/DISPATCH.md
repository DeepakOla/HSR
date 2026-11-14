## 2026-11-12T22:07:15Z
[Message] timestamp=2026-11-12T22:07:15Z sender=e9bc19bb-2d2a-4fef-8beb-489ff00dd865 priority=MESSAGE_PRIORITY_HIGH content=You are Worker 1 (teamwork_worker) for Milestone 1: Vehicle Registration Validation Module.
Working directory: c:\Users\HP\Downloads\HSR CNG
State folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m1_1

Mandatory reading:
1. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\HP\Downloads\HSR CNG\PROJECT.md
3. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\sub_orch_m1\SCOPE.md
4. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\spec_miner_m1_2\handoff.md
5. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m1_1\handoff.md
6. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\explorer_m1_3\handoff.md

Write Ownership:
You have exclusive write ownership of:
- `src/lib/vehicle-registration.ts`
- `tests/vehicle-registration.test.ts`
- `src/lib/utils.ts`
- `tests/utils.test.ts`
Do NOT edit any other files.

Detailed Requirements:
1. Implement `src/lib/vehicle-registration.ts`:
   - Pure TypeScript, zero external/Node.js dependencies (compatible with browser and Cloudflare Workers).
   - Export type `VehicleRegistrationFormat = 'STATE_SERIES' | 'BH_SERIES'`.
   - Export interface `VehicleRegistrationResult`:
     ```typescript
     export interface VehicleRegistrationResult {
       valid: boolean;
       normalized: string;
       error?: string;
       format?: 'STATE_SERIES' | 'BH_SERIES';
     }
     ```
   - Export regular expressions:
     - `STATE_SERIES_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/`
     - `BH_SERIES_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/`
   - Implement and export `normalizeVehicleRegistration(value: string): string`:
     - Strips all whitespace, hyphens, and non-alphanumeric characters; converts to uppercase:
       `(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')`
   - Implement and export `validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult`:
     - Trim raw input; if empty: `valid: false`, `normalized: ''`, localized error message.
     - Normalize trimmed input.
     - If matches `BH_SERIES_REGEX`: `valid: true`, `normalized`, `format: 'BH_SERIES'`.
     - Else if matches `STATE_SERIES_REGEX`: `valid: true`, `normalized`, `format: 'STATE_SERIES'`.
     - Else: `valid: false`, `normalized`, localized error message.
     - Localized error messages:
       - English (`locale === 'en'` or default):
         - Empty: `"Vehicle registration number is required."`
         - Invalid format: `"Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)"`
       - Hindi (`locale === 'hi'`):
         - Empty: `"वाहन पंजीकरण संख्या आवश्यक है।"`
         - Invalid format: `"कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)"`
2. Update `src/lib/utils.ts`:
   - Delegate/re-export `normalizeVehicleRegistration` to `src/lib/vehicle-registration.ts` so all callers use the canonical hyphen-stripping version.
   - Update `tests/utils.test.ts` to ensure hyphenated inputs are tested and pass.
3. Implement `tests/vehicle-registration.test.ts`:
   - Comprehensive test suite using Vitest (`describe`, `it`, `expect`).
   - Test normalization with spaces, hyphens, lowercase, mixed case, tabs, punctuation.
   - Test valid State Series across various states (DL, HR, UP, MH, KA, GJ, RJ, PB, etc.), 1-digit and 2-digit RTO codes, 0, 1, 2, 3 series letters, and 4-digit numbers (including leading zeroes like 0001).
   - Test valid Bharat (BH) Series (years 21-29, 4 digits, 1 and 2 letters).
   - Test invalid cases (too short, too long, arbitrary words like "CAR", "HELLO", "TEST1234", missing digits, invalid symbols, wrong letters).
   - Test bilingual error messages for both English and Hindi.
   - Test edge cases (empty string, whitespace only, hyphens only, null/undefined safety).
4. Run validation:
   - Run `npm run test` and verify that all test suites pass.
   - Run `npm run typecheck` and verify that `astro check` passes with 0 errors.
   - Document all commands and results in `c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\worker_m1_1\handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When finished, write `handoff.md` and message the orchestrator via send_message.
