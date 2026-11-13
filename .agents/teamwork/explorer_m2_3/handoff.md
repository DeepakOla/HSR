# Handoff Report: Booking Hold Creation, Pre-Write Payment Gating, & Public Cylinder Validation

## 1. Observation

### 1.1 Existing Endpoint Flow in `src/pages/api/booking/create-hold.ts`
Direct inspection of `src/pages/api/booking/create-hold.ts` (lines 17–64) reveals the following execution path:
```typescript
17: export const POST: APIRoute = async ({ request, locals }) => {
18:   const env = getRuntimeEnv(locals);
19:   const originError = validateOrigin(request);
20:   if (originError) return originError;
21: 
22:   if (!checkRateLimit(limitKey(request, 'create-hold'), 20, 60_000)) {
23:     return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
24:   }
25: 
26:   const body = await request.json().catch(() => null);
27:   const parsed = createHoldSchema.safeParse(body);
28:   if (!parsed.success) return errorResponse('Invalid booking payload', 400);
29: 
30:   const db = getDb({ locals } as any);
31: 
32:   try {
33:     const result = await createHold(db, { ...parsed.data, source: 'WEB' });
34:     let upiUri: string | null = null;
35:     let upiQrDataUrl: string | null = null;
36: 
37:     if (
38:       result.paymentConfig.vpaId !== 'SETUP_REQUIRED' &&
39:       result.paymentConfig.payeeName !== 'SETUP_REQUIRED' &&
40:       result.pricing.advancePaise != null
41:     ) {
42:       upiUri = buildUpiUrl(result.paymentConfig.vpaId, result.paymentConfig.payeeName, result.pricing.advancePaise, result.bookingCode);
43:       upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 1 });
44:     }
...
58:     return jsonResponse(responsePayload, 201);
```
- **Line 33**: `createHold(db, { ...parsed.data, source: 'WEB' })` is executed immediately after `safeParse`, without checking payment configuration.
- **Lines 37–44**: Only *after* database writes succeed in `createHold` does `create-hold.ts` check `result.paymentConfig.vpaId !== 'SETUP_REQUIRED'`.
- If `vpa_id` or `payeeName` is `'SETUP_REQUIRED'`, empty, or missing, the booking has **already been committed to D1**, a slot has been locked for 15 minutes, audit events are logged, and an idempotency record is created. The endpoint returns HTTP 201 with `upiUri: null`, leaving the customer stranded with an unpayable reservation.

### 1.2 D1 Write Operations in `src/lib/booking-engine.ts`
Direct inspection of `src/lib/booking-engine.ts` (lines 343–385) shows the atomic write transaction:
```typescript
343:   try {
344:     await db.batch([
345:       db.prepare(
346:         'INSERT INTO customers(name, mobile_e164) VALUES(?, ?) ON CONFLICT(mobile_e164) DO UPDATE SET name = excluded.name'
347:       ).bind(input.customerName.trim(), normalizedPhone),
348:       db.prepare(
349:         'INSERT INTO vehicles(registration_normalized, registration_display, vehicle_type) VALUES(?, ?, ?) ON CONFLICT(registration_normalized) DO UPDATE SET registration_display = excluded.registration_display, vehicle_type = excluded.vehicle_type'
350:       ).bind(normalizedReg, input.vehicleRegistration.trim().toUpperCase(), input.vehicleType.trim()),
351:       db.prepare(
352:         `INSERT INTO bookings(...)`
353:       )...,
374:       ...selectedRun.map((allocatedSlot, index) => db.prepare(
375:         'INSERT INTO booking_slot_allocations(booking_id, slot_snapshot_id, ordinal) SELECT id, ?, ? FROM bookings WHERE booking_code = ?'
376:       )...),
377:       db.prepare(
378:         `INSERT INTO booking_audit_events(...)`
379:       )...,
380:       db.prepare(
381:         'INSERT INTO idempotency_keys(idempotency_key, endpoint, response_json, created_at) VALUES(?, ?, ?, ?)'
382:       )...
385:     ]);
```
- Database trigger `bookings_capacity_guard` (`migrations/0005_cylinder_work_units.sql:230-274`) executes `BEFORE INSERT ON bookings`.
- Line 236: The trigger only asserts `NEW.cylinder_count_snapshot < 1 OR NEW.cylinder_count_snapshot > 20`.
- The database permits public bookings up to 20 cylinders if a category exists.

### 1.3 Public Cylinder Count Validation State
- In `src/lib/schemas.ts`:
```typescript
5: export const createHoldSchema = z.object({
6:   locale: localeSchema,
7:   slotSnapshotId: z.number().int().positive(),
8:   categoryId: z.number().int().positive(),
9:   vehicleType: z.string().trim().min(2).max(100),
10:   customerName: z.string().trim().min(2).max(120),
11:   mobile: z.string().trim().min(10).max(20),
12:   vehicleRegistration: z.string().trim().min(4).max(20),
13:   source: z.literal('WEB').default('WEB'),
14:   idempotencyKey: z.string().trim().min(8).max(120),
15: });
```
- `categoryId` is accepted for any positive integer.
- In `migrations/0005_cylinder_work_units.sql` (lines 58–87), categories `CYL_01` through `CYL_12` are seeded as active (`is_active = 1`).
- Therefore, a public caller sending `categoryId` for 7, 8, 9, 10, 11, or 12 cylinders currently passes both schema parsing and `createHold` checks. There is NO server-side enforcement of the public 1–6 cylinder limit.

### 1.4 Vehicle Registration Validation Disconnect
- `src/lib/vehicle-registration.ts` defines `validateVehicleRegistration` and `normalizeVehicleRegistration` with tests in `tests/vehicle-registration.test.ts` (73 tests passing).
- Ripgrep / search across `src/` for `validateVehicleRegistration` returns only line 25 of `src/lib/vehicle-registration.ts`:
  `src\lib\vehicle-registration.ts:25:export function validateVehicleRegistration(`
- Neither `src/pages/api/booking/create-hold.ts`, `src/lib/schemas.ts`, nor `src/lib/booking-engine.ts` imports or calls `validateVehicleRegistration`.
- In `createHoldSchema`, `vehicleRegistration` only requires `z.string().trim().min(4).max(20)`. Arbitrary alphanumeric strings like `"ZZZZ"`, `"1234"`, or `"AAAA9999"` are accepted by the server.

### 1.5 Existing Test Suite Coverage
Running `npm run test` executes Vitest across 9 test files (136 tests passing).
- `tests/` currently contains NO tests for `POST /api/booking/create-hold`.
- There are NO tests asserting pre-write payment gating, zero D1 writes, server-side public cylinder rejection, or vehicle registration enforcement during hold creation.

---

## 2. Logic Chain

1. **Pre-Write Gating Invariant**:
   - Customer booking invariant requires: *"Online booking must not create a payment hold unless the merchant UPI VPA and payee name are also configured and usable... When payment setup is incomplete, show a clear phone/WhatsApp booking route and do not create a customer hold that has no usable payment instructions."*
   - In `migrations/0001_init.sql` (lines 18–19), default values for `vpa_id` and `vpa_payee_name` in `business_settings` are `'SETUP_REQUIRED'`.
   - If an online user books while `vpa_id` or `vpa_payee_name` is `'SETUP_REQUIRED'`, `null`, empty `""`, or whitespace-only, creating a hold in D1 locks physical workshop capacity for 15 minutes (`hold_expires_at`) without allowing the customer to complete payment.
   - Therefore, a read-only query to `business_settings` MUST occur before ANY `db.batch` write.
   - If `!vpa_id || vpa_id === 'SETUP_REQUIRED' || !vpa_payee_name || vpa_payee_name === 'SETUP_REQUIRED'`, the request MUST fail-closed immediately with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE`.
   - Because this check runs prior to `createHold`, ZERO D1 rows are inserted into `customers`, `vehicles`, `bookings`, `booking_slot_allocations`, `booking_audit_events`, or `idempotency_keys`.

2. **Public Cylinder Boundary Invariant**:
   - Customer feedback Section 5.2 states: *"The public customer dropdown must contain: 1 to 6 cylinders, and More than 6... Do not merely hide options in React. Enforce the public limit in the public API and server-side booking validation as well."*
   - In `create-hold.ts`, the request source is `WEB`.
   - Looking up `category_id` in `vehicle_categories` reveals `cylinder_count`.
   - If `source === 'WEB'` and `cylinder_count > 6`, the server MUST reject the request immediately with HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` and provide the contact card for phone/WhatsApp booking.
   - Conversely, receptionist routes in `src/pages/api/admin/manual-bookings.ts` (`source === 'PHONE' | 'WHATSAPP' | 'WALKIN'`) retain authorization for `1–12` cylinders without triggering this rejection.

3. **Server-Side Vehicle Registration Validation**:
   - Customer feedback Section 5.5 states: *"The vehicle registration field must not accept arbitrary text... Keep the server as the final authority; browser-only validation is not sufficient."*
   - `validateVehicleRegistration(value, locale)` checks against `STATE_SERIES_REGEX` (`/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/`) and `BH_SERIES_REGEX` (`/^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/`).
   - Integrating `validateVehicleRegistration` directly in `create-hold.ts` ensures any malformed registration is rejected with HTTP 400 `INVALID_VEHICLE_REGISTRATION` and returns a localized error message (`locale === 'hi' ? ... : ...`).
   - Adding defence-in-depth inside `createHold` in `booking-engine.ts` ensures internal channels and future callers cannot bypass registration validation.

---

## 3. Caveats

1. **Idempotency Execution Order**:
   - If an idempotency key was previously processed and stored in `idempotency_keys`, `createHold` returns the cached response. However, pre-write payment gating and registration validation must run *before* any new write is attempted. Since pre-write checks are deterministic, checking them first ensures malformed or unpayable requests never enter the idempotency table.
2. **Contact Fallback Values**:
   - In `business_settings`, `contact_phone` and `whatsapp_number` default to `'SETUP_REQUIRED'` in `0001_init.sql`, but migration `0006_flat_advance.sql` sets them to `+919910055355`. When building the structured error payload, code must fall back to `+919910055355` if `business_settings` contains null, empty, or `'SETUP_REQUIRED'`.
3. **Advance Amount in M2**:
   - When migration `0006_flat_advance.sql` adds `business_settings.flat_advance_paise = 50000`, `createHold` must use `settings.flat_advance_paise` (flat ₹500) rather than `categoryRow.advancePaise` (which is null in migration 0005).

---

## 4. Conclusion & Actionable Specification

### 4.1 Architecture & Flow Specification for `src/pages/api/booking/create-hold.ts`

The updated request pipeline for `POST /api/booking/create-hold` must execute in the following strict order:

```
[Incoming Request]
       │
       ▼
1. validateOrigin(request) ────────────────► [403 CSRF_PROHIBITED]
       │
       ▼
2. checkRateLimit(...) ────────────────────► [429 RATE_LIMITED]
       │
       ▼
3. parse JSON & createHoldSchema ──────────► [400 BAD_REQUEST]
       │
       ▼
4. validateVehicleRegistration(...) ───────► [400 INVALID_VEHICLE_REGISTRATION]
       │
       ▼
5. getDb & getBusinessSettings (read-only)
   Check vpa_id & vpa_payee_name ──────────► [422 ONLINE_PAYMENT_UNAVAILABLE]
   (is null, empty, or 'SETUP_REQUIRED')     (Includes phone/WhatsApp contact)
       │                                     (ZERO D1 WRITES)
       ▼
6. Query vehicle_categories (read-only)
   Check cylinderCount > 6 ────────────────► [400 PUBLIC_CYLINDER_LIMIT_EXCEEDED]
   (for source === 'WEB')                    (Includes phone/WhatsApp contact)
       │                                     (ZERO D1 WRITES)
       ▼
7. createHold(db, { ...parsed.data, vehicleRegistration: normalized, source: 'WEB' })
   - Double-check consecutive work-units
   - db.batch([customers, vehicles, bookings, allocations, audit, idempotency])
   - Return 201 Created with UPI QR & payment details
```

### 4.2 Exact Code Specification for `create-hold.ts`

```typescript
// Proposed implementation structure for src/pages/api/booking/create-hold.ts
import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { createHold } from '../../../lib/booking-engine';
import { getBusinessSettings, getDb, querySingle } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { createHoldSchema } from '../../../lib/schemas';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateVehicleRegistration } from '../../../lib/vehicle-registration';

const DEFAULT_SUPPORT_PHONE = '+919910055355';
const DEFAULT_SUPPORT_WHATSAPP = '+919910055355';

function buildUpiUrl(pa: string, pn: string, amountPaise: number | null, bookingCode: string) {
  const params = new URLSearchParams({ pa, pn, cu: 'INR', tn: bookingCode });
  if (amountPaise != null) params.set('am', (amountPaise / 100).toFixed(2));
  return `upi://pay?${params.toString()}`;
}

function resolveContact(settings: { contact_phone?: string; whatsapp_number?: string }) {
  const phone = settings.contact_phone && settings.contact_phone !== 'SETUP_REQUIRED' && settings.contact_phone.trim() !== ''
    ? settings.contact_phone.trim()
    : DEFAULT_SUPPORT_PHONE;
  const whatsapp = settings.whatsapp_number && settings.whatsapp_number !== 'SETUP_REQUIRED' && settings.whatsapp_number.trim() !== ''
    ? settings.whatsapp_number.trim()
    : DEFAULT_SUPPORT_WHATSAPP;
  const cleanDigits = whatsapp.replace(/\D/g, '');
  return {
    phone,
    whatsapp,
    whatsappUrl: `https://wa.me/${cleanDigits}`,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'create-hold'), 20, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = await request.json().catch(() => null);
  const parsed = createHoldSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid booking payload', 400);

  const { locale, vehicleRegistration, categoryId } = parsed.data;

  // 1. Vehicle Registration Validation & Normalization
  const regResult = validateVehicleRegistration(vehicleRegistration, locale);
  if (!regResult.valid) {
    return errorResponse(
      regResult.error || (locale === 'hi' ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'),
      400,
      'INVALID_VEHICLE_REGISTRATION'
    );
  }

  const db = getDb({ locals } as any);

  // 2. Pre-Write Payment Gate (Zero D1 writes if payment is unavailable)
  const settings = await getBusinessSettings(db);
  const vpaId = settings.vpa_id?.trim();
  const payeeName = settings.vpa_payee_name?.trim();
  const isPaymentConfigured = !!vpaId && vpaId !== 'SETUP_REQUIRED' && !!payeeName && payeeName !== 'SETUP_REQUIRED';

  if (!isPaymentConfigured) {
    const contact = resolveContact(settings);
    const message = locale === 'hi'
      ? 'ऑनलाइन अग्रिम भुगतान वर्तमान में सेटअप किया जा रहा है। कृपया फ़ोन या व्हाट्सएप द्वारा अपॉइंटमेंट बुक करें।'
      : 'Online advance payment is currently being configured. Please book your appointment by phone or WhatsApp.';

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'ONLINE_PAYMENT_UNAVAILABLE',
          message,
        },
        contact,
      }),
      {
        status: 422,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }
    );
  }

  // 3. Server-Side Public Cylinder Limit (Max 6 for source === 'WEB')
  const categoryRow = await querySingle<{ id: number; cylinderCount: number }>(
    db,
    'SELECT id, cylinder_count AS cylinderCount FROM vehicle_categories WHERE id = ? AND is_active = 1',
    [categoryId]
  ).catch(() => null);

  if (!categoryRow) {
    return errorResponse(locale === 'hi' ? 'अमान्य वाहन श्रेणी' : 'Invalid vehicle category', 400, 'INVALID_CATEGORY');
  }

  if (categoryRow.cylinderCount > 6) {
    const contact = resolveContact(settings);
    const message = locale === 'hi'
      ? 'ऑनलाइन बुकिंग अधिकतम 6 सिलेंडरों तक सीमित है। 6 से अधिक सिलेंडरों के लिए कृपया केंद्र से सीधे संपर्क करें।'
      : 'Online self-service booking is limited to a maximum of 6 cylinders. For more than 6 cylinders, please contact our centre directly.';

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PUBLIC_CYLINDER_LIMIT_EXCEEDED',
          message,
        },
        contact,
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }
    );
  }

  // 4. Atomic D1 Hold Creation
  try {
    const result = await createHold(db, {
      ...parsed.data,
      vehicleRegistration: regResult.normalized,
      source: 'WEB',
    });

    let upiUri: string | null = null;
    let upiQrDataUrl: string | null = null;

    if (result.pricing.advancePaise != null) {
      upiUri = buildUpiUrl(result.paymentConfig.vpaId, result.paymentConfig.payeeName, result.pricing.advancePaise, result.bookingCode);
      upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 1 });
    }

    const responsePayload = {
      ...result,
      upiUri,
      upiQrDataUrl,
      uploadEnabled: result.paymentConfig.r2Enabled && !!env.EVIDENCE_BUCKET,
      uploadUnavailableReason: result.paymentConfig.r2Enabled && env.EVIDENCE_BUCKET
        ? null
        : locale === 'en'
          ? 'Website screenshot upload is not configured. Use the full UTR/reference number or WhatsApp fallback.'
          : 'वेबसाइट स्क्रीनशॉट अपलोड कॉन्फ़िगर नहीं है। पूरा UTR/रेफरेंस नंबर या WhatsApp विकल्प उपयोग करें।',
    };

    return jsonResponse(responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create hold';
    const status = /capacity_exceeded|no longer has enough consecutive|not available|closed/i.test(message) ? 409 : 400;
    return errorResponse(message, status, status === 409 ? 'CAPACITY_CONFLICT' : 'HOLD_FAILED');
  }
};
```

### 4.3 Defence-in-Depth in `src/lib/booking-engine.ts`

In `createHold(db, input: CreateHoldInput)`:
1. **Validate registration**:
   ```typescript
   const regResult = validateVehicleRegistration(input.vehicleRegistration, input.locale);
   if (!regResult.valid) {
     throw new Error(regResult.error || 'Invalid vehicle registration number');
   }
   const normalizedReg = regResult.normalized;
   ```
2. **Enforce public cylinder cap**:
   ```typescript
   if (input.source === 'WEB' && categoryRow.cylinderCount > 6) {
     throw new Error('PUBLIC_CYLINDER_LIMIT_EXCEEDED: Online self-service booking is limited to a maximum of 6 cylinders.');
   }
   ```
3. **Enforce payment gate on WEB**:
   ```typescript
   if (input.source === 'WEB') {
     const vpaId = settings.vpa_id?.trim();
     const payeeName = settings.vpa_payee_name?.trim();
     if (!vpaId || vpaId === 'SETUP_REQUIRED' || !payeeName || payeeName === 'SETUP_REQUIRED') {
       throw new Error('ONLINE_PAYMENT_UNAVAILABLE: Online payments are currently being configured.');
     }
   }
   ```
4. **Flat ₹500 advance integration** (from `business_settings.flat_advance_paise`):
   ```typescript
   const advancePaise = input.source === 'WEB'
     ? (settings.flat_advance_paise ?? 50000)
     : (categoryRow.advancePaise ?? settings.flat_advance_paise ?? 50000);
   const balancePaise = totalPricePaise - advancePaise;
   ```

---

## 5. Verification Method

### 5.1 Test Suite Specification: `tests/booking-hold.test.ts`
Implement `tests/booking-hold.test.ts` with the following test cases:

#### Test Matrix

| # | Group | Test Case Description | Expected Result |
|---|---|---|---|
| 1 | **Pre-Write Payment Gate** | `vpa_id = 'SETUP_REQUIRED'`, `vpa_payee_name = 'SETUP_REQUIRED'` | HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE`, contact card returned |
| 2 | **Pre-Write Payment Gate** | `vpa_id = ''` or whitespace, valid payee name | HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` |
| 3 | **Pre-Write Payment Gate** | Valid `vpa_id`, `vpa_payee_name = 'SETUP_REQUIRED'` | HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` |
| 4 | **Pre-Write Zero DB Writes** | Verify database state after payment gate rejection | `SELECT COUNT(*) FROM bookings` == 0<br>`SELECT COUNT(*) FROM booking_slot_allocations` == 0<br>`SELECT COUNT(*) FROM customers` == 0<br>`SELECT COUNT(*) FROM vehicles` == 0 |
| 5 | **Pre-Write Payment Gate (Success)** | Configured UPI (`hsr@okaxis`, `HSR`) | Passes gate; hold created with HTTP 201, valid `upiUri` and `upiQrDataUrl` |
| 6 | **Public Cylinder Limit** | Public request (`source: 'WEB'`) with 1, 2, 4, 6 cylinders | HTTP 201 Created |
| 7 | **Public Cylinder Limit** | Public request (`source: 'WEB'`) tampering with 7 cylinders | HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED`, Zero D1 writes, contact card returned |
| 8 | **Public Cylinder Limit** | Public request (`source: 'WEB'`) tampering with 8, 10, 12 cylinders | HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED` |
| 9 | **Reception Exemption** | Receptionist request (`source: 'PHONE'`) with 7–12 cylinders | HTTP 201 Created (allowed up to 12) |
| 10 | **Registration Validation** | Standard plate `DL01AB1234`, `HR26DQ5551` | HTTP 201, stored uppercase normalized |
| 11 | **Registration Validation** | Bharat series `22BH1234AA`, `21BH9999Z` | HTTP 201, recognized format |
| 12 | **Registration Validation** | Delimited input `dl 01 ab 1234`, `hr-26-dq-5551` | Normalized to `DL01AB1234` / `HR26DQ5551` |
| 13 | **Registration Validation** | Invalid registrations `GARBAGE123`, `1234`, `DL@01#1234`, `DL1` | HTTP 400 `INVALID_VEHICLE_REGISTRATION`, Zero D1 writes |
| 14 | **Flat ₹500 Advance** | 1 cylinder (₹2,950 total) | Advance = ₹500, Balance = ₹2,450 |
| 15 | **Flat ₹500 Advance** | 2 cylinders (₹5,900 total) | Advance = ₹500, Balance = ₹5,400 |
| 16 | **Flat ₹500 Advance** | 4 cylinders (₹11,800 total) | Advance = ₹500, Balance = ₹11,300 |
| 17 | **Atomic Concurrency** | Two concurrent requests for the same slot run | First succeeds (201), second fails (409 `CAPACITY_CONFLICT`) |

### 5.2 Verification Commands
```powershell
# 1. Run unit and integration tests
npm run test

# 2. Verify TypeScript strict type-checking across Astro routes and lib
npm run typecheck

# 3. Verify production build bundling
npm run build
```

### 5.3 Invalidation Conditions
- If any D1 table (`bookings`, `customers`, `vehicles`, `booking_slot_allocations`, `idempotency_keys`) receives a row when `vpa_id` or `vpa_payee_name` is missing or `'SETUP_REQUIRED'`.
- If a web request with `cylinderCount > 6` returns HTTP 201 or creates a booking.
- If a receptionist request with `cylinderCount = 8` returns HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED`.
- If an invalid vehicle registration like `"GARBAGE123"` succeeds in creating a booking hold.
