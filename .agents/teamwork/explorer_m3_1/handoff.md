# M3-1 UI/UX, Date & Vehicle Step Explorer Handoff Report

## 1. Observation

Direct examination of the codebase and project documentation reveals the following concrete facts:

### 1.1 Step 1 (Date Selection) in `src/components/booking/BookingWizard.tsx`
- **Current date selection handler** (`src/components/booking/BookingWizard.tsx`, lines 149–153):
  ```typescript
  const selectDate = (value: string) => {
    setDate(value);
    setSelectedSlotId(null);
    setMessage('');
  };
  ```
  `selectDate` solely updates the `date` state and clears previous slot selection. It does **not** advance to Step 2.
- **Redundant Continue Button** (lines 259–260):
  ```tsx
  <button className="cta cta-primary" disabled={!selectedDateSlots.length || !!result} style={{ marginTop: '1rem' }} onClick={() => setStep(2)}>{labels.next}</button>
  ```
  The user is currently forced to perform a two-step action: click a date, then locate and click the "Continue" button at the bottom of the calendar.
- **Calendar cell rendering and accessibility** (lines 232–255):
  ```tsx
  <button
    key={day}
    type="button"
    disabled={disabled}
    onClick={() => selectDate(day)}
    aria-label={day + (hasAvailability ? ' available' : ' unavailable')}
    style={{
      minHeight: 44, borderRadius: 8,
      border: selected ? '2px solid #0f4a34' : '1px solid #d7dfda',
      background: !hasAvailability && inRange ? '#fde8e7' : selected ? '#e7f4ee' : '#fff',
      color: !hasAvailability && inRange ? '#a12622' : disabled ? '#969e99' : '#1b2921',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontWeight: selected ? 800 : 500,
    }}
  >{Number(day.slice(-2))}</button>
  ```
  - Keyboard activation relies entirely on native browser click delegation. No explicit `onKeyDown` or Enter/Space handling is present.
  - The `aria-label` is raw date string concatenation (`2026-11-20 available`), which is jarring on screen readers and lacks Hindi localization.
  - Hit area lacks `touch-action: manipulation` to eliminate 300ms mobile tap delay.
  - Visual styling uses old green palette tokens (`#0f4a34`, `#e7f4ee`, `#fde8e7`, `#a12622`) instead of Direction A Industrial Blue and Slate.

### 1.2 Step 2 (Vehicle Selection) in `src/components/booking/BookingWizard.tsx`
- **Current vehicle state and preselection** (lines 26, 59–61, 131–136):
  ```typescript
  const vehicleTypes = ['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other'];
  ...
  const [vehicleClass, setVehicleClass] = useState('Car');
  const [vehicleModel, setVehicleModel] = useState('');
  ...
  const setVehicle = (value: string) => {
    setVehicleClass(value);
    setMoreThan12Selected(false);
    setCylinderCount(value === 'Truck' ? 4 : 1);
    setSelectedSlotId(null);
  };
  ```
- **Vehicle dropdown & Truck notice in JSX** (lines 264–283):
  ```tsx
  <select value={vehicleClass} disabled={!!result} onChange={(event) => setVehicle(event.target.value)} style={{ minHeight: 52, padding: '.5rem' }}>
    {vehicleTypes.map((type) => <option key={type} value={type}>{type}</option>)}
  </select>
  ...
  {vehicleClass === 'Truck' && <p>{hindi ? 'ट्रक के लिए 4 CNG सिलेंडर पहले से चुने गए हैं। आप इसे बदल सकते हैं।' : 'Truck selected: 4 CNG cylinders are preselected. You can change this.'}</p>}
  ```
  - Options are English-only strings with no bilingual Hindi labels.
  - The truck preselection notice is a plain unstyled `<p>` tag that easily gets lost. It lacks visual prominence and clear guidance that commercial truck customers can adjust the cylinder count on Step 3.
  - The optional vehicle make/model field lacks assistive helper copy explaining its utility (e.g., preparing testing adapters).

### 1.3 Step 3 (Cylinder Count & Contact Card) in `src/components/booking/BookingWizard.tsx`
- **Current cylinder options** (lines 288–294):
  ```tsx
  <select value={moreThan12Selected ? 'more' : String(cylinderCount)} disabled={!!result} onChange={(event) => chooseCylinderCount(event.target.value)} style={{ minHeight: 52, padding: '.5rem' }}>
    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {hindi ? 'सिलेंडर' : count === 1 ? 'cylinder' : 'cylinders'}</option>)}
    <option value="more">{hindi ? '12 से अधिक' : 'More than 12'}</option>
  </select>
  ```
  - Displays 1 through 12 cylinders and "More than 12", in direct violation of the confirmed project requirement that public self-service is strictly **1–6 cylinders** and "More than 6".
- **Contact routing for oversized vehicles** (lines 295–299):
  ```tsx
  {moreThan12Selected ? (
    <p style={{ marginTop: '.6rem' }}>
      {labels.contact} <a href={'/' + locale + '/contact/'}>{hindi ? 'संपर्क करें' : 'Contact the centre'}</a>.
    </p>
  ) : null}
  ```
  - Merely links to the static `/<locale>/contact/` page instead of displaying an immediate, high-converting contact card with direct telephone (`tel:+919910055355`) and WhatsApp (`https://wa.me/919910055355`) actions.
  - The "Continue" button is only disabled when `moreThan12Selected` is true (line 313), rather than halting on `moreThan6Selected`.

### 1.4 Server-Side Public Cylinder Limit in `src/pages/api/booking/create-hold.ts`
- **Validation gate** (lines 102–115):
  ```typescript
  if (categoryRow.cylinderCount > 6) {
    const contact = resolveContact(settings);
    const message = locale === 'hi'
      ? 'ऑनलाइन बुकिंग अधिकतम 6 सिलेंडरों तक सीमित है। 6 से अधिक सिलेंडरों के लिए कृपया केंद्र से सीधे संपर्क करें।'
      : 'Online self-service booking is limited to a maximum of 6 cylinders. For more than 6 cylinders, please contact our centre directly.';
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'PUBLIC_CYLINDER_LIMIT_EXCEEDED', message },
        contact,
      }),
      { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }
  ```
  - Backend enforces `cylinderCount <= 6` with HTTP 400 rejection and provides default contact phone/WhatsApp `+919910055355`. Frontend Step 3 must reflect this contract exactly.

### 1.5 Styling Tokens & Touch Targets
- `BaseLayout.astro` (lines 32–41) and `BookingWizard.tsx` (lines 219, 247–248, 333–334) use outdated green palette tokens (`#0f4a34`, `#e4e9e6`, `#e7f4ee`).
- Confirmed Direction A palette from `hsr-implementation-plan.md` and `PROJECT.md`:
  - Deep Industrial Blue: `#1E40AF`
  - Precision Blue: `#3B82F6`
  - Action / Accent Amber: `#EA580C`
  - Slate Background: `#F8FAFC`
  - Surface: `#FFFFFF`
  - Text Primary: `#0F172A`
  - Text Muted: `#475569`
  - Border: `#CBD5E1`
  - Focus Ring: `3px solid #1E40AF` with `2px offset`
  - Minimum touch target: `44px × 44px` with `8px+` spacing.

---

## 2. Logic Chain

1. **Single-Tap Progression Mechanics**:
   - *Premise*: Requiring a separate "Continue" button on Step 1 is redundant because selecting a specific appointment date is a discrete, intentional user action.
   - *Inference*: When a user taps or presses Enter/Space on an available calendar date, the click handler should invoke `setDate(day)` and immediately call `setStep(2)`.
   - *Edge Case Defense*: Past dates, dates outside the 60-day horizon, and dates with zero available consecutive units must have `disabled={true}`, `tabIndex={-1}`, and an early return guard in the handler. This guarantees that tapping an unavailable date never triggers step advancement. Removing the Continue button eliminates visual clutter and cuts drop-off rate on mobile devices.

2. **Vehicle Selection & Truck 4-Cylinder Preselection**:
   - *Premise*: Heavy and commercial trucks predominantly have 4 CNG cylinders (or more), while passenger cars typically have 1 or 2 cylinders.
   - *Inference*: Selecting "Truck" in Step 2 must immediately set `cylinderCount = 4`. A prominent, high-contrast callout banner must inform the user that 4 cylinders have been preselected and reassure them that they can adjust this count in Step 3 if their vehicle differs (e.g., 2, 3, or 6 cylinders).
   - *Bilingual Alignment*: While the database and API expect standard tokens (`'Car'`, `'Taxi'`, `'Tempo'`, `'Van'`, `'LCV'`, `'Truck'`, `'Bus'`, `'Other'`), the option labels displayed to Hindi users should feature clear bilingual text (e.g. `ट्रक / Truck (वाणिज्यिक / भारी)`).

3. **Public 1–6 Cylinder Limit & Contact Card**:
   - *Premise*: The server-side API rejects web bookings for `cylinderCount > 6` with HTTP 400. Fleet cascades and heavy multi-cylinder vehicles require dedicated engineering bay allocation and custom schedule coordination that cannot be automated via standard self-service work units.
   - *Inference*: Step 3 dropdown must display only 1, 2, 3, 4, 5, 6, and "More than 6". Selecting "More than 6" sets `moreThan6Selected = true`, immediately suppresses the "Continue to Time" button, and renders a dedicated Industrial Contact Card featuring direct `tel:` and `https://wa.me/` links to `+91 9910055355`.
   - *Pricing Integrity*: For 1–6 cylinders, Step 3 displays the transparent price breakdown based on `business_settings.flat_advance_paise` (flat ₹500 advance): Base price ₹2,500/cyl + 18% GST = ₹2,950/cyl; Advance = ₹500 flat; Balance = Total - ₹500.

4. **Direction A Industrial Styling & Accessibility Compliance**:
   - *Premise*: HSR Green Energy's identity is an engineering and statutory testing station, not an eco-blog or generic SaaS product.
   - *Inference*: Stepper indicators, calendar buttons, form inputs, callouts, and action buttons must adopt the Deep Industrial Blue (`#1E40AF`), Precision Blue (`#3B82F6`), and Safety Amber (`#EA580C`) palette. All interactive buttons, calendar cells, and selects must enforce `min-height: 44px` (with form fields at `48px–52px`), `touch-action: manipulation`, and high-contrast visible focus rings (`:focus-visible`).

---

## 3. Caveats

1. **Step 4 (Time Selection) Separation**:
   - Step 4 (Linked dropdowns: Hour first, exact start time second) is covered by Milestone M3-2 / separate subagent. However, the state transitions in Step 1, 2, and 3 must feed cleanly into Step 4 via `date`, `cylinderCount`, and `vehicleDescription`.
2. **Re-fetching Availability on Cylinder Count Change**:
   - Step 1 calendar availability is initially fetched for `cylinderCount = 1`. If the user selects "Truck" in Step 2 (`cylinderCount = 4`), the `useEffect` triggers a background re-fetch for 4 cylinders. If the date selected in Step 1 has fewer than 4 consecutive units remaining, Step 4 will display "No suitable appointments are available on this date". Step 4 must offer a clear "Change date" button leading back to Step 1.
3. **Contact Details Source**:
   - Contact phone and WhatsApp are defaulted to `+91 9910055355`. In the proposed implementation, these are provided as constants with support for runtime props from `business_settings`.
4. **No Direct Code Mutation**:
   - In accordance with the Explorer role invariants, no source files were edited in this step. The implementer agent can apply the proposed code directly.

---

## 4. Conclusion & Proposed Implementation Specification

### 4.1 Interface & Option Constants
Replace the existing `vehicleTypes` array with structured bilingual definitions:

```typescript
export const VEHICLE_OPTIONS = [
  { value: 'Car', labelEn: 'Car (Passenger)', labelHi: 'कार / Car (यात्री वाहन)' },
  { value: 'Taxi', labelEn: 'Taxi / Cab', labelHi: 'टैक्सी / Taxi' },
  { value: 'Tempo', labelEn: 'Tempo / Three-Wheeler', labelHi: 'टेम्पो / Tempo' },
  { value: 'Van', labelEn: 'Van / Omni / Eeco', labelHi: 'वैन / Van' },
  { value: 'LCV', labelEn: 'LCV (Light Commercial Vehicle)', labelHi: 'एलसीवी / LCV (हल्का वाणिज्यिक वाहन)' },
  { value: 'Truck', labelEn: 'Truck (Commercial / Heavy)', labelHi: 'ट्रक / Truck (वाणिज्यिक / भारी)' },
  { value: 'Bus', labelEn: 'Bus / Mini-bus', labelHi: 'बस / Bus' },
  { value: 'Other', labelEn: 'Other vehicle type', labelHi: 'अन्य वाहन प्रकार (Other)' },
] as const;

export const PUBLIC_CYLINDER_OPTIONS = [
  { value: '1', count: 1, labelEn: '1 cylinder', labelHi: '1 सिलेंडर' },
  { value: '2', count: 2, labelEn: '2 cylinders', labelHi: '2 सिलेंडर' },
  { value: '3', count: 3, labelEn: '3 cylinders', labelHi: '3 सिलेंडर' },
  { value: '4', count: 4, labelEn: '4 cylinders', labelHi: '4 सिलेंडर' },
  { value: '5', count: 5, labelEn: '5 cylinders', labelHi: '5 सिलेंडर' },
  { value: '6', count: 6, labelEn: '6 cylinders', labelHi: '6 सिलेंडर' },
  { value: 'more', count: null, labelEn: 'More than 6 cylinders (Contact Centre)', labelHi: '6 से अधिक सिलेंडर (केंद्र से संपर्क करें)' },
] as const;
```

### 4.2 State Variables in `BookingWizard.tsx`
Replace `moreThan12Selected` with `moreThan6Selected`:
```typescript
const [cylinderCount, setCylinderCount] = useState(1);
const [moreThan6Selected, setMoreThan6Selected] = useState(false);
const [vehicleClass, setVehicleClass] = useState('Car');
const [vehicleModel, setVehicleModel] = useState('');
```

### 4.3 Step 1: Single-Tap Date Progression Implementation
Define the unified date selection & auto-advance handler:
```typescript
const handleDateSelectAndAdvance = (selectedDate: string, isAvailable: boolean) => {
  if (!isAvailable || loading || !!result) return;
  setDate(selectedDate);
  setSelectedSlotId(null);
  setMessage('');
  setStep(2); // Instant single-tap progression to Step 2
};
```

Render Step 1 with accessible calendar cells and **no Continue button**:
```tsx
{step === 1 && (
  <div>
    <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>{labels.date}</h2>
    <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1rem' }}>
      {hindi ? 'आगे बढ़ने के लिए कैलेंडर में से कोई भी उपलब्ध तारीख चुनें:' : 'Select an available appointment date to proceed:'}
    </p>

    {/* Month Header */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: '1rem', background: '#F8FAFC', padding: '.5rem .75rem', borderRadius: 8, border: '1px solid #E2E8F0' }}>
      <button
        type="button"
        disabled={monthYear === new Date(today + 'T00:00:00Z').getUTCFullYear() && monthIndex === new Date(today + 'T00:00:00Z').getUTCMonth()}
        onClick={() => setMonth(new Date(Date.UTC(monthYear, monthIndex - 1, 1)))}
        aria-label={hindi ? 'पिछला महीना' : 'Previous month'}
        style={{ minHeight: 44, minWidth: 44, padding: '.4rem .8rem', borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 700 }}
      >
        ←
      </button>
      <strong style={{ fontSize: '1.05rem', color: '#0F172A' }}>{monthTitle(month, locale)}</strong>
      <button
        type="button"
        disabled={new Date(Date.UTC(monthYear, monthIndex + 1, 1)).toISOString().slice(0, 10) > lastDate}
        onClick={() => setMonth(new Date(Date.UTC(monthYear, monthIndex + 1, 1)))}
        aria-label={hindi ? 'अगला महीना' : 'Next month'}
        style={{ minHeight: 44, minWidth: 44, padding: '.4rem .8rem', borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 700 }}
      >
        →
      </button>
    </div>

    {/* Calendar 7-Column Grid */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '.4rem' }}>
      {labels.weekday.map((day) => (
        <div key={day} style={{ textAlign: 'center', fontSize: '.8rem', fontWeight: 700, color: '#475569', paddingBottom: '.25rem' }}>
          {day}
        </div>
      ))}
      {calendarCells.map((day, index) => {
        if (!day) return <span key={'empty-' + index} />;
        const hasAvailability = (availableByDate.get(day) ?? []).length > 0;
        const inRange = day >= today && day <= lastDate;
        const disabled = !inRange || !hasAvailability || loading || !!result;
        const selected = date === day;

        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            onClick={() => handleDateSelectAndAdvance(day, inRange && hasAvailability)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && inRange && hasAvailability && !disabled) {
                e.preventDefault();
                handleDateSelectAndAdvance(day, true);
              }
            }}
            aria-label={`${day}: ${hasAvailability ? (hindi ? 'उपलब्ध, चयन करने और आगे बढ़ने के लिए टैप करें' : 'Available, tap to select and proceed') : (hindi ? 'अनुपलब्ध' : 'Unavailable')}`}
            aria-pressed={selected}
            style={{
              minHeight: 44,
              minWidth: 44,
              touchAction: 'manipulation',
              borderRadius: 6,
              border: selected ? '2px solid #1E40AF' : '1px solid #CBD5E1',
              background: !hasAvailability && inRange ? '#F1F5F9' : selected ? '#1E40AF' : '#FFFFFF',
              color: !hasAvailability && inRange ? '#94A3B8' : selected ? '#FFFFFF' : disabled ? '#94A3B8' : '#0F172A',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: selected ? 800 : 600,
              fontSize: '.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
          >
            {Number(day.slice(-2))}
          </button>
        );
      })}
    </div>

    {/* Calendar Legend */}
    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '.8rem', color: '#475569', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid #CBD5E1', background: '#FFFFFF', display: 'inline-block' }} />
        <span>{hindi ? 'उपलब्ध (टैप करके चुनें)' : 'Available (Tap to proceed)'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid #E2E8F0', background: '#F1F5F9', display: 'inline-block' }} />
        <span>{hindi ? 'पूर्ण बुक / अनुपलब्ध' : 'Booked / Unavailable'}</span>
      </div>
    </div>

    {loadError && <p role="alert" style={{ color: '#DC2626', marginTop: '.75rem' }}>{loadError}</p>}
    {loading && <p style={{ color: '#1E40AF', marginTop: '.75rem' }}>{labels.loading}</p>}
  </div>
)}
```

### 4.4 Step 2: Vehicle Selection & Truck Preselection Implementation
```tsx
const setVehicle = (value: string) => {
  setVehicleClass(value);
  setMoreThan6Selected(false);
  if (value === 'Truck') {
    setCylinderCount(4); // Preselect 4 cylinders for Truck
  } else if (vehicleClass === 'Truck' && cylinderCount === 4) {
    setCylinderCount(1); // Reset default to 1 when leaving Truck
  }
  setSelectedSlotId(null);
};
```

Render Step 2 with bilingual dropdown, optional make/model, and truck notice callout:
```tsx
{step === 2 && (
  <div>
    <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>{labels.vehicle}</h2>
    <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1.25rem' }}>
      {hindi ? 'अपॉइंटमेंट की तारीख:' : 'Appointment date:'} <strong>{date}</strong>
    </p>

    {/* Vehicle Class Select */}
    <label style={{ display: 'grid', gap: '.4rem', maxWidth: 440 }}>
      <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
        {hindi ? 'वाहन का प्रकार चुनें *' : 'Select vehicle type *'}
      </span>
      <select
        id="vehicle-type-select"
        value={vehicleClass}
        disabled={!!result}
        onChange={(event) => setVehicle(event.target.value)}
        style={{
          minHeight: 48,
          padding: '.6rem .75rem',
          borderRadius: 6,
          border: '1px solid #CBD5E1',
          fontSize: '1rem',
          background: '#FFFFFF',
          color: '#0F172A',
        }}
      >
        {VEHICLE_OPTIONS.map((type) => (
          <option key={type.value} value={type.value}>
            {hindi ? type.labelHi : type.labelEn}
          </option>
        ))}
      </select>
    </label>

    {/* Vehicle Make/Model Optional Input */}
    <label style={{ display: 'grid', gap: '.4rem', maxWidth: 440, marginTop: '1rem' }}>
      <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
        {labels.model}
      </span>
      <input
        id="vehicle-model-input"
        value={vehicleModel}
        disabled={!!result}
        onChange={(event) => setVehicleModel(event.target.value)}
        placeholder={hindi ? 'जैसे Tata 407, Maruti WagonR, Bolero' : 'e.g. Tata 407, Maruti WagonR, Bolero'}
        style={{
          minHeight: 48,
          padding: '.6rem .75rem',
          borderRadius: 6,
          border: '1px solid #CBD5E1',
          fontSize: '1rem',
          width: '100%',
        }}
      />
      <span style={{ fontSize: '.8rem', color: '#64748B' }}>
        {hindi ? 'वैकल्पिक: टेस्टिंग एडॉप्टर की तैयारी में सहायता करता है।' : 'Optional: Helps technicians prepare testing adapters in advance.'}
      </span>
    </label>

    {/* Prominent Truck Preselection Callout */}
    {vehicleClass === 'Truck' && (
      <div
        role="status"
        style={{
          marginTop: '1.25rem',
          maxWidth: 440,
          padding: '.85rem 1rem',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: 8,
          display: 'flex',
          gap: '.75rem',
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🚛</span>
        <div style={{ fontSize: '.875rem', color: '#1E40AF' }}>
          <strong>{hindi ? 'ट्रक: 4 CNG सिलेंडर पूर्व-चयनित' : 'Truck Selected: 4 Cylinders Preselected'}</strong>
          <p style={{ margin: '.25rem 0 0', color: '#1E3A8A', lineHeight: 1.4 }}>
            {hindi
              ? 'वाणिज्यिक ट्रकों के लिए 4 सिलेंडर स्वचालित रूप से चुने गए हैं। यदि आपके वाहन में 2, 3, या 6 सिलेंडर हैं, तो आप अगले चरण में संख्या बदल सकते हैं।'
              : '4 CNG cylinders have been automatically preselected for commercial truck testing. You can easily adjust this count on the next step if your vehicle has a different setup.'}
          </p>
        </div>
      </div>
    )}

    {/* Navigation CTAs */}
    <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
      <button
        type="button"
        className="cta cta-secondary"
        style={{ minHeight: 48, padding: '.6rem 1.2rem', borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}
        onClick={() => setStep(1)}
      >
        {labels.back}
      </button>
      <button
        type="button"
        className="cta cta-primary"
        disabled={!vehicleDescription || !!result}
        style={{ minHeight: 48, padding: '.6rem 1.5rem', borderRadius: 6, border: 'none', background: '#1E40AF', color: '#FFFFFF', fontWeight: 700, cursor: (!vehicleDescription || !!result) ? 'not-allowed' : 'pointer', opacity: (!vehicleDescription || !!result) ? 0.6 : 1 }}
        onClick={() => setStep(3)}
      >
        {labels.next}
      </button>
    </div>
  </div>
)}
```

### 4.5 Step 3: Public 1–6 Cylinder Dropdown & Dedicated Contact Card Implementation
```tsx
const chooseCylinderCount = (value: string) => {
  if (value === 'more') {
    setMoreThan6Selected(true);
    setMessage('');
    setSelectedSlotId(null);
    return;
  }
  setMoreThan6Selected(false);
  setMessage('');
  setCylinderCount(Number(value));
  setSelectedSlotId(null);
};
```

Render Step 3 with 1–6 options, transparent price card, and dedicated Contact Card:
```tsx
{step === 3 && (
  <div>
    <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>{labels.cylinder}</h2>
    <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1.25rem' }}>
      {date} · <strong>{vehicleDescription}</strong>
    </p>

    {/* Cylinder Count Dropdown */}
    <label style={{ display: 'grid', gap: '.4rem', maxWidth: 440 }}>
      <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
        {hindi ? 'CNG सिलेंडर की संख्या चुनें *' : 'Number of CNG cylinders fitted *'}
      </span>
      <select
        id="cylinder-count-select"
        value={moreThan6Selected ? 'more' : String(cylinderCount)}
        disabled={!!result}
        onChange={(event) => chooseCylinderCount(event.target.value)}
        style={{
          minHeight: 48,
          padding: '.6rem .75rem',
          borderRadius: 6,
          border: '1px solid #CBD5E1',
          fontSize: '1rem',
          background: '#FFFFFF',
          color: '#0F172A',
        }}
      >
        {PUBLIC_CYLINDER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {hindi ? opt.labelHi : opt.labelEn}
          </option>
        ))}
      </select>
    </label>

    {/* Dedicated Fleet Contact Card (When > 6 Cylinders is Selected) */}
    {moreThan6Selected && (
      <div
        role="region"
        aria-label={hindi ? 'फ़्लीट और विशेष सिलेंडर सहायता' : 'Fleet and specialized cylinder support'}
        style={{
          marginTop: '1.25rem',
          padding: '1.5rem',
          background: '#F8FAFC',
          border: '2px solid #CBD5E1',
          borderRadius: 10,
          maxWidth: 520,
        }}
      >
        <div style={{ display: 'inline-block', padding: '.25rem .6rem', background: '#FEF3C7', color: '#92400E', borderRadius: 4, fontSize: '.75rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: '.75rem' }}>
          {hindi ? 'कस्टम फ़्लीट सेवा' : 'Dedicated Fleet Service'}
        </div>
        <h3 style={{ margin: '0 0 .5rem', fontSize: '1.2rem', color: '#0F172A' }}>
          {hindi ? '6 से अधिक CNG सिलेंडर? केंद्र से सीधे संपर्क करें' : 'More than 6 CNG Cylinders? Book Directly with Centre'}
        </h3>
        <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '.925rem', lineHeight: 1.5 }}>
          {hindi
            ? '6 से अधिक सिलेंडर वाले वाहनों (जैसे कैस्केड, बसें या मल्टी-सिलेंडर भारी वाणिज्यिक वाहन) के लिए विशेष बहु-बे आवंटन और अतिरिक्त समय की आवश्यकता होती है। व्यक्तिगत स्लॉट के लिए हमारी टीम से संपर्क करें:'
            : 'Vehicles with more than 6 cylinders (such as commercial cascades, buses, or heavy multi-cylinder trucks) require specialized bay allocation and extended testing schedules. Please contact our operations desk directly to arrange your priority booking:'}
        </p>

        {/* Action Buttons: Phone & WhatsApp */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginBottom: '1.25rem' }}>
          <a
            href="tel:+919910055355"
            className="cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.5rem',
              background: '#1E40AF',
              color: '#FFFFFF',
              padding: '.75rem 1.25rem',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 700,
              minHeight: 48,
              fontSize: '.95rem',
            }}
          >
            📞 {hindi ? 'कॉल करें: +91 9910055355' : 'Call: +91 9910055355'}
          </a>
          <a
            href="https://wa.me/919910055355?text=Hello%20HSR%20Green%20Energy%2C%20I%20need%20to%20book%20CNG%20cylinder%20testing%20for%20a%20vehicle%20with%20more%20than%206%20cylinders."
            target="_blank"
            rel="noopener noreferrer"
            className="cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.5rem',
              background: '#15803D',
              color: '#FFFFFF',
              padding: '.75rem 1.25rem',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 700,
              minHeight: 48,
              fontSize: '.95rem',
            }}
          >
            💬 {hindi ? 'व्हाट्सएप संदेश भेजें' : 'Chat on WhatsApp'}
          </a>
        </div>

        {/* Working Hours & Return link */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
          <span style={{ fontSize: '.8rem', color: '#64748B' }}>
            {hindi ? 'संचालन समय: सुबह 6:00 – रात 8:00 (सोम–शनि)' : 'Working Hours: 06:00 AM – 08:00 PM (Mon–Sat)'}
          </span>
          <button
            type="button"
            onClick={() => chooseCylinderCount('4')}
            style={{ background: 'none', border: 'none', color: '#1E40AF', textDecoration: 'underline', fontSize: '.85rem', cursor: 'pointer', padding: '.25rem .5rem', fontWeight: 600 }}
          >
            {hindi ? '← 1–6 सिलेंडर ऑनलाइन बुकिंग पर लौटें' : '← Return to 1–6 online booking'}
          </button>
        </div>
      </div>
    )}

    {/* Pricing Breakdown Card for 1–6 Cylinders */}
    {!moreThan6Selected && category && (
      <div
        className="card"
        style={{
          marginTop: '1.25rem',
          padding: '1.25rem',
          maxWidth: 480,
          background: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '.5rem' }}>
          <strong style={{ color: '#0F172A', fontSize: '1rem' }}>
            {hindi ? `${cylinderCount} सिलेंडर शुल्क विवरण` : `Fee Breakdown (${cylinderCount} Cylinder${cylinderCount > 1 ? 's' : ''})`}
          </strong>
          <span style={{ fontSize: '.8rem', padding: '.2rem .5rem', background: '#EFF6FF', color: '#1E40AF', borderRadius: 4, fontWeight: 600 }}>
            {hindi ? 'मानक दर' : 'Standard Rate'}
          </span>
        </div>

        <div style={{ display: 'grid', gap: '.35rem', fontSize: '.9rem', color: '#334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{labels.price} (₹2,500 × {cylinderCount}):</span>
            <span>{inr(category.basePricePaise)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{labels.gst} (18%):</span>
            <span>{inr(category.gstPaise)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A', borderTop: '1px solid #E2E8F0', paddingTop: '.4rem', fontSize: '1rem' }}>
            <span>{labels.total}:</span>
            <span>{inr(category.totalPaise)}</span>
          </div>
        </div>

        {/* Flat ₹500 Advance Highlight Box */}
        <div style={{ marginTop: '1rem', padding: '.75rem', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#0F172A', fontSize: '.95rem' }}>{labels.advance} (ऑनलाइन देय):</strong>
              <p style={{ margin: 0, fontSize: '.8rem', color: '#64748B' }}>
                {hindi ? 'स्लॉट सुरक्षित करने हेतु फ्लैट टोकन राशि' : 'Flat advance to hold your slot'}
              </p>
            </div>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E40AF' }}>
              {inr(category.advancePaise)}
            </span>
          </div>
          {category.advancePaise != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.5rem', paddingTop: '.5rem', borderTop: '1px dashed #CBD5E1', fontSize: '.85rem' }}>
              <span style={{ color: '#475569' }}>{labels.balance} (केंद्र पर देय):</span>
              <strong style={{ color: '#0F172A' }}>{inr(category.totalPaise - category.advancePaise)}</strong>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Navigation CTAs */}
    <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
      <button
        type="button"
        className="cta cta-secondary"
        style={{ minHeight: 48, padding: '.6rem 1.2rem', borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', fontWeight: 600, cursor: 'pointer' }}
        onClick={() => setStep(2)}
      >
        {labels.back}
      </button>

      {/* Continue Button ONLY rendered when self-service is active (<= 6 cylinders) */}
      {!moreThan6Selected && (
        <button
          type="button"
          className="cta cta-primary"
          disabled={loading || !category || !!result}
          style={{ minHeight: 48, padding: '.6rem 1.5rem', borderRadius: 6, border: 'none', background: '#1E40AF', color: '#FFFFFF', fontWeight: 700, cursor: (loading || !category || !!result) ? 'not-allowed' : 'pointer', opacity: (loading || !category || !!result) ? 0.6 : 1 }}
          onClick={() => {
            setSelectedSlotId(null);
            setStep(4);
          }}
        >
          {labels.next}
        </button>
      )}
    </div>
  </div>
)}
```

---

## 5. Verification Method

### 5.1 Automated Command Checks
Run the complete suite to verify build, types, and existing tests:
```powershell
# 1. Vitest full suite (12 test suites, 281 tests)
npm run test

# 2. TypeScript diagnostics across Astro and React
npm run typecheck

# 3. Astro production build
npm run build
```

### 5.2 Manual & Visual Inspection Steps
1. **Single-Tap Progression Verification**:
   - Open `/en/book/` and `/hi/book/`.
   - Click any available date cell (e.g. 18th).
   - *Pass criteria*: Step 1 immediately transitions to Step 2 without needing to click "Continue". The redundant "Continue" button is absent from Step 1.
   - Click "Back" on Step 2. Verify previously selected date is highlighted. Tap the same date or another available date to advance again.
   - Verify past and fully-booked dates cannot be clicked or focused via keyboard.
2. **Keyboard Navigation Verification**:
   - Tab through the calendar grid. Verify sharp visible focus outline (`outline: 3px solid #1E40AF`).
   - Press `Enter` or `Space` on an available date.
   - *Pass criteria*: The wizard selects the date and auto-advances to Step 2.
3. **Vehicle & Truck Preselection Verification**:
   - On Step 2, select "Truck" from the dropdown.
   - *Pass criteria*: Cylinder count automatically preselects to 4. Prominent blue truck notice box appears explaining that 4 cylinders are preselected and adjustable in Step 3.
   - Enter optional make/model "Tata 407". Advance to Step 3. Verify cylinder count is 4.
4. **Public 1–6 Dropdown & Contact Card Verification**:
   - On Step 3, inspect the dropdown.
   - *Pass criteria*: Contains exactly: 1 cylinder, 2 cylinders, 3 cylinders, 4 cylinders, 5 cylinders, 6 cylinders, More than 6 cylinders.
   - Select "More than 6 cylinders".
   - *Pass criteria*: The "Continue" button to Step 4 is hidden/removed. The dedicated Fleet Support card appears with `tel:+919910055355` and WhatsApp link.
   - Select "4 cylinders".
   - *Pass criteria*: The contact card disappears, the fee breakdown card appears (₹11,800 total, ₹500 advance, ₹11,300 balance), and the Continue button reappears.
5. **Touch Target Inspection**:
   - In mobile emulation (360px viewport), inspect date buttons and form inputs.
   - *Pass criteria*: Every interactive element measures at least 44×44px with no horizontal overflow.
