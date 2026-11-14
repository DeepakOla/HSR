# Consumer Integration Report — Vehicle Registration Validation Module (Milestone 1)

## 1. Observation

A full forensic investigation of vehicle registration usage was conducted across schemas, client islands, API routes, booking engine, utilities, and database schemas.

### 1.1 `src/lib/schemas.ts`
- **Current implementation** (line 12):
  ```typescript
  export const createHoldSchema = z.object({
    locale: localeSchema,
    slotSnapshotId: z.number().int().positive(),
    categoryId: z.number().int().positive(),
    vehicleType: z.string().trim().min(2).max(100),
    customerName: z.string().trim().min(2).max(120),
    mobile: z.string().trim().min(10).max(20),
    vehicleRegistration: z.string().trim().min(4).max(20),
    source: z.literal('WEB').default('WEB'),
    idempotencyKey: z.string().trim().min(8).max(120),
  });
  ```
- **Finding**: Only checks `z.string().trim().min(4).max(20)`. No regex validation, no normalization, and no distinction between State series and Bharat series.

### 1.2 `src/pages/api/booking/create-hold.ts`
- **Current implementation** (lines 27–28, 33):
  ```typescript
  const body = await request.json().catch(() => null);
  const parsed = createHoldSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid booking payload', 400);
  ...
  const result = await createHold(db, { ...parsed.data, source: 'WEB' });
  ```
- **Finding**: Does not surface field-specific validation errors. Passing an invalid registration currently succeeds if it is between 4 and 20 characters.

### 1.3 `src/components/booking/BookingWizard.tsx`
- **Current implementation** (lines 66, 179, 356, 366):
  - State: `const [registration, setRegistration] = useState('');` (line 66)
  - Payload: `vehicleRegistration: registration` (line 179)
  - Input: `<input ... value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} />` (line 356)
  - Form validation: `disabled={... || registration.trim().length < 4 || ...}` (line 366)
- **Finding**: Input converts to uppercase but does zero regex validation. No inline error message is rendered next to the field when an invalid or malformed registration is entered.

### 1.4 `src/components/admin/ReceptionDashboard.tsx`
- **Current implementation** (lines 100, 175, 274):
  - State: `const [registration, setRegistration] = useState('');` (line 100)
  - Payload: `vehicleRegistration: registration` (line 175)
  - Input: `<input className="admin-input" required minLength={4} value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} />` (line 274)
- **Finding**: Relies solely on HTML5 `required minLength={4}` and uppercase conversion. No inline format feedback or regex check.

### 1.5 `src/pages/api/admin/manual-bookings.ts`
- **Current implementation** (lines 10, 17, 31–32):
  ```typescript
  const schema = z.object({
    ...
    vehicleRegistration: z.string().trim().min(4).max(20),
    ...
  });
  ```
- **Finding**: Duplicates the loose `min(4).max(20)` Zod schema. Bypasses Indian State & Bharat Series validation entirely.

### 1.6 `src/components/admin/RegisterConsole.tsx`
- **Current implementation** (lines 26, 78, 144–146):
  - State: `const [registration, setRegistration] = useState('');` (line 26)
  - Payload: `vehicleRegistration: registration` (line 78)
  - Input: `<input className="admin-input" value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} required minLength={4} />` (line 145)
- **Finding**: Free-form uppercase input without validation feedback.

### 1.7 `src/pages/api/admin/register.ts`
- **Current implementation** (lines 12, 41–59):
  ```typescript
  const schema = z.object({
    bookingCode: z.string().trim().min(8).max(40),
    vehicleRegistration: z.string().trim().min(4).max(20),
    ...
  });
  ...
  const booking = await db.prepare(
    `SELECT b.id, b.vehicle_id AS vehicleId, v.registration_normalized AS registration
     FROM bookings b
     JOIN vehicles v ON v.id = b.vehicle_id
     WHERE b.booking_code = ? AND b.reservation_state = 'COMPLETED'`
  )...;
  const normalizedRegistration = normalizeVehicleRegistration(parsed.data.vehicleRegistration);
  if (normalizedRegistration !== booking.registration) {
    return errorResponse('Vehicle registration does not match the selected booking', 409, 'VEHICLE_MISMATCH');
  }
  ```
- **Finding**: Matches `normalizedRegistration` against `booking.registration` (`vehicles.registration_normalized`). This confirms normalization consistency is essential.

### 1.8 `src/lib/booking-engine.ts`
- **Current implementation** (lines 4, 197, 348–350):
  ```typescript
  import { ..., normalizeVehicleRegistration, ... } from './utils';
  ...
  const normalizedReg = normalizeVehicleRegistration(input.vehicleRegistration);
  ...
  db.prepare(
    'INSERT INTO vehicles(registration_normalized, registration_display, vehicle_type) VALUES(?, ?, ?) ON CONFLICT(registration_normalized) DO UPDATE SET registration_display = excluded.registration_display, vehicle_type = excluded.vehicle_type'
  ).bind(normalizedReg, input.vehicleRegistration.trim().toUpperCase(), input.vehicleType.trim()),
  ```
- **Finding**: `registration_normalized` is the DB conflict resolution key for vehicles. `registration_display` stores the trimmed uppercase value.

### 1.9 `src/lib/utils.ts`
- **Current implementation** (lines 27–29):
  ```typescript
  export function normalizeVehicleRegistration(value: string): string {
    return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  }
  ```
- **Finding**: Retains hyphens (`[^A-Z0-9-]`), which directly conflicts with `PROJECT.md` / `SCOPE.md` ("Strips all whitespace, hyphens, and non-alphanumeric chars; converts to uppercase"). Furthermore, `utils.ts` imports `node:crypto` (line 1), making direct imports of `utils.ts` into client-side React islands undesirable.

### 1.10 Database Schema & Migrations (`migrations/0001_init.sql`, `0005_cylinder_work_units.sql`)
- `vehicles` table:
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `registration_normalized TEXT NOT NULL UNIQUE`
  - `registration_display TEXT NOT NULL`
  - `vehicle_type TEXT NOT NULL DEFAULT 'Other'`
  - `created_at TEXT NOT NULL DEFAULT (datetime('now'))`
- `bookings` table:
  - `vehicle_id INTEGER NOT NULL REFERENCES vehicles(id)`
  - `vehicle_type_snapshot TEXT NOT NULL DEFAULT 'Other'`
- **Finding**: The database schema is fully aligned and ready. No database migrations are required for vehicle registration validation.

---

## 2. Logic Chain

1. **Environment Compatibility (Client & Server)**:
   - `BookingWizard.tsx`, `ReceptionDashboard.tsx`, and `RegisterConsole.tsx` run in the browser as React islands.
   - `create-hold.ts`, `manual-bookings.ts`, and `register.ts` run in the Cloudflare Workers / Astro runtime.
   - Therefore, `src/lib/vehicle-registration.ts` must have **zero external or Node.js-specific dependencies** (no `node:crypto`, no Node built-ins). It must be pure TypeScript/JavaScript so it bundles effortlessly in both client and server.

2. **Single Source of Truth**:
   - `src/lib/vehicle-registration.ts` should export:
     - `VehicleRegistrationResult` interface
     - `normalizeVehicleRegistration(value: string): string`
     - `validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult`
     - Regular expression constants: `STATE_SERIES_REGEX` and `BH_SERIES_REGEX`
   - `src/lib/utils.ts` should re-export `normalizeVehicleRegistration` from `src/lib/vehicle-registration.ts` so existing code continues functioning without breaking changes.

3. **Normalization Specification Alignment**:
   - Per `PROJECT.md` and `SCOPE.md`: `normalizeVehicleRegistration` must strip all whitespace, hyphens, and non-alphanumeric characters, and convert to uppercase.
   - Formula: `(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')`
   - Example 1: `"dl-01 ab 1234"` -> `"DL01AB1234"`
   - Example 2: `"22 bh 1234 aa"` -> `"22BH1234AA"`
   - Example 3: `"HR-26-DQ-5551"` -> `"HR26DQ5551"`

4. **Validation Logic & Regexes**:
   - **State / UT Series**: `/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/`
     - Covers 2-letter state code (`DL`, `HR`, `UP`, `MH`, etc.)
     - 1-2 digit district code (`01`, `1`, `26`, etc.)
     - 0-3 series letters (legacy numbers have 0, standard have 1-2, high-density/commercial have 3, e.g. `DL1CAA1111`)
     - 4-digit unique number (`0001` to `9999`)
   - **Bharat (BH) Series**: `/^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/`
     - 2-digit registration year (`21` onwards)
     - `BH` national code
     - 4-digit unique number
     - 1-2 series letters (`A`, `AA`, etc.)
   - **Result Mapping**:
     - If empty: `valid: false`, `normalized: ''`, localized error: `"Vehicle registration number is required."` / `"वाहन रजिस्ट्रेशन नंबर अनिवार्य है।"`
     - If matches `BH_SERIES_REGEX`: `valid: true`, `format: 'BH_SERIES'`
     - If matches `STATE_SERIES_REGEX`: `valid: true`, `format: 'STATE_SERIES'`
     - Else: `valid: false`, localized error: `"Please enter a valid Indian vehicle registration number (e.g., DL 01 AB 1234 or 22 BH 1234 AA)."` / `"कृपया एक मान्य भारतीय वाहन रजिस्ट्रेशन नंबर दर्ज करें (जैसे DL 01 AB 1234 या 22 BH 1234 AA)।"`

5. **Schema & API Enforcement**:
   - `schemas.ts` can use `.superRefine()` or a reusable Zod helper that runs `validateVehicleRegistration`.
   - APIs (`create-hold.ts`, `manual-bookings.ts`, `register.ts`) must return HTTP 400 with the exact validation message if malformed, preventing invalid registrations from ever entering D1.

6. **Form UX & Accessibility**:
   - Inputs should keep the display string in uppercase while typing.
   - When blurred or modified, real-time validation feedback displays inline with `role="alert"` and `aria-invalid`.
   - Submit buttons remain disabled until `regValidation.valid` is `true`.

---

## 3. Caveats

1. **No External VAHAN API**: In strict adherence to `ORIGINAL_REQUEST §5.5` and security invariants, no external calls or web scraping to MoRTH/VAHAN will be made. Validation is purely algorithmic format validation.
2. **Vintage & Diplomatic Formats**: Standard state series with 0 series letters (e.g. `DL011234`) are supported. Military (`↑`) and Diplomatic (`CD`/`CC`) plates are not part of consumer CNG cylinder testing scope, but ordinary State and BH series are fully covered.
3. **Database Migration Not Needed**: As verified in `0001_init.sql` and `0005_cylinder_work_units.sql`, columns `registration_normalized` and `registration_display` already exist. No D1 forward migration is necessary for Milestone 1.

---

## 4. Conclusion & Integration Blueprint

### Blueprint 4.1: Module Implementation (`src/lib/vehicle-registration.ts`)
```typescript
export interface VehicleRegistrationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  format?: 'STATE_SERIES' | 'BH_SERIES';
}

export const STATE_SERIES_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
export const BH_SERIES_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

export function normalizeVehicleRegistration(value: string): string {
  if (!value) return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function validateVehicleRegistration(
  value: string,
  locale: 'en' | 'hi' = 'en'
): VehicleRegistrationResult {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: locale === 'hi'
        ? 'वाहन रजिस्ट्रेशन नंबर अनिवार्य है।'
        : 'Vehicle registration number is required.',
    };
  }

  const normalized = normalizeVehicleRegistration(trimmed);

  if (BH_SERIES_REGEX.test(normalized)) {
    return { valid: true, normalized, format: 'BH_SERIES' };
  }

  if (STATE_SERIES_REGEX.test(normalized)) {
    return { valid: true, normalized, format: 'STATE_SERIES' };
  }

  return {
    valid: false,
    normalized,
    error: locale === 'hi'
      ? 'कृपया एक मान्य भारतीय वाहन रजिस्ट्रेशन नंबर दर्ज करें (जैसे DL 01 AB 1234 या 22 BH 1234 AA)।'
      : 'Please enter a valid Indian vehicle registration number (e.g., DL 01 AB 1234 or 22 BH 1234 AA).',
  };
}
```

### Blueprint 4.2: `src/lib/schemas.ts` Integration
```typescript
import { validateVehicleRegistration } from './vehicle-registration';

export const vehicleRegistrationField = z.string()
  .trim()
  .min(4, 'Registration number too short')
  .max(20, 'Registration number too long')
  .superRefine((val, ctx) => {
    const res = validateVehicleRegistration(val);
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.error || 'Invalid vehicle registration number',
      });
    }
  });

export const createHoldSchema = z.object({
  locale: localeSchema,
  slotSnapshotId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  vehicleType: z.string().trim().min(2).max(100),
  customerName: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(10).max(20),
  vehicleRegistration: vehicleRegistrationField,
  source: z.literal('WEB').default('WEB'),
  idempotencyKey: z.string().trim().min(8).max(120),
}).superRefine((data, ctx) => {
  // Locale-aware refinement
  const res = validateVehicleRegistration(data.vehicleRegistration, data.locale);
  if (!res.valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vehicleRegistration'],
      message: res.error,
    });
  }
});
```

### Blueprint 4.3: `src/pages/api/booking/create-hold.ts` Integration
```typescript
const parsed = createHoldSchema.safeParse(body);
if (!parsed.success) {
  const issue = parsed.error.issues[0];
  const message = issue ? issue.message : 'Invalid booking payload';
  return errorResponse(message, 400, 'INVALID_PAYLOAD');
}
```

### Blueprint 4.4: `src/components/booking/BookingWizard.tsx` Integration
```tsx
import { validateVehicleRegistration } from '../../lib/vehicle-registration';

// In component:
const regValidation = useMemo(
  () => validateVehicleRegistration(registration, locale),
  [registration, locale]
);

// In Step 5 (or Step 2 in M3):
<label style={{ display: 'grid', gap: '.35rem' }}>
  {labels.registration}
  <input
    style={{
      minHeight: 52,
      width: '100%',
      borderColor: registration.trim().length > 0 && !regValidation.valid ? '#a12622' : undefined,
    }}
    value={registration}
    onChange={(event) => setRegistration(event.target.value.toUpperCase())}
    placeholder={hindi ? 'जैसे DL 01 AB 1234 या 22 BH 1234 AA' : 'e.g. DL 01 AB 1234 or 22 BH 1234 AA'}
    aria-invalid={registration.trim().length > 0 && !regValidation.valid}
    aria-describedby="reg-error"
  />
</label>
{registration.trim().length > 0 && !regValidation.valid && (
  <p id="reg-error" role="alert" style={{ color: '#a12622', fontSize: '.85rem', margin: '.2rem 0 0' }}>
    {regValidation.error}
  </p>
)}

// Button disable condition:
disabled={busy || !category || ... || !regValidation.valid || !selectedSlot}
```

### Blueprint 4.5: `src/components/admin/ReceptionDashboard.tsx` & `/api/admin/manual-bookings.ts`
- **Component**:
  ```tsx
  import { validateVehicleRegistration } from '../../lib/vehicle-registration';

  const regValidation = useMemo(
    () => validateVehicleRegistration(registration, locale),
    [registration, locale]
  );
  ```
  Render error inline and disable submit button if `!regValidation.valid`.
- **API**: Use `vehicleRegistrationField` in `schema`.

### Blueprint 4.6: `src/components/admin/RegisterConsole.tsx` & `/api/admin/register.ts`
- **Component**: Add `regValidation` check for `registration` input with inline error feedback.
- **API**: Schema validates via `vehicleRegistrationField`. Matching check:
  `normalizeVehicleRegistration(parsed.data.vehicleRegistration) !== booking.registration`

### Blueprint 4.7: `src/lib/utils.ts` & `src/lib/booking-engine.ts`
- In `src/lib/utils.ts`:
  ```typescript
  export { normalizeVehicleRegistration } from './vehicle-registration';
  ```
- In `src/lib/booking-engine.ts`:
  Use the re-exported or directly imported `normalizeVehicleRegistration` so hyphens are stripped and normalized values match DB queries consistently.

---

## 5. Verification Method

1. **Unit Tests (`tests/vehicle-registration.test.ts`)**:
   Run `npm run test` to verify:
   - State series: `DL01AB1234`, `HR26DQ5551`, `UP14A1234`, `MH021234`, `DL1CAA1111` -> `valid: true`, `format: 'STATE_SERIES'`
   - Bharat series: `22BH1234AA`, `21BH0001A`, `24BH5555AB` -> `valid: true`, `format: 'BH_SERIES'`
   - Normalization with spaces/hyphens: `"dl-01 ab 1234"` -> `"DL01AB1234"`, `"22 bh 1234 aa"` -> `"22BH1234AA"`
   - Invalid cases: `""`, `"TESTING"`, `"12AB34CD"`, `"DL@01#1234"`, `"DL01AB123"` -> `valid: false`
   - Bilingual error messages: English vs Hindi
2. **Type Checking**:
   `npm run typecheck` (`astro check`) — must complete with 0 errors across all 14+ files.
3. **Build Validation**:
   `npm run build` — validates both Astro client bundling and Cloudflare Workers SSR output.
4. **Invalidation Conditions**:
   - If `src/lib/vehicle-registration.ts` imports Node-specific modules, client build will fail.
   - If `normalizeVehicleRegistration` retains hyphens, matching in `register.ts` will fail against DB records.
