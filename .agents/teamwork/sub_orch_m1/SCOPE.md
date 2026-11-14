# Scope: Milestone 1 (M1) — Vehicle Registration Validation Module

## Architecture
- Module: `src/lib/vehicle-registration.ts`
- Tests: `tests/vehicle-registration.test.ts`
- Data flow:
  - String input from UI/forms or API payloads -> `normalizeVehicleRegistration` -> Clean uppercase alphanumeric string.
  - String input & optional locale -> `validateVehicleRegistration` -> `{ valid: boolean, normalized: string, error?: string, format?: 'STATE_SERIES' | 'BH_SERIES' }`.
- Consumers:
  - `src/lib/schemas.ts` (Zod validation for booking requests)
  - `BookingWizard.tsx` (Step 2 client validation)
  - `ReceptionDashboard.tsx` & `manual-bookings.ts` (Reception manual booking)
  - `RegisterConsole.tsx` & `register.ts` (Cylinder register)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Vehicle Registration Normalization | Convert to uppercase, strip all whitespace, hyphens, non-alphanumeric chars | M1 | ORIGINAL_REQUEST §5.5, PROJECT.md |
| 2 | Indian State Series Regex Validation | Support `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$` (e.g., DL01AB1234, HR26DQ5551, UP14A1234, MH021234) | M1 | ORIGINAL_REQUEST §5.5, PROJECT.md |
| 3 | Bharat Series (BH) Regex Validation | Support `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$` (e.g., 22BH1234AA, 21BH0001A) | M1 | ORIGINAL_REQUEST §5.5, PROJECT.md |
| 4 | Bilingual Error Messaging | Return localized error message in English or Hindi when invalid | M1 | ORIGINAL_REQUEST §5.5, DISPATCH.md |
| 5 | Comprehensive Unit Test Suite | Thorough unit tests in `tests/vehicle-registration.test.ts` covering valid/invalid cases, normalization, edge cases | M1 | DISPATCH.md, PROJECT.md |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1.1 | Vehicle Registration Validation Implementation & Testing | `src/lib/vehicle-registration.ts`, `tests/vehicle-registration.test.ts` | none | IN_PROGRESS |

## Interface Contracts
### `src/lib/vehicle-registration.ts` ↔ API & Form Consumers
```typescript
export interface VehicleRegistrationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  format?: 'STATE_SERIES' | 'BH_SERIES';
}

export function normalizeVehicleRegistration(value: string): string;
// Strips all whitespace, hyphens, and non-alphanumeric chars; converts to uppercase.
// Example: "dl-01 ab 1234" -> "DL01AB1234", "22 bh 1234 aa" -> "22BH1234AA"

export function validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult;
// Validates against Indian State/UT series (^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$)
// and Bharat Series (^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$).
```
