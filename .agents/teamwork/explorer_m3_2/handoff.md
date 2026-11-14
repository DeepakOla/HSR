# Handoff Report: Explorer M3-2 (Time Selection & Linked Dropdowns)

## 1. Observation

### Codebase and Architecture Inspection
1. **Current Flat Slot Rendering in `src/components/booking/BookingWizard.tsx` (lines 318–348)**:
   ```tsx
   {step === 4 && (
     <div>
       <h2>{labels.time}</h2>
       <p>{date} · {cylinderCount} {hindi ? 'सिलेंडर' : 'cylinders'} · {vehicleDescription}</p>
       <div style={{ display: 'grid', gap: '.55rem' }}>
         {loading && <p>{labels.loading}</p>}
         {!loading && selectedDateSlots.map((slot) => (
           <button
             key={slot.slotSnapshotId}
             type="button"
             disabled={!!result || loading}
             onClick={() => setSelectedSlotId(slot.slotSnapshotId)}
             aria-pressed={selectedSlotId === slot.slotSnapshotId}
             style={{
               minHeight: 54, textAlign: 'left', padding: '.6rem .8rem', borderRadius: 8,
               border: selectedSlotId === slot.slotSnapshotId ? '2px solid #0f4a34' : '1px solid #d7dfda',
               background: selectedSlotId === slot.slotSnapshotId ? '#e7f4ee' : '#fff',
             }}
           >
             <strong>{slot.startTime} – {slot.bookingEndTime}</strong>
             <span> · {cylinderCount} {hindi ? 'लगातार समय इकाइयाँ' : 'consecutive work units'}</span>
           </button>
         ))}
       </div>
       {!selectedDateSlots.length && <p>{labels.noTime}</p>}
       <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
         <button className="cta cta-secondary" onClick={() => setStep(3)}>{labels.back}</button>
         <button className="cta cta-primary" disabled={loading || !selectedSlot || !!result} onClick={() => setStep(5)}>{labels.next}</button>
       </div>
     </div>
   )}
   ```
   - Current state: Single flat vertical list of buttons mapping directly over `selectedDateSlots`.
   - On an 8-hour day with 20-minute intervals (24 slots) or 15-minute intervals (32 slots), this produces an overwhelmingly tall list of 24–32 buttons, causing severe mobile vertical scrolling.
   - There is currently no `selectedHour` state; selection is made directly via `selectedSlotId`.

2. **Availability API and Consecutive Work-Unit Calculation in `src/lib/booking-engine.ts` (lines 10–75)**:
   ```typescript
   export async function fetchAvailability(
     db: D1Database,
     locale: Locale,
     fromDate: string,
     days = 45,
     cylinderCount = 1,
     includeStaffOnly = false,
   ): Promise<SlotAvailability[]> {
   ...
     const marked = markBookableStarts(futureRows.map((row) => ({
       slotSnapshotId: row.slotSnapshotId, serviceDate: row.serviceDate,
       startTime: row.startTime, endTime: row.endTime, configVersion: row.configVersion,
       isClosed: row.isClosed === 1, isPublic: row.isPublic === 1, reserved: row.reserved === 1,
     })), cylinderCount, includeStaffOnly);
   ...
     return marked.map((slot) => {
       const row = byId.get(slot.slotSnapshotId)!;
       return {
         slotSnapshotId: slot.slotSnapshotId, serviceDate: slot.serviceDate,
         slotLabel: locale === 'hi' ? row.slotLabelHi : row.slotLabelEn,
         startTime: slot.startTime, endTime: slot.endTime,
         slotCapacity: 1, slotReserved: row.reserved, slotRemaining: row.reserved ? 0 : 1,
         dayCapacity: row.dayCapacity, dayReserved: row.dayReserved,
         dayRemaining: Math.max(0, row.dayCapacity - row.dayReserved),
         isClosed: slot.isClosed, isPublic: slot.isPublic,
         canStartBooking: slot.canStartBooking, bookingEndTime: slot.bookingEndTime,
       };
     });
   }
   ```
   - The server marks every slot using `markBookableStarts` based on the requested `cylinderCount`.
   - `canStartBooking` is set to `true` if and only if a complete, contiguous, uninterrupted run of `cylinderCount` work units is available starting at that slot.
   - `bookingEndTime` contains the exact end time of the final slot in that continuous run.

3. **Multi-Cylinder Contiguity Rules in `src/lib/appointment-slots.ts` (lines 82–97)**:
   ```typescript
   export function markBookableStarts<T extends OccupiedAppointmentSlot>(
     input: T[],
     cylinderCount: number,
     includeStaffOnly = false,
   ): Array<T & { canStartBooking: boolean; bookingEndTime: string | null }> {
     const sorted = [...input].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.startTime.localeCompare(b.startTime));
     return sorted.map((slot, index) => {
       const run = sorted.slice(index, index + cylinderCount);
       const valid = cylinderCount >= 1 && run.length === cylinderCount && run.every((candidate, offset) => {
         if (candidate.serviceDate !== slot.serviceDate || candidate.configVersion !== slot.configVersion || candidate.isClosed || candidate.reserved) return false;
         if (!includeStaffOnly && !candidate.isPublic) return false;
         return offset === 0 || run[offset - 1].endTime === candidate.startTime;
       });
       return { ...slot, canStartBooking: valid, bookingEndTime: valid ? run[run.length - 1].endTime : null };
     });
   }
   ```
   - Contiguity condition `offset === 0 || run[offset - 1].endTime === candidate.startTime` strictly prevents bookings from spanning across lunch breaks, closed intervals, reserved slots, or closing times.
   - A 4-cylinder booking on a 20-minute schedule requires 4 consecutive slots (80 minutes). If slot 1 is 06:00, slots 2 (06:20), 3 (06:40), and 4 (07:00) must all be open, unreserved, public, and on the same date.

4. **Dynamic Interval Support in Database and Engine**:
   - `migrations/0005_cylinder_work_units.sql` (lines 13–35):
     `weekly_schedule.slot_interval_minutes` is `CHECK (slot_interval_minutes IN (15, 20))`.
     `daily_slot_snapshots.interval_minutes` is `CHECK (interval_minutes IN (15, 20))`.
   - `src/lib/appointment-slots.ts` (lines 37–80): `generateAppointmentSlots` generates slots according to the configured interval (15 or 20 minutes).
   - In 20-minute mode: slots start at `:00`, `:20`, `:40` (3 slots/hour).
   - In 15-minute mode: slots start at `:00`, `:15`, `:30`, `:45` (4 slots/hour).
   - The interval is snapshot into `daily_slot_snapshots`, so the frontend receives the actual start times configured for that specific date.

5. **Concurrency and Database-Guarded Hold Creation in `src/lib/booking-engine.ts` (lines 291–306, 396–398)**:
   - Atomic recheck at database boundary:
     ```typescript
     const candidateSlots = await queryAll<OccupiedAppointmentSlot>(
       db,
       `SELECT ... FROM daily_slot_snapshots dss
        WHERE dss.service_date = ? AND dss.config_version = ?
          AND dss.start_time >= ? AND dss.is_closed = 0
          AND (? = 1 OR dss.is_public = 1)
          AND NOT EXISTS (SELECT 1 FROM booking_slot_allocations a WHERE a.slot_snapshot_id = dss.id)
        ORDER BY dss.start_time ASC LIMIT ?`,
       [slot.serviceDate, slot.configVersion, slot.startTime, input.source === 'WEB' ? 0 : 1, categoryRow.cylinderCount]
     );
     const selectedRun = findConsecutiveAvailableSlots(candidateSlots, slot.id, categoryRow.cylinderCount, input.source !== 'WEB');
     if (!selectedRun) throw new Error('This start time no longer has enough consecutive cylinder-work intervals. Choose another time.');
     ```
   - In `db.batch`:
     ```typescript
     ...selectedRun.map((allocatedSlot, index) => db.prepare(
       'INSERT INTO booking_slot_allocations(booking_id, slot_snapshot_id, ordinal) SELECT id, ?, ? FROM bookings WHERE booking_code = ?'
     ).bind(allocatedSlot.slotSnapshotId, index + 1, bookingCode))
     ```
   - `booking_slot_allocations` table has `UNIQUE(slot_snapshot_id)`. If two users submit overlapping runs, the database enforces mutual exclusion atomically.

6. **Current Test Suite Results**:
   - `npm run test` was executed:
     - 12 test files passed.
     - 281 tests passed (0 failures).
     - Confirmed multi-cylinder contiguous allocations and atomic mutual exclusion under concurrent requests.

---

## 2. Logic Chain

### Step 1: Linked Dropdown Decomposition
- **Observation**: Users currently see a single flat list of buttons. For an 8-hour schedule at 20-minute intervals, up to 24 buttons are displayed simultaneously.
- **Deduction**: Grouping slots hierarchically into **Hour** first and **Exact Start Time** second drastically reduces visual clutter and cognitive overhead:
  - Dropdown 1: Select Hour (e.g. `6 AM`, `7 AM`, `8 AM`, ..., `1 PM`).
  - Dropdown 2: Select Start Time within that hour (e.g. `06:00`, `06:20`, `06:40`).
- **Data Derivation**:
  - `selectedDateSlots` contains all slots for the selected date where `canStartBooking === true`.
  - The hour key for each slot is `slot.startTime.slice(0, 2)` (e.g. `"06"`).
  - Unique available hours can be extracted as:
    `const availableHours = Array.from(new Set(selectedDateSlots.map(s => s.startTime.slice(0, 2)))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));`
  - When the user selects an hour (`selectedHour`), Dropdown 2 populates with:
    `const slotsInHour = selectedDateSlots.filter(s => s.startTime.slice(0, 2) === selectedHour);`

### Step 2: Resilient Schedule Interval Compatibility
- **Observation**: The system supports both 15-minute and 20-minute intervals via `daily_slot_snapshots.interval_minutes`.
- **Deduction**: Because the client groups slots dynamically by `startTime.slice(0, 2)` directly from the API response:
  - If the date uses 20-minute intervals, `slotsInHour` naturally yields up to 3 slots (`:00`, `:20`, `:40`).
  - If the date uses 15-minute intervals, `slotsInHour` naturally yields up to 4 slots (`:00`, `:15`, `:30`, `:45`).
  - If a schedule change occurs mid-month (e.g. 20m before Dec 1, 15m after Dec 1), the dropdowns adapt dynamically per date without any client-side hardcoding.

### Step 3: Consecutive Work-Unit Availability Guarantee
- **Observation**: `fetchAvailability` calls `markBookableStarts(futureRows, cylinderCount, false)`, which marks `canStartBooking = true` ONLY when `cylinderCount` contiguous work units are open and unreserved.
- **Deduction**:
  - `BookingWizard.tsx` line 108 filters `slots` into `availableStarts` using `slot.canStartBooking`.
  - Therefore, `selectedDateSlots` already ONLY contains starting slots that have sufficient contiguous duration for the selected cylinder count.
  - If an hour has slots scheduled (e.g., 13:00 to 14:00 before closing), but at 13:40 only 1 slot remains before closing time (insufficient for 4 cylinders), slot 13:40 has `canStartBooking = false`.
  - If an entire hour lacks any valid start times (e.g. during a lunch break or near closing time), that hour will have 0 bookable slots and will not appear in `availableHours`.
  - Thus, the customer is mathematically incapable of selecting an invalid start time from the linked dropdowns.

### Step 4: Finish Time Calculation and Clear Display
- **Observation**: Every slot where `canStartBooking === true` has `slot.bookingEndTime` populated by `markBookableStarts`.
- **Deduction**:
  - For a 4-cylinder booking starting at `06:00` with 20-minute units:
    `slot.startTime = "06:00"` and `slot.bookingEndTime = "07:20"`.
  - Total duration in minutes = `(7 * 60 + 20) - (6 * 60 + 0) = 80 minutes`.
  - Once the user selects a start time in Dropdown 2, the UI displays a dedicated confirmation card:
    - **English**: `"06:00 to 07:20 · 4 cylinders (80 minutes)"`
    - **Hindi**: `"06:00 से 07:20 · 4 सिलेंडर (80 मिनट)"`
  - In addition, each `<option>` in Dropdown 2 can display a preview:
    - `06:00 (ends 07:20)` / `06:00 (समाप्ति 07:20)`.

### Step 5: Bilingual Formatting (English & Hindi)
- **Observation**: The HSR platform requires seamless bilingual support (`/en/` and `/hi/`).
- **Deduction**:
  - For Dropdown 1 (Hour):
    - 24-hour hours (06, 07, ..., 13, 14) must be mapped to natural localized formats.
    - English: `6 AM`, `7 AM`, ..., `12 PM`, `1 PM`, `2 PM`.
    - Hindi: Indian time of day periods (सुबह = morning, दोपहर = afternoon, शाम = evening) combined with standard 12-hour notation:
      - 06: `सुबह 6 बजे (6 AM)`
      - 11: `सुबह 11 बजे (11 AM)`
      - 12: `दोपहर 12 बजे (12 PM)`
      - 13: `दोपहर 1 बजे (1 PM)`
      - 16: `शाम 4 बजे (4 PM)`
  - For Dropdown 2 (Exact Time):
    - Format: `06:00 (ends 07:20)` in English; `06:00 (समाप्ति 07:20)` in Hindi.
  - For No Available Time Messages:
    - Clear bilingual explanations if a date has no continuous slots for the selected cylinder count, with a direct button to return to Step 1 (Date selection).

---

## 3. Caveats

1. **Date Reselection on Availability Invalidation**:
   - If a customer chooses a date on Step 1 when cylinder count is 1, then selects Truck (4 cylinders) on Step 2, the date selected on Step 1 might not have 4 contiguous slots available.
   - *Mitigation*: Step 4 must defensively check `if (selectedDateSlots.length === 0)` and render a clear warning banner with a button `[← Select another date / दूसरी तारीख चुनें]` that returns the customer to Step 1.
2. **Hour Change State Reset**:
   - If a customer selects Hour `6 AM` and slot `06:20`, then switches Dropdown 1 to `7 AM`, `selectedSlotId` must immediately reset to `null` and the Next/Continue button must disable until a slot in 7 AM is selected.
3. **Owner Configured Schedule Changes**:
   - Operating schedules may be modified by the Owner in the Owner Console. Because all slots and available hours are derived dynamically from `selectedDateSlots` returned by `/api/public/availability`, the UI never relies on hardcoded opening/closing hours.
4. **No Direct Source Modification**:
   - In accordance with the Explorer role constraints, this report details exact specifications, architecture, and code drop-ins. No application source code has been altered during this investigation.

---

## 4. Conclusion & Concrete Specification

### 4.1 State Management Specification for `BookingWizard.tsx`

Add `selectedHour` state:
```typescript
const [selectedHour, setSelectedHour] = useState<string>('');
```

Update state resets:
1. When `date` changes:
   ```typescript
   const selectDate = (value: string) => {
     setDate(value);
     setSelectedHour('');
     setSelectedSlotId(null);
     setMessage('');
   };
   ```
2. When `cylinderCount` changes:
   ```typescript
   const chooseCylinderCount = (value: string) => {
     ...
     setCylinderCount(Number(value));
     setSelectedHour('');
     setSelectedSlotId(null);
   };
   ```
3. When vehicle changes:
   ```typescript
   const setVehicle = (value: string) => {
     ...
     setSelectedHour('');
     setSelectedSlotId(null);
   };
   ```

### 4.2 Helper Functions Specification

```typescript
/**
 * Localizes hour strings (e.g. "06", "13") to natural English and Hindi formats.
 */
export function formatHourOption(hourStr: string, locale: 'en' | 'hi'): string {
  const hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return hourStr;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  if (locale === 'hi') {
    const period = hour < 12 ? 'सुबह' : hour < 16 ? 'दोपहर' : 'शाम';
    return `${period} ${displayHour} बजे (${displayHour} ${ampm})`;
  }
  return `${displayHour} ${ampm}`;
}

/**
 * Calculates duration in minutes between two "HH:MM" timestamps.
 */
export function calculateDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}
```

### 4.3 Memoized Derived Data Specification

```typescript
// Bookable start slots on the selected date
const selectedDateSlots = useMemo(() => {
  return availableByDate.get(date) ?? [];
}, [availableByDate, date]);

// Unique hours with bookable start times on this date
const availableHours = useMemo(() => {
  const hours = new Set<string>();
  for (const slot of selectedDateSlots) {
    hours.add(slot.startTime.slice(0, 2));
  }
  return Array.from(hours).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}, [selectedDateSlots]);

// Valid start slots within the selected hour
const slotsInSelectedHour = useMemo(() => {
  if (!selectedHour) return [];
  return selectedDateSlots.filter((slot) => slot.startTime.slice(0, 2) === selectedHour);
}, [selectedDateSlots, selectedHour]);

// Currently selected slot snapshot
const selectedSlot = useMemo(() => {
  return selectedDateSlots.find((slot) => slot.slotSnapshotId === selectedSlotId) ?? null;
}, [selectedDateSlots, selectedSlotId]);
```

### 4.4 Complete Drop-In Replacement for Step 4 in `BookingWizard.tsx`

```tsx
{step === 4 && (
  <div>
    <h2>{labels.time}</h2>
    <p style={{ color: '#475569', marginBottom: '1.25rem' }}>
      <strong>📅 {date}</strong> · {cylinderCount} {hindi ? 'सिलेंडर' : cylinderCount === 1 ? 'cylinder' : 'cylinders'} · {vehicleDescription}
    </p>

    {loading && <p>{labels.loading}</p>}

    {!loading && selectedDateSlots.length === 0 && (
      <div
        className="card"
        style={{
          padding: '1.25rem',
          borderLeft: '4px solid #EA580C',
          backgroundColor: '#FFF7ED',
          color: '#9A3412',
          borderRadius: 8,
          marginBottom: '1.25rem',
        }}
      >
        <p style={{ fontWeight: 600, margin: '0 0 0.5rem 0' }}>
          {hindi
            ? `इस तारीख पर ${cylinderCount} सिलेंडर के लिए लगातार समय उपलब्ध नहीं है।`
            : `No continuous appointment times available for ${cylinderCount} cylinder(s) on this date.`}
        </p>
        <p style={{ fontSize: '0.9rem', margin: '0 0 1rem 0', color: '#7C2D12' }}>
          {hindi
            ? 'कृपया पीछे जाकर दूसरी तारीख चुनें जहाँ पर्याप्त समय उपलब्ध हो।'
            : 'Please go back and select a different date with adequate consecutive slots.'}
        </p>
        <button
          type="button"
          className="cta cta-secondary"
          onClick={() => setStep(1)}
        >
          {hindi ? '← दूसरी तारीख चुनें' : '← Choose another date'}
        </button>
      </div>
    )}

    {!loading && selectedDateSlots.length > 0 && (
      <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 480 }}>
        {/* Dropdown 1: Hour */}
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600 }}>
            {hindi ? '1. घंटा चुनें' : '1. Select Hour'}
          </span>
          <select
            value={selectedHour}
            disabled={!!result}
            onChange={(e) => {
              setSelectedHour(e.target.value);
              setSelectedSlotId(null);
            }}
            style={{
              minHeight: 52,
              padding: '0.6rem 0.8rem',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              fontSize: '1rem',
              backgroundColor: '#FFFFFF',
            }}
            aria-label={hindi ? 'अपॉइंटमेंट का घंटा चुनें' : 'Select appointment hour'}
          >
            <option value="">
              {hindi ? '— घंटा चुनें —' : '— Choose an hour —'}
            </option>
            {availableHours.map((hour) => (
              <option key={hour} value={hour}>
                {formatHourOption(hour, locale)}
              </option>
            ))}
          </select>
        </label>

        {/* Dropdown 2: Exact Start Time */}
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600, color: !selectedHour ? '#94A3B8' : '#0F172A' }}>
            {hindi ? '2. सटीक शुरू होने का समय' : '2. Exact Start Time'}
          </span>
          <select
            value={selectedSlotId ? String(selectedSlotId) : ''}
            disabled={!selectedHour || !!result}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setSelectedSlotId(id);
            }}
            style={{
              minHeight: 52,
              padding: '0.6rem 0.8rem',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              fontSize: '1rem',
              backgroundColor: !selectedHour ? '#F1F5F9' : '#FFFFFF',
              color: !selectedHour ? '#94A3B8' : '#0F172A',
              cursor: !selectedHour ? 'not-allowed' : 'pointer',
            }}
            aria-label={hindi ? 'सटीक शुरू होने का समय चुनें' : 'Select exact starting time'}
          >
            <option value="">
              {!selectedHour
                ? (hindi ? '— कृपया पहले घंटा चुनें —' : '— Select an hour first —')
                : (hindi ? '— शुरू होने का समय चुनें —' : '— Choose start time —')}
            </option>
            {slotsInSelectedHour.map((slot) => (
              <option key={slot.slotSnapshotId} value={slot.slotSnapshotId}>
                {slot.startTime} {slot.bookingEndTime ? `(${hindi ? 'समाप्ति' : 'ends'} ${slot.bookingEndTime})` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* Calculated Finish Time Display Card */}
        {selectedSlot && (
          <div
            className="card"
            role="status"
            aria-live="polite"
            style={{
              padding: '1rem',
              borderRadius: 8,
              border: '1px solid #1E40AF',
              backgroundColor: '#EFF6FF',
              color: '#1E3A8A',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1.25rem' }} aria-hidden="true">⏱️</span>
              <strong style={{ fontSize: '1.1rem' }}>
                {selectedSlot.startTime} {hindi ? 'से' : 'to'} {selectedSlot.bookingEndTime}
                {' · '}
                {cylinderCount} {hindi ? 'सिलेंडर' : cylinderCount === 1 ? 'cylinder' : 'cylinders'}
              </strong>
            </div>
            <p style={{ margin: '0.25rem 0 0 1.75rem', fontSize: '0.875rem', color: '#1E40AF' }}>
              {hindi
                ? `कुल अनुमानित अवधि: ${calculateDurationMinutes(selectedSlot.startTime, selectedSlot.bookingEndTime!)} मिनट (${cylinderCount} लगातार इकाइयाँ)`
                : `Total estimated duration: ${calculateDurationMinutes(selectedSlot.startTime, selectedSlot.bookingEndTime!)} minutes (${cylinderCount} consecutive work units)`}
            </p>
          </div>
        )}
      </div>
    )}

    <div style={{ display: 'flex', gap: '.6rem', marginTop: '1.5rem' }}>
      <button className="cta cta-secondary" onClick={() => setStep(3)}>
        {labels.back}
      </button>
      <button
        className="cta cta-primary"
        disabled={loading || !selectedSlot || !!result}
        onClick={() => setStep(5)}
      >
        {labels.next}
      </button>
    </div>
  </div>
)}
```

---

## 5. Verification Method

### 5.1 Automated Unit & Integration Tests
To verify the time formatting, linked filtering, and multi-cylinder contiguous allocations independently:

1. **Run Full Test Suite**:
   ```powershell
   npm run test
   ```
   *Expected Result*: All 12 test files (281 tests) pass. Specifically:
   - `tests/appointment-slots.test.ts` (10 tests passing):
     - `creates 24 standard 20-minute units for an eight-hour day`
     - `supports the configurable 15-minute interval`
     - `requires one consecutive 20-minute unit per CNG cylinder`
     - `does not allow a booking to jump across an already reserved unit`
     - `uses the selected 15-minute interval for booking duration`
     - `allocates the exact consecutive run chosen by the customer`
   - `tests/challenger-m2.test.ts`:
     - `Scenario 2: 4 concurrent requests competing for overlapping multi-cylinder work units -> atomic mutual exclusion`

2. **Run Typecheck Diagnostic**:
   ```powershell
   npm run typecheck
   ```
   *Expected Result*: 0 diagnostic errors across Astro and React files.

3. **Run Production Build Validation**:
   ```powershell
   npm run build
   ```
   *Expected Result*: Build completes successfully.

### 5.2 Interactive Wizard Verification Steps
Once implemented in `BookingWizard.tsx`:
1. **15m vs 20m Interval Verification**:
   - On a 20-minute day: Dropdown 1 shows hours; selecting `6 AM` populates Dropdown 2 with up to 3 slots (`06:00`, `06:20`, `06:40`).
   - On a 15-minute day: Dropdown 1 shows hours; selecting `6 AM` populates Dropdown 2 with up to 4 slots (`06:00`, `06:15`, `06:30`, `06:45`).
2. **Consecutive Run Filtering for Multi-Cylinders**:
   - Select 4 cylinders. If closing time is 14:00, slots after 12:40 (such as 13:00, 13:20, 13:40) must NOT appear in Dropdown 2 because they have fewer than 4 remaining consecutive slots before station closure.
3. **Finish Time Display**:
   - Select 4 cylinders starting at `06:00` (20m intervals).
   - Verify summary card displays:
     - English: `"06:00 to 07:20 · 4 cylinders"` and `"Total estimated duration: 80 minutes"`.
     - Hindi: `"06:00 से 07:20 · 4 सिलेंडर"` and `"कुल अनुमानित अवधि: 80 मिनट"`.
4. **Bilingual Verification**:
   - English: Dropdown 1 displays `6 AM`, `7 AM`, `12 PM`, `1 PM`.
   - Hindi: Dropdown 1 displays `सुबह 6 बजे (6 AM)`, `दोपहर 12 बजे (12 PM)`, `दोपहर 1 बजे (1 PM)`.
5. **State Reset Verification**:
   - Select Hour `6 AM` -> Start Time `06:20`.
   - Change Hour dropdown to `7 AM`.
   - Verify Start Time selection resets to empty and Continue button is disabled until a 7 AM slot is chosen.

### 5.3 Invalidation Conditions
The design is invalidated if:
- A user can select a start time whose consecutive run extends past closing time or across a lunch break.
- An hour with 0 available slots is selectable in Dropdown 1, leading to an empty Dropdown 2 dead-end.
- Hardcoded intervals break when the Owner configures a 15-minute schedule.
- Changing cylinder count fails to update available start times.
