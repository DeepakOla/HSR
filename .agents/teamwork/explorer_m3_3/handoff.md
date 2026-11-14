# Handoff Report: Registration Validation, Pricing Breakdown & API Contract Specification

**Agent**: Explorer M3-3 (Registration Validation & Pricing Breakdown Explorer)  
**State Folder**: `.agents/teamwork/explorer_m3_3/`  
**Target Milestone**: M3 — Customer Booking Flow Enhancement  
**Date**: 2026-11-13  

---

## 1. Observation

Direct code and architectural observations were collected from the local codebase:

### 1.1 Vehicle Registration Field in `src/components/booking/BookingWizard.tsx`
- **Line 66**: Current state is an unvalidated string:
  ```typescript
  const [registration, setRegistration] = useState('');
  ```
- **Line 356**: Current input rendering:
  ```tsx
  <label style={{ display: 'grid', gap: '.35rem' }}>
    {labels.registration}
    <input
      style={{ minHeight: 52, width: '100%' }}
      value={registration}
      onChange={(event) => setRegistration(event.target.value.toUpperCase())}
    />
  </label>
  ```
- **Line 366**: Submission disabled condition only checks coarse character length (`registration.trim().length < 4`):
  ```tsx
  disabled={busy || !category || category.advancePaise == null || category.advancePaise <= 0 || name.trim().length < 2 || mobile.length !== 10 || registration.trim().length < 4 || !selectedSlot}
  ```
- **Observations on Gaps**:
  1. No client-side format validation occurs on change or blur. Arbitrary strings like `"ABCD"`, `"123456"`, or `"NOT A REG"` pass client checks and only fail on server round-trip.
  2. No inline validation error message container (`<span role="alert">`) is rendered adjacent to the input.
  3. No ARIA attributes (`aria-invalid`, `aria-describedby`) are present for screen reader accessibility.
  4. No normalization or format guidance is presented to the user.

### 1.2 `src/lib/vehicle-registration.ts` Contract & Capabilities
- **Lines 10-11**: Pre-compiled regex patterns for Indian State/UT series and Bharat (BH) series:
  ```typescript
  export const STATE_SERIES_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
  export const BH_SERIES_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
  ```
- **Lines 17-19**: Normalization function removes all whitespace, hyphens, and non-alphanumeric characters:
  ```typescript
  export function normalizeVehicleRegistration(value: string): string {
    return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  ```
- **Lines 25-67**: `validateVehicleRegistration(value: string, locale?: 'en' | 'hi'): VehicleRegistrationResult`
  - Validates both `STATE_SERIES` and `BH_SERIES`.
  - Returns localized error strings for required and invalid format in English and Hindi.
  - Pure TypeScript with zero Node.js/Cloudflare dependencies; directly importable into React components.
  - Fully tested by `tests/vehicle-registration.test.ts` (73 passing tests).

### 1.3 Pricing Structure & Invariants in `src/lib/pricing.ts` and Database Migrations
- **`src/lib/pricing.ts` (lines 34-53)**:
  ```typescript
  export function calculateBookingPrice(
    basePricePaise: number,
    flatAdvancePaise: number
  ): BookingPriceBreakdown {
    const price = calculateServicePrice(basePricePaise);
    return {
      ...price,
      advancePaise: flatAdvancePaise,
      balancePaise: price.totalPricePaise - flatAdvancePaise,
    };
  }
  ```
- **Database Migrations**:
  - `migrations/0005_cylinder_work_units.sql` (lines 63-76): Seeds `base_price_paise = 250000 * n` (₹2,500/cylinder) and `gst_rate_bps = 1800` (18%).
  - `migrations/0006_flat_advance.sql` (line 2): Adds `business_settings.flat_advance_paise INTEGER NOT NULL DEFAULT 50000` (₹500 flat advance).
- **Current `BookingWizard.tsx` Pricing Display Gaps**:
  - **Step 3 (lines 301-310)**: Displays Base, GST, Total, Advance, and Balance, but without clear calculation multiplier hints (`₹2,500 × n`).
  - **Step 5 (lines 357-362)**: **Crucial bug**: Only displays Base, GST, Total, and Advance. **The Balance row is completely omitted!**
    ```tsx
    {category && <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
      <p>{labels.price}: {inr(category.basePricePaise)}</p>
      <p>{labels.gst}: {inr(category.gstPaise)}</p>
      <p><strong>{labels.total}: {inr(category.totalPaise)}</strong></p>
      <p>{labels.advance}: {inr(category.advancePaise)}</p>
    </div>}
    ```
  - **Booking Result (lines 378-382)**: Displays Base, GST, Total, Advance, and Balance from `result.pricing`, but uses inconsistent property naming (`result.pricing.gstAmountPaise` vs `category.gstPaise`).

### 1.4 API Contract in `src/pages/api/booking/create-hold.ts` & `src/lib/schemas.ts`
- **Schema (`src/lib/schemas.ts`, lines 5-15)**:
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
- **`BookingWizard.tsx` submission payload (lines 172-182)**:
  - Passes: `locale`, `slotSnapshotId`, `categoryId`, `vehicleType`, `customerName`, `mobile`, `vehicleRegistration`, `source: 'WEB'`, `idempotencyKey`.
  - **Identified Edge Case**: When `vehicleClass === 'Other'`, if `vehicleModel` is left blank, `vehicleDescription` evaluates to `""`, causing a validation failure on `vehicleType.min(2)`.
  - **Server-Side Enforcement**: `create-hold.ts` strictly validates registration via `validateVehicleRegistration`, enforces max 6 cylinders for `source === 'WEB'`, and fails closed with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` if UPI configuration is missing.

### 1.5 Local Verification Command Execution
- Command executed: `npm run test`
- Result: **12 test suites passed, 281 tests passed** (including `pricing.test.ts`, `vehicle-registration.test.ts`, `booking-hold.test.ts`, `challenger-m2.test.ts`, `adversarial-m2.test.ts`).

---

## 2. Logic Chain

From the observations above, the design specifications are established step by step:

### 2.1 Vehicle Registration Specification (Step 5)
1. **Auto-Uppercase on Input**:
   - In `onChange`, immediately convert entered characters to uppercase: `const upper = event.target.value.toUpperCase();`.
   - Allow user to enter spaces or hyphens naturally (e.g. `DL 01 AB 1234` or `DL-01-AB-1234` or `22 BH 1234 AA`). Do not aggressively strip delimiters while typing, as doing so disrupts cursor position.
2. **Validation on Blur & Change**:
   - Maintain `regTouched: boolean` and `regError: string` state.
   - On `onBlur`: Set `regTouched = true`. Run `validateVehicleRegistration(registration, locale)`. If `!result.valid`, set `regError = result.error`. If valid, clear `regError`.
   - On `onChange`: If `regTouched` is already true, re-validate immediately so that as soon as the user corrects the format, the error disappears.
3. **Inline Error Display & Accessibility**:
   - Input attributes:
     - `aria-invalid={Boolean(regTouched && regError)}`
     - `aria-describedby={regTouched && regError ? "reg-error-msg" : "reg-hint-msg"}`
     - Visual border: high-contrast red (`#DC2626`) when invalid.
   - Render format hint beneath input:
     - English: `Format: State series (e.g. DL01AB1234) or Bharat series (e.g. 22BH1234AA)`
     - Hindi: `प्रारूप: राज्य श्रृंखला (उदा. DL01AB1234) या भारत श्रृंखला (उदा. 22BH1234AA)`
   - Render error message beneath input when invalid:
     - `<p id="reg-error-msg" role="alert" style={{ color: '#DC2626', fontSize: '.85rem', marginTop: '.25rem', fontWeight: 600 }}>{regError}</p>`
4. **Submission Gating**:
   - Submit button disabled condition must evaluate:
     `!validateVehicleRegistration(registration, locale).valid`
   - In `createHold()` function, execute pre-check:
     ```typescript
     const regResult = validateVehicleRegistration(registration, locale);
     if (!regResult.valid) {
       setRegTouched(true);
       setRegError(regResult.error || (hindi ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'));
       return;
     }
     ```
   - Send `vehicleRegistration: regResult.normalized` (or trimmed value) in the JSON payload.

### 2.2 Synchronized Pricing Breakdown Specification

The pricing formula is fixed and single-sourced:
- **Base Service Price**: ₹2,500 × cylinders (`250000 * cylinderCount` paise)
- **GST (18%)**: ₹450 × cylinders (`45000 * cylinderCount` paise)
- **Total Amount**: ₹2,950 × cylinders (`295000 * cylinderCount` paise)
- **Temporary Advance**: Flat ₹500 (`business_settings.flat_advance_paise = 50000` paise)
- **Remaining Balance**: Total - Advance (`totalPaise - advancePaise`)

#### Mandatory Matrix for Online Booking (1 to 6 Cylinders):
| Cylinders | Base Price | GST (18%) | Total Amount | Flat Advance | Balance (At Centre) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1 cylinder** | ₹2,500 | ₹450 | ₹2,950 | **₹500** | **₹2,450** |
| **2 cylinders** | ₹5,000 | ₹900 | ₹5,900 | **₹500** | **₹5,400** |
| **3 cylinders** | ₹7,500 | ₹1,350 | ₹8,850 | **₹500** | **₹8,350** |
| **4 cylinders** | ₹10,000 | ₹1,800 | ₹11,800 | **₹500** | **₹11,300** |
| **5 cylinders** | ₹12,500 | ₹2,250 | ₹14,750 | **₹500** | **₹14,250** |
| **6 cylinders** | ₹15,000 | ₹2,700 | ₹17,700 | **₹500** | **₹17,200** |

#### Step-by-Step Display Requirements:
1. **Step 3 (Cylinder Count)**:
   - Immediately below cylinder selection, display a dedicated pricing summary card showing:
     - Base Service Price: `₹2,500 × {n} = ₹{base}`
     - GST (18%): `₹450 × {n} = ₹{gst}`
     - Total Amount: `₹2,950 × {n} = ₹{total}`
     - Temporary Advance: `₹500` (flat per booking)
     - Remaining Balance: `₹{balance}` (payable at centre)
2. **Step 5 (Customer Details & Confirmation)**:
   - Fix missing balance! Display the exact same 5-row breakdown in the confirmation box before the "Create booking" CTA.
3. **Booking Result (Confirmation & Payment Hold)**:
   - Display the exact same 5-row breakdown from `result.pricing`:
     - Base Service Price: `inr(result.pricing.basePricePaise)`
     - GST (18%): `inr(result.pricing.gstAmountPaise)`
     - Total Amount: `inr(result.pricing.totalPricePaise)`
     - Temporary Advance: `inr(result.pricing.advancePaise)`
     - Balance (Payable at centre): `inr(result.pricing.balancePaise)`

### 2.3 API Payload Alignment & Defensive Hardening
1. **Payload Structure for `POST /api/booking/create-hold`**:
   ```typescript
   {
     locale: 'en' | 'hi',
     slotSnapshotId: selectedSlot.slotSnapshotId,
     categoryId: category.id,
     vehicleType: vehicleDescription, // Guarantees min(2) chars
     customerName: name.trim(),      // Guarantees min(2) chars
     mobile: mobile.trim(),          // Exactly 10 digits
     vehicleRegistration: regResult.normalized, // Normalized e.g. DL01AB1234
     source: 'WEB',
     idempotencyKey: idempotencyKey, // UUID
   }
   ```
2. **Vehicle Description Defensive Fallback**:
   - Ensure `vehicleDescription` never resolves to an empty string:
     ```typescript
     const vehicleDescription = vehicleClass === 'Other'
       ? (vehicleModel.trim() || 'Other')
       : (vehicleModel.trim() ? `${vehicleClass} - ${vehicleModel.trim()}` : vehicleClass);
     ```
3. **Handling Server Payment & Gating Errors**:
   - If the server responds with HTTP 422 `ONLINE_PAYMENT_UNAVAILABLE` or HTTP 400 `PUBLIC_CYLINDER_LIMIT_EXCEEDED`, capture the returned `contact` object (`{ phone, whatsapp, whatsappUrl }`).
   - Render an interactive contact support card instead of generic error text:
     - Click-to-call button (`tel:+919910055355`)
     - WhatsApp chat link (`https://wa.me/919910055355`)

### 2.4 Bilingual (EN / HI) Dictionary Alignment
Expand `labels` in `BookingWizard.tsx` to include full bilingual support:

| Key | English (`en`) | Hindi (`hi`) |
|---|---|---|
| `registration` | Vehicle Registration Number | वाहन पंजीकरण संख्या |
| `regPlaceholder` | e.g. DL01AB1234 or 22BH1234AA | उदा. DL01AB1234 या 22BH1234AA |
| `regHint` | Format: State series (DL01AB1234) or Bharat series (22BH1234AA) | प्रारूप: राज्य श्रृंखला (DL01AB1234) या भारत श्रृंखला (22BH1234AA) |
| `price` | Base Service Price | मूल सेवा शुल्क |
| `gst` | GST (18%) | जीएसटी / GST (18%) |
| `total` | Total Amount | कुल राशि |
| `advance` | Temporary Advance (Flat) | अस्थायी अग्रिम राशि (फ्लैट) |
| `balance` | Remaining Balance (Payable at Centre) | शेष देय राशि (केंद्र पर देय) |
| `pricingNotice` | * Flat ₹500 advance required to secure hold. Remaining balance is payable at centre upon arrival. | * स्लॉट सुरक्षित करने के लिए ₹500 फ्लैट अग्रिम आवश्यक है। शेष राशि आगमन पर केंद्र में देय है। |
| `callCenter` | Call Support | कॉल करें |
| `whatsappCenter` | WhatsApp Support | व्हाट्सएप करें |

---

## 3. Caveats

1. **Configurable Advance Amount**:
   - Although the current default is flat ₹500 (`50000` paise), the database and API allow the owner to change `business_settings.flat_advance_paise`.
   - The UI must NOT hardcode the number `500` into math calculations in the React island; it must always use `category.advancePaise` returned by `/api/public/vehicle-categories` or `config.flatAdvancePaise`.
2. **Client Validation vs Server Enforcement**:
   - Client-side validation in `BookingWizard.tsx` enhances UX by preventing invalid round-trips.
   - However, server-side validation in `create-hold.ts` is the non-negotiable security boundary. Tampering or bypassing client validation will be stopped by HTTP 400 `INVALID_VEHICLE_REGISTRATION`.
3. **Delimiter Preservation vs Normalization**:
   - While typing, users should be allowed to enter hyphens and spaces (e.g., `DL-01 AB 1234`).
   - Normalization removes non-alphanumeric characters for regex testing and payload delivery (`DL01AB1234`).
4. **Idempotency Lifecycle**:
   - `idempotencyKey` persists for the component lifecycle. If a hold attempt fails with a 409 conflict (slot taken), the user selects a new time; a new idempotency key should ideally be generated so subsequent attempts are not confused with prior requests.

---

## 4. Conclusion & Concrete Implementation Blueprint

The implementer agent for M3 should apply the following precise updates to `src/components/booking/BookingWizard.tsx`:

### 4.1 Import and State Additions
```tsx
// Add import at top of BookingWizard.tsx:
import { validateVehicleRegistration, normalizeVehicleRegistration } from '../../lib/vehicle-registration';

// In BookingWizard component body, add:
const [regTouched, setRegTouched] = useState(false);
const [regError, setRegError] = useState('');
const [serverContact, setServerContact] = useState<{ phone: string; whatsapp: string; whatsappUrl: string } | null>(null);
```

### 4.2 Registration Event Handlers
```tsx
const handleRegistrationChange = (value: string) => {
  const upper = value.toUpperCase();
  setRegistration(upper);
  if (regTouched) {
    const result = validateVehicleRegistration(upper, locale);
    setRegError(result.valid ? '' : (result.error ?? ''));
  }
};

const handleRegistrationBlur = () => {
  setRegTouched(true);
  const result = validateVehicleRegistration(registration, locale);
  setRegError(result.valid ? '' : (result.error ?? ''));
};
```

### 4.3 Reusable Pricing Card Component / Block
Extract or render consistently in Steps 3, 5, and Result:
```tsx
interface PricingCardProps {
  basePaise: number;
  gstPaise: number;
  totalPaise: number;
  advancePaise: number;
  balancePaise: number;
  cylinders: number;
  labels: Record<string, string>;
  hindi: boolean;
}

function PricingBreakdownCard({
  basePaise, gstPaise, totalPaise, advancePaise, balancePaise, cylinders, labels, hindi
}: PricingCardProps) {
  return (
    <div className="card" style={{ padding: '1rem', marginTop: '1rem', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px' }}>
      <h4 style={{ margin: '0 0 .5rem 0', fontSize: '1rem', color: '#0F172A' }}>
        {hindi ? 'मूल्य विवरण' : 'Pricing Breakdown'} ({cylinders} {hindi ? 'सिलेंडर' : cylinders === 1 ? 'cylinder' : 'cylinders'})
      </h4>
      <div style={{ display: 'grid', gap: '.35rem', fontSize: '.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{labels.price} <small style={{ color: '#64748B' }}>(₹2,500 × {cylinders})</small>:</span>
          <span>{inr(basePaise)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{labels.gst} <small style={{ color: '#64748B' }}>(₹450 × {cylinders})</small>:</span>
          <span>{inr(gstPaise)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #E2E8F0', paddingTop: '.35rem' }}>
          <span>{labels.total}:</span>
          <span>{inr(totalPaise)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1E40AF', fontWeight: 600 }}>
          <span>{labels.advance}:</span>
          <span>{inr(advancePaise)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0F172A', fontWeight: 700, borderTop: '1px dashed #CBD5E1', paddingTop: '.35rem' }}>
          <span>{labels.balance}:</span>
          <span>{inr(balancePaise)}</span>
        </div>
      </div>
      <p style={{ margin: '.5rem 0 0 0', fontSize: '.78rem', color: '#64748B' }}>
        {labels.pricingNotice}
      </p>
    </div>
  );
}
```

### 4.4 Step 5 Registration Field Markup
```tsx
<label style={{ display: 'grid', gap: '.35rem' }}>
  <span>{labels.registration} <span style={{ color: '#DC2626' }}>*</span></span>
  <input
    style={{
      minHeight: 52,
      width: '100%',
      padding: '.5rem .75rem',
      borderRadius: '6px',
      border: regTouched && regError ? '2px solid #DC2626' : '1px solid #CBD5E1',
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
    }}
    value={registration}
    placeholder={labels.regPlaceholder}
    aria-invalid={Boolean(regTouched && regError)}
    aria-describedby={regTouched && regError ? 'reg-error-msg' : 'reg-hint-msg'}
    onChange={(event) => handleRegistrationChange(event.target.value)}
    onBlur={handleRegistrationBlur}
    autoCapitalize="characters"
    spellCheck={false}
  />
  {regTouched && regError ? (
    <p id="reg-error-msg" role="alert" style={{ color: '#DC2626', fontSize: '.85rem', margin: '.2rem 0 0 0', fontWeight: 600 }}>
      {regError}
    </p>
  ) : (
    <p id="reg-hint-msg" style={{ color: '#64748B', fontSize: '.8rem', margin: '.2rem 0 0 0' }}>
      {labels.regHint}
    </p>
  )}
</label>
```

### 4.5 Hardened `createHold` Payload & Contact Card Handling
```tsx
const createHold = async () => {
  if (!category || !selectedSlot || busy) return;
  
  // 1. Client-side registration check
  const regResult = validateVehicleRegistration(registration, locale);
  if (!regResult.valid) {
    setRegTouched(true);
    setRegError(regResult.error || (hindi ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'));
    return;
  }

  // 2. Safe fallback for vehicleDescription
  const safeVehicleType = vehicleClass === 'Other'
    ? (vehicleModel.trim() || 'Other')
    : (vehicleModel.trim() ? `${vehicleClass} - ${vehicleModel.trim()}` : vehicleClass);

  setBusy(true);
  setMessage('');
  setServerContact(null);

  try {
    const response = await fetch('/api/booking/create-hold', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locale,
        slotSnapshotId: selectedSlot.slotSnapshotId,
        categoryId: category.id,
        vehicleType: safeVehicleType,
        customerName: name.trim(),
        mobile: mobile.trim(),
        vehicleRegistration: regResult.normalized,
        source: 'WEB',
        idempotencyKey,
      }),
    });

    const payload: any = await response.json();
    if (!response.ok) {
      if (payload.contact) {
        setServerContact(payload.contact);
      }
      throw new Error(payload.error?.message ?? 'Could not create booking');
    }
    setResult(payload.data);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'Booking failed. Please retry.');
  } finally {
    setBusy(false);
  }
};
```

---

## 5. Verification Method

To independently verify the implementation:

### 5.1 Automated Test Execution
Run the following commands from workspace root:
```powershell
npm run test
npm run typecheck
npm run build
```
- Expected test result: All 12 test files (281+ tests) passing with 0 errors.
- Type check: `tsc --noEmit` exits with 0 errors.
- Astro build: `astro build` finishes cleanly.

### 5.2 Manual Test Scenarios
1. **Auto-Uppercase**:
   - Type `hr 26 dq 5551` in Step 5 registration input -> input renders uppercase `HR 26 DQ 5551`.
2. **Invalid Registration Detection**:
   - Type `MYCAR1` or `1234` or `ABCD` and blur the field.
   - Verify inline red error displays:
     - English: `"Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)"`
     - Hindi: `"कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)"`
   - Verify "Create booking" button is disabled.
3. **Valid Registration Acceptance**:
   - State series: `DL01AB1234`, `HR26DQ5551`, `UP-32-AB-1234` -> Error clears immediately, submit button enables.
   - Bharat series: `22BH1234AA`, `23 BH 5678 ZZ` -> Error clears immediately, submit button enables.
4. **Pricing Breakdown Parity Across Steps**:
   - Select 2 cylinders.
   - Step 3 verifies: Base = ₹5,000, GST = ₹900, Total = ₹5,900, Advance = ₹500, Balance = ₹5,400.
   - Step 5 verifies: Exact identical figures appear.
   - Confirmation verifies: Exact identical figures appear in booking result.
5. **Gating & Tampering Verification**:
   - If payment configuration is `SETUP_REQUIRED`, submitting hold displays HTTP 422 error card with direct WhatsApp (+91 9910055355) and phone contact links.

### 5.3 Invalidation Conditions
This specification is invalidated if:
- `business_settings` removes `flat_advance_paise` or reverts to a per-cylinder advance without database migration.
- `src/lib/vehicle-registration.ts` modifies its exported interface or function signatures.
- `createHoldSchema` introduces additional required fields not present in this specification.
