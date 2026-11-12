import { readApiJson } from '../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import '../../styles/admin.css';

type Booking = {
  bookingCode: string;
  serviceDate: string;
  reservationState: string;
  customerName: string;
  vehicleRegistration: string;
  mobile: string;
};
type ApiData = { data?: { rows?: Booking[] }; error?: { message?: string } };

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function RegisterConsole() {
  const [date, setDate] = useState(todayInIndia());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingCode, setBookingCode] = useState('');
  const [registration, setRegistration] = useState('');
  const [serial, setSerial] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [specification, setSpecification] = useState('');
  const [testDate, setTestDate] = useState(todayInIndia());
  const [pressure, setPressure] = useState('');
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'REQUIRES_REWORK'>('PASS');
  const [certificate, setCertificate] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/bookings/?fromDate=${encodeURIComponent(date)}`);
      const payload = await readApiJson(response) as ApiData;
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not load completed bookings');
      const completed = (payload.data?.rows ?? []).filter((booking) => booking.reservationState === 'COMPLETED');
      setBookings(completed);
      if (!completed.some((booking) => booking.bookingCode === bookingCode)) {
        setBookingCode(completed[0]?.bookingCode ?? '');
        setRegistration(completed[0]?.vehicleRegistration ?? '');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load completed bookings');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [date, bookingCode]);

  useEffect(() => { void loadBookings(); }, [loadBookings]);

  const selectBooking = (code: string) => {
    setBookingCode(code);
    setRegistration(bookings.find((booking) => booking.bookingCode === code)?.vehicleRegistration ?? '');
  };

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/register/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookingCode,
          vehicleRegistration: registration,
          cylinderSerial: serial,
          manufacturer,
          specification,
          actualPeriodicTestDate: testDate,
          testPressureBar: pressure,
          testResult: result,
          certificateReference: certificate,
        }),
      });
      const payload: any = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not save cylinder register entry');
      setMessage(result === 'PASS'
        ? `Register entry saved. Next periodic test reminder: ${payload.data.nextRetestDueDate}.`
        : 'Register entry saved. No next-test date was assigned because the result was not PASS.');
      setSerial('');
      setManufacturer('');
      setSpecification('');
      setPressure('');
      setCertificate('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save cylinder register entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-app">
      <div className="admin-heading">
        <div>
          <p className="admin-eyebrow">OPERATIONS / CYLINDER HISTORY</p>
          <h1>Cylinder retest register</h1>
          <p className="admin-subtitle">Record a cylinder only after the linked booking is marked completed.</p>
        </div>
        <label className="admin-inline">
          <span className="admin-note">Completed service date</span>
          <input className="admin-control" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>

      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {message && <div className="admin-alert" role="status">{message}</div>}

      <section className="admin-card owner-section">
        <div className="owner-section-head">
          <div><p className="admin-eyebrow">01 / COMPLETED BOOKING</p><h2 className="admin-section-title">Select the workshop job</h2></div>
          <button className="admin-button secondary" onClick={() => void loadBookings()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        <label className="admin-field">
          Completed booking
          <select className="admin-select" value={bookingCode} onChange={(event) => selectBooking(event.target.value)} disabled={loading || !bookings.length}>
            {bookings.map((booking) => (
              <option value={booking.bookingCode} key={booking.bookingCode}>
                {booking.bookingCode} · {booking.customerName} · {booking.vehicleRegistration}
              </option>
            ))}
          </select>
        </label>
        {!loading && !bookings.length && <p className="admin-alert">No completed booking was found for {date}. Mark the workshop job completed first.</p>}
      </section>

      <section className="admin-card owner-section">
        <div><p className="admin-eyebrow">02 / TEST RECORD</p><h2 className="admin-section-title">Cylinder and test details</h2></div>
        <form className="admin-form" onSubmit={submit}>
          <div className="owner-grid">
            <label className="admin-field">Vehicle registration
              <input className="admin-input" value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} required minLength={4} />
            </label>
            <label className="admin-field">Cylinder serial number
              <input className="admin-input" value={serial} onChange={(event) => setSerial(event.target.value)} required minLength={2} maxLength={120} />
            </label>
            <label className="admin-field">Manufacturer
              <input className="admin-input" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} maxLength={120} />
            </label>
            <label className="admin-field">Cylinder specification
              <input className="admin-input" value={specification} onChange={(event) => setSpecification(event.target.value)} maxLength={120} />
            </label>
            <label className="admin-field">Actual periodic test date
              <input className="admin-input" type="date" value={testDate} max={todayInIndia()} onChange={(event) => setTestDate(event.target.value)} required />
            </label>
            <label className="admin-field">Test pressure (bar)
              <input className="admin-input" inputMode="decimal" value={pressure} onChange={(event) => setPressure(event.target.value)} placeholder="Enter recorded test pressure" />
            </label>
            <label className="admin-field">Actual test result
              <select className="admin-select" value={result} onChange={(event) => setResult(event.target.value as typeof result)}>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
                <option value="REQUIRES_REWORK">REQUIRES REWORK</option>
              </select>
            </label>
            <label className="admin-field">Certificate reference
              <input className="admin-input" value={certificate} onChange={(event) => setCertificate(event.target.value)} maxLength={120} />
            </label>
          </div>
          <p className="admin-note">The next three-year reminder date is calculated only for a recorded PASS result. It is an operational reminder, not a certificate or regulatory approval.</p>
          <button className="admin-button" type="submit" disabled={saving || loading || !bookingCode || !serial.trim() || !testDate}>{saving ? 'Saving register entry…' : 'Save cylinder register entry'}</button>
        </form>
      </section>
    </div>
  );
}
