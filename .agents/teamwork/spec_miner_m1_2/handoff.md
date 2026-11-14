# Indian Vehicle Registration Specification Report

**Milestone**: Milestone 1 (M1) — Vehicle Registration Validation Module  
**Agent**: Explorer 2 (`spec_miner_m1_2`)  
**Target Specification Module**: `src/lib/vehicle-registration.ts`  
**Test Suite**: `tests/vehicle-registration.test.ts`  
**Date**: 2026-11-12T22:00:00Z  

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Normalization | Alphanumeric Uppercase Canonicalization | Converts input to uppercase and strips all whitespace, hyphens, and non-alphanumeric characters: `value.toUpperCase().replace(/[^A-Z0-9]/g, '')`. Handles lowercase, spaces, tabs, hyphens, punctuation. | `string` (e.g., `"dl-01 ab 1234"`, `"22 bh 1234 aa"`, `" hr-26-dq-5551 "`) | Canonical uppercase string (`"DL01AB1234"`, `"22BH1234AA"`, `"HR26DQ5551"`) | Non-string / empty yields `""`. Symbols-only yield `""`. | `ORIGINAL_REQUEST.md` §5.5, `PROJECT.md` §Interface Contracts, `DISPATCH.md` |
| 2 | State Series | Indian Standard State/UT Series Regex | Validates against `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`. 2-letter state/UT code, 1-2 digit RTO code, 0-3 series letters, exactly 4-digit vehicle number. | Normalized string (e.g. `"DL01AB1234"`, `"HR26DQ5551"`, `"MH021234"`, `"DL1A1234"`, `"DL01CAA1234"`) | `{ valid: true, normalized: string, format: 'STATE_SERIES' }` | If invalid, returns `{ valid: false, normalized: string, error: string }`. | Central Motor Vehicles Rules 1989 Rule 50/51, `ORIGINAL_REQUEST.md` §5.5, `PROJECT.md` |
| 3 | State Series | 1-Digit and 2-Digit RTO Code Support | Matches both single-digit RTO codes (e.g., `DL1A1234`, `DL11234`) and two-digit RTO codes (e.g., `DL01AB1234`, `HR26DQ5551`) via `[0-9]{1,2}`. | Normalized string with 1 or 2 digits after state code | Validated as `STATE_SERIES` | 3 or more digits fails regex (e.g. `"DL101AB1234"`). 0 digits fails regex. | MoRTH CMVR specifications, `DISPATCH.md` |
| 4 | State Series | 0 to 3 Series Letters Support | Matches 0 series letters (`"DL011234"`), 1 letter (`"DL01A1234"`), 2 letters (`"DL01AB1234"`), or 3 letters (`"DL01CAA1234"`) via `[A-Z]{0,3}`. | Normalized string with 0-3 letters preceding 4 digits | Validated as `STATE_SERIES` | 4 or more letters fails regex (e.g. `"DL01ABCD1234"`). | MoRTH RTO series allocation rules, `DISPATCH.md` |
| 5 | State Series | 4-Digit Zero-Padded Vehicle Number | Exactly 4 digits at end of registration (`[0-9]{4}`), from `0001` to `9999`. Under CMVR, numbers < 1000 are padded with leading zeroes. | 4 digits at end (e.g., `"0001"`, `"0099"`, `"1234"`, `"9999"`) | Validated as `STATE_SERIES` | 1-3 digits (`"DL01AB1"`, `"DL01AB123"`) or 5+ digits (`"DL01AB12345"`) rejected. | CMVR 1989, `DISPATCH.md` |
| 6 | Bharat Series | MoRTH Bharat Series (BH) Regex | Validates against `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`. 2-digit registration year, "BH" code, 4-digit number (0001-9999), 1-2 alphabet series letters. | Normalized string (e.g., `"22BH1234AA"`, `"21BH0001A"`, `"24BH5678AB"`) | `{ valid: true, normalized: string, format: 'BH_SERIES' }` | Non-BH state codes (`"22CH1234AA"`), wrong digit counts, or missing series letters rejected. | MoRTH Notification G.S.R. 594(E), `ORIGINAL_REQUEST.md` §5.5, `DISPATCH.md` |
| 7 | Bharat Series | 2-Digit Registration Year | Exactly 2 digits representing year of initial registration (e.g., `21`, `22`, `23`, `24`) via `^[0-9]{2}`. | 2 digits at start followed by "BH" | Validated as `BH_SERIES` | 1 digit (`"2BH1234AA"`) or 4 digits (`"2022BH1234AA"`) rejected. | MoRTH Notification G.S.R. 594(E) |
| 8 | Bharat Series | 1 or 2 Series Alphabet Suffix | 1 letter (`"21BH0001A"`) or 2 letters (`"22BH1234AA"`) after 4-digit vehicle number via `[A-Z]{1,2}$`. | 1 or 2 letters at end of BH string | Validated as `BH_SERIES` | 0 letters (`"22BH1234"`) or 3+ letters (`"22BH1234AAA"`) rejected. | MoRTH Notification G.S.R. 594(E) |
| 9 | Validation Result | Mutually Exclusive Format Discrimination | Evaluates BH Series and State Series. Because State Series starts with 2 letters `^[A-Z]{2}` and BH Series starts with 2 digits `^[0-9]{2}`, formats never collide. | Normalized registration string | `{ valid: boolean, normalized: string, error?: string, format?: 'STATE_SERIES' \| 'BH_SERIES' }` | When invalid, `valid: false`, `format` is undefined, `error` contains localized message. | Interface specification in `PROJECT.md` & `SCOPE.md` |
| 10 | Localization | Bilingual English / Hindi Error Messaging | Returns localized error messages according to `locale?: 'en' \| 'hi'`. Default is `'en'`. | `value: string`, `locale?: 'en' \| 'hi'` | English: `"Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)"`. Hindi: `"कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)"` | Unsupported locale falls back safely to English message. | `DISPATCH.md`, `PROJECT.md`, `ORIGINAL_REQUEST.md` §5.5 |
| 11 | API Validation | Schema Integration Contract | Replaces lax `z.string().trim().min(4).max(20)` in `src/lib/schemas.ts`, `src/pages/api/booking/create-hold.ts`, `manual-bookings.ts`, and `register.ts` with strict validation. | Request body payload | Validated & normalized registration | HTTP 400 with bilingual error message if format is malformed. | Codebase inspection of `schemas.ts`, `create-hold.ts`, `manual-bookings.ts`, `register.ts` |
| 12 | UI Validation | Form Input & Button Gating Parity | Validates registration in `BookingWizard.tsx` (Step 5), `ReceptionDashboard.tsx`, and `RegisterConsole.tsx` with instant feedback and disabled submission for invalid formats. | User input in `<input>` | Reactive validation indicator / helper text | Gated submit button; red warning text when input is invalid. | Codebase inspection of `BookingWizard.tsx:356,366`, `ReceptionDashboard.tsx:274`, `RegisterConsole.tsx:145` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Normalization | `"dl-01 ab 1234"` | Normalized to `"DL01AB1234"`; valid `STATE_SERIES`. |
| 2 | Normalization | `"HR-26-DQ-5551"` | Normalized to `"HR26DQ5551"`; valid `STATE_SERIES`. |
| 3 | Normalization | `"  up 14 a 1234  "` | Normalized to `"UP14A1234"`; valid `STATE_SERIES`. |
| 4 | Normalization | `"22 bh 1234 aa"` | Normalized to `"22BH1234AA"`; valid `BH_SERIES`. |
| 5 | Normalization | `"23-BH-9999-Z"` | Normalized to `"23BH9999Z"`; valid `BH_SERIES`. |
| 6 | Normalization | `"\tdl\t01\nab\t1234\n"` | Normalized to `"DL01AB1234"`; valid `STATE_SERIES`. |
| 7 | Normalization | `"dl.01/ab:1234"` | Normalized to `"DL01AB1234"`; valid `STATE_SERIES`. |
| 8 | Normalization | `""` (empty string) | Normalized to `""`; valid: `false`; error returned. |
| 9 | Normalization | `"   "` (spaces only) | Normalized to `""`; valid: `false`; error returned. |
| 10 | Normalization | `"---"` (hyphens only) | Normalized to `""`; valid: `false`; error returned. |
| 11 | Normalization | `null` / `undefined` / non-string | Handled safely: normalized to `""`; valid: `false`; error returned. |
| 12 | State Series: Min length | `"DL11234"` (7 chars: 2 state + 1 RTO + 0 series + 4 digits) | Normalized to `"DL11234"`; valid `STATE_SERIES`. |
| 13 | State Series: 1-digit RTO | `"DL1A1234"` (8 chars) | Normalized to `"DL1A1234"`; valid `STATE_SERIES`. |
| 14 | State Series: 0 series letters | `"DL011234"` (8 chars) | Normalized to `"DL011234"`; valid `STATE_SERIES`. |
| 15 | State Series: 1 series letter | `"UP14A1234"` (9 chars) | Normalized to `"UP14A1234"`; valid `STATE_SERIES`. |
| 16 | State Series: 2 series letters | `"HR26DQ5551"` (10 chars) | Normalized to `"HR26DQ5551"`; valid `STATE_SERIES`. |
| 17 | State Series: 3 series letters (Max len) | `"DL01CAA1234"` (11 chars: 2 state + 2 RTO + 3 series + 4 digits) | Normalized to `"DL01CAA1234"`; valid `STATE_SERIES`. |
| 18 | State Series: Zero padding | `"GJ010001"` | Normalized to `"GJ010001"`; valid `STATE_SERIES`. |
| 19 | State Series: High vehicle number | `"RJ149999"` | Normalized to `"RJ149999"`; valid `STATE_SERIES`. |
| 20 | BH Series: 1 series letter (Min len) | `"21BH0001A"` (9 chars: 2 year + 2 BH + 4 number + 1 series) | Normalized to `"21BH0001A"`; valid `BH_SERIES`. |
| 21 | BH Series: 2 series letters (Max len) | `"22BH1234AA"` (10 chars: 2 year + 2 BH + 4 number + 2 series) | Normalized to `"22BH1234AA"`; valid `BH_SERIES`. |
| 22 | BH Series: High year and number | `"26BH9999ZZ"` | Normalized to `"26BH9999ZZ"`; valid `BH_SERIES`. |
| 23 | Invalid: Arbitrary word | `"CAR"` | Normalized to `"CAR"`; valid: `false`; error returned. |
| 24 | Invalid: Arbitrary word | `"HELLO"` | Normalized to `"HELLO"`; valid: `false`; error returned. |
| 25 | Invalid: Arbitrary word + number | `"TEST1234"` | Normalized to `"TEST1234"`; valid: `false`; error returned. |
| 26 | Invalid: State code only | `"DL"` | Normalized to `"DL"`; valid: `false`; error returned. |
| 27 | Invalid: State + RTO only | `"DL01"` | Normalized to `"DL01"`; valid: `false`; error returned. |
| 28 | Invalid: State + RTO + Series only | `"DL01A"` | Normalized to `"DL01A"`; valid: `false`; error returned. |
| 29 | Invalid: Numbers only | `"12345678"` | Normalized to `"12345678"`; valid: `false`; error returned. |
| 30 | Invalid: Missing RTO digits | `"DLAB1234"` | Normalized to `"DLAB1234"`; valid: `false`; error returned. |
| 31 | Invalid: Missing State letters | `"01AB1234"` | Normalized to `"01AB1234"`; valid: `false`; error returned. |
| 32 | Invalid: 5-digit number (State) | `"DL01AB12345"` | Normalized to `"DL01AB12345"`; valid: `false`; error returned. |
| 33 | Invalid: 3-digit number (State) | `"DL01AB123"` | Normalized to `"DL01AB123"`; valid: `false`; error returned. |
| 34 | Invalid: 4 series letters (State) | `"DL01ABCD1234"` | Normalized to `"DL01ABCD1234"`; valid: `false`; error returned. |
| 35 | Invalid: 3 RTO digits (State) | `"DL101AB1234"` | Normalized to `"DL101AB1234"`; valid: `false`; error returned. |
| 36 | Invalid: Non-BH state with year | `"22CH1234AA"` | Normalized to `"22CH1234AA"`; valid: `false`; error returned. |
| 37 | Invalid: 1-digit year (BH) | `"2BH1234AA"` | Normalized to `"2BH1234AA"`; valid: `false`; error returned. |
| 38 | Invalid: 4-digit year (BH) | `"2022BH1234AA"` | Normalized to `"2022BH1234AA"`; valid: `false`; error returned. |
| 39 | Invalid: 3-digit number (BH) | `"22BH123AA"` | Normalized to `"22BH123AA"`; valid: `false`; error returned. |
| 40 | Invalid: 5-digit number (BH) | `"22BH12345AA"` | Normalized to `"22BH12345AA"`; valid: `false`; error returned. |
| 41 | Invalid: 0 series letters (BH) | `"22BH1234"` | Normalized to `"22BH1234"`; valid: `false`; error returned. |
| 42 | Invalid: 3 series letters (BH) | `"22BH1234AAA"` | Normalized to `"22BH1234AAA"`; valid: `false`; error returned. |
| 43 | Invalid: Trailing invalid characters | `"DL01AB1234@"` | Normalized to `"DL01AB1234"`; stripped to valid canonical form. |
| 44 | Invalid: Non-alphanumeric embedded | `"DL01AB123@"` | Normalized to `"DL01AB123"` (3 digits left); valid: `false`. |
| 45 | Bilingual error: English | Input `"INVALID"` with locale `'en'` | Returns English message: `"Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)"`. |
| 46 | Bilingual error: Hindi | Input `"INVALID"` with locale `'hi'` | Returns Hindi message: `"कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)"`. |

---

## 1. Observation

1. **Mandatory Documentation Directives**:
   - `ORIGINAL_REQUEST.md` §5.5 (lines 255-270):
     > "The vehicle registration field must not accept arbitrary text as a valid registration number. Implement consistent client-side and server-side validation: Automatically convert entered letters to uppercase. Allow appropriate letters and digits, with spaces or hyphens accepted as input separators if needed. Normalize the value consistently before storage and duplicate matching. Reject unsupported symbols, arbitrary words, invalid lengths and obviously malformed registrations. Provide a useful validation message next to the field. Apply the same validation to public bookings, receptionist manual bookings and the cylinder-register workflow. Do not use an unnecessarily restrictive pattern that rejects legitimate Indian registration formats. Check ordinary state-series registrations and Bharat Series (BH) registrations. Test valid and invalid examples. Keep the server as the final authority; browser-only validation is not sufficient. Do not connect to or scrape VAHAN for personal vehicle-owner data."
   - `PROJECT.md` §Interface Contracts (lines 59-75):
     ```typescript
     export interface VehicleRegistrationResult {
       valid: boolean;
       normalized: string;
       error?: string;
       format?: 'STATE_SERIES' | 'BH_SERIES';
     }

     export function normalizeVehicleRegistration(value: string): string;
     export function validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult;
     ```
   - `PROJECT.md` §Milestones (lines 47):
     > `M1: Vehicle Registration Validation Module | src/lib/vehicle-registration.ts, tests in tests/vehicle-registration.test.ts`
   - `sub_orch_m1/SCOPE.md` (lines 1-46): Defines architecture, consumers (`src/lib/schemas.ts`, `BookingWizard.tsx`, `ReceptionDashboard.tsx`, `manual-bookings.ts`, `RegisterConsole.tsx`, `register.ts`), and feature inventory.

2. **Existing Codebase State & Deficiencies**:
   - `src/lib/utils.ts` lines 27-29 contains:
     ```typescript
     export function normalizeVehicleRegistration(value: string): string {
       return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
     }
     ```
     **Deficiency**: Notice `[^A-Z0-9-]` preserves hyphens (`-`). An input of `"dl-01-ab-1234"` returns `"DL-01-AB-1234"` instead of stripping hyphens. The specification explicitly mandates stripping hyphens: `value.toUpperCase().replace(/[^A-Z0-9]/g, '')`.
   - `tests/utils.test.ts` line 14:
     ```typescript
     expect(normalizeVehicleRegistration('hr 36 ab 1234')).toBe('HR36AB1234');
     ```
     Only tested whitespace removal, leaving the hyphen preservation bug undetected.
   - `src/lib/schemas.ts` line 12:
     ```typescript
     vehicleRegistration: z.string().trim().min(4).max(20),
     ```
     **Deficiency**: Validates only length between 4 and 20. Accepts arbitrary words like `"CAR"`, `"HELLO"`, `"TEST1234"`.
   - `src/pages/api/admin/manual-bookings.ts` line 17:
     ```typescript
     vehicleRegistration: z.string().trim().min(4).max(20),
     ```
     **Deficiency**: No format validation on receptionist manual bookings.
   - `src/pages/api/admin/register.ts` line 12:
     ```typescript
     vehicleRegistration: z.string().trim().min(4).max(20),
     ```
     **Deficiency**: No format validation on cylinder testing register entries.
   - `src/components/booking/BookingWizard.tsx` line 356 and line 366:
     ```tsx
     <input style={{ minHeight: 52, width: '100%' }} value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} />
     ...
     disabled={... || registration.trim().length < 4 || ...}
     ```
     **Deficiency**: No client-side format validation; only requires 4 characters; no error message displayed next to the field.
   - `src/components/admin/ReceptionDashboard.tsx` line 274:
     ```tsx
     <input className="admin-input" required minLength={4} value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} />
     ```
   - `src/components/admin/RegisterConsole.tsx` line 145:
     ```tsx
     <input className="admin-input" value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} required minLength={4} />
     ```

3. **Authoritative MoRTH Specifications**:
   - Central Motor Vehicles Rules (CMVR) 1989 Rule 50 & 51:
     - 2-letter State/UT Code (`[A-Z]{2}`)
     - 1 or 2 digit RTO Code (`[0-9]{1,2}`)
     - 0 to 3 alphabet series letters (`[A-Z]{0,3}`)
     - Exactly 4-digit vehicle number (`[0-9]{4}`)
     - Regex: `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`
   - MoRTH Notification G.S.R. 594(E) dated 26 August 2021 (effective 15 September 2021) and amendment G.S.R. 879(E) dated 14 December 2022:
     - 2-digit Year of registration (`YY`: `[0-9]{2}`)
     - Bharat Series code (`BH`)
     - 4-digit number (`0000` to `9999`, typically `0001` to `9999`: `[0-9]{4}`)
     - 1 or 2 letter series (`[A-Z]{1,2}`)
     - Regex: `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`

4. **Independent Execution Verification**:
   - Executed 41 representative test vectors in `test_regex.cjs` and 12 boundary length cases in `test_boundaries.cjs`.
   - 100% of valid State Series and BH Series passed.
   - 100% of invalid cases (arbitrary strings, malformed lengths, missing digits, non-BH year prefixes) failed as expected.
   - Zero collisions between State Series and BH Series.

---

## 2. Logic Chain

1. **Step 1: Normalization Pre-Processing**:
   - Any raw input entered by a user on mobile or desktop may contain spaces (`"DL 01 AB 1234"`), hyphens (`"DL-01-AB-1234"`), lowercase characters (`"dl01ab1234"`), or stray punctuation (`"DL.01/AB-1234"`).
   - Applying `value.toUpperCase().replace(/[^A-Z0-9]/g, '')` ensures that all formatting variations collapse to an unambiguous uppercase canonical string (e.g. `"DL01AB1234"`).
   - This canonical string is used for regex testing, duplicate detection, and database storage in `vehicles.registration_normalized`.

2. **Step 2: Mutual Exclusivity of Formats**:
   - The State Series regex begins with `^[A-Z]{2}` (first two characters are letters).
   - The Bharat Series regex begins with `^[0-9]{2}` (first two characters are numbers).
   - Because a character cannot be simultaneously a letter and a digit, the two regex patterns are strictly disjoint. No string can match both.

3. **Step 3: Discrimination & Format Tagging**:
   - Evaluate normalized string against `BH_SERIES_REGEX` (`^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`). If match -> return `{ valid: true, normalized, format: 'BH_SERIES' }`.
   - Otherwise evaluate against `STATE_SERIES_REGEX` (`^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`). If match -> return `{ valid: true, normalized, format: 'STATE_SERIES' }`.
   - Otherwise -> return `{ valid: false, normalized, error: errorMessage }`.

4. **Step 4: Localization Fallback**:
   - If `locale === 'hi'`, return Hindi error message: `"कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)"`.
   - Otherwise (or if `locale` is omitted/invalid), return English error message: `"Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)"`.

5. **Step 5: Length Invariants**:
   - Minimum valid registration length is 7 characters (e.g. `"DL11234"`: 2 state + 1 RTO + 0 series + 4 digits).
   - Maximum valid registration length is 11 characters (e.g. `"DL01CAA1234"`: 2 state + 2 RTO + 3 series + 4 digits).
   - BH Series length is either 9 characters (1 series letter, e.g. `"21BH0001A"`) or 10 characters (2 series letters, e.g. `"22BH1234AA"`).
   - Any normalized string with length < 7 or length > 11 is guaranteed invalid.

---

## 3. Caveats

1. **State Code Enumeration vs. Pattern Matching**:
   The specification intentionally uses `^[A-Z]{2}...` rather than an explicit enum of 36 State/UT codes (`DL|HR|UP|MH...`). This aligns directly with `ORIGINAL_REQUEST.md` §5.5 ("Do not use an unnecessarily restrictive pattern that rejects legitimate Indian registration formats") and prevents breaking when new UT/State codes are created (e.g. Ladakh `LA`, Dadra & Nagar Haveli / Daman & Diu `DD`, Telangana `TG` in 2024 replacing `TS`).
2. **Specialised/Military/Diplomatic Registrations**:
   Special categories such as Indian Military vehicles (starting with an upward arrow `↑` and 2 digits) or Diplomatic Corps (`CD`/`CC` plates) are not CNG cylinder testing commercial customers in practice; however, standard state series and Bharat Series cover 100% of civilian passenger cars, taxis, commercial LCVs, tempos, buses, and heavy trucks targeted by HSR Green Energy.
3. **No VAHAN Scraping**:
   Per `ORIGINAL_REQUEST.md` §5.5, no external API or scraping of VAHAN is permitted for privacy, regulatory, and architectural reasons. All validation must be pure algorithmic/regex validation.

---

## 4. Conclusion

1. **Exact Interface Contract Formalized**:
   The module `src/lib/vehicle-registration.ts` must export:
   ```typescript
   export type VehicleRegistrationFormat = 'STATE_SERIES' | 'BH_SERIES';

   export interface VehicleRegistrationResult {
     valid: boolean;
     normalized: string;
     error?: string;
     format?: VehicleRegistrationFormat;
   }

   export function normalizeVehicleRegistration(value: string): string;
   export function validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult;
   ```
2. **Exact Regular Expressions**:
   - State Series: `/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/`
   - Bharat Series: `/^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/`
3. **Exact Normalization Expression**:
   `value.toUpperCase().replace(/[^A-Z0-9]/g, '')`
4. **Exact Bilingual Error Messages**:
   - `en`: `"Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)"`
   - `hi`: `"कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)"`
5. **Codebase Actions Required by Subsequent Builders**:
   - Create `src/lib/vehicle-registration.ts` and `tests/vehicle-registration.test.ts`.
   - Update `src/lib/utils.ts` to re-export or use `normalizeVehicleRegistration` without hyphen retention.
   - Integrate `validateVehicleRegistration` into `src/lib/schemas.ts` (`createHoldSchema`), `src/pages/api/admin/manual-bookings.ts`, and `src/pages/api/admin/register.ts`.
   - Add client-side validation and bilingual error feedback to `BookingWizard.tsx`, `ReceptionDashboard.tsx`, and `RegisterConsole.tsx`.

---

## 5. Verification Method

To independently verify this specification:

1. **Run the specification test harness**:
   ```powershell
   node .agents/teamwork/spec_miner_m1_2/test_regex.cjs
   node .agents/teamwork/spec_miner_m1_2/test_boundaries.cjs
   ```
   **Expected Output**: `ALL 41 TESTS PASSED!` and `ALL BOUNDARY TESTS PASSED!`.

2. **Verify Codebase Deficiencies**:
   Inspect `src/lib/utils.ts` line 28 to observe the hyphen preservation defect:
   ```powershell
   git grep -n "replace(/\[\^A-Z0-9-\]/g" src/lib/utils.ts
   ```
   Inspect `src/lib/schemas.ts` line 12 to observe the lack of format validation:
   ```powershell
   git grep -n "vehicleRegistration:" src/lib/schemas.ts
   ```

3. **Verify Project Test Commands**:
   - `npm run test`
   - `npm run typecheck`
   - `npm run build`
