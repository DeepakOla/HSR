import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/admin.css';

type Locale = 'en' | 'hi';
type Slot = {
  slotSnapshotId: number;
  labelEn: string;
  labelHi: string;
  startTime: string;
  endTime: string;
  capacity: number;
  reserved: number;
  remaining: number;
  isClosed: boolean;
};
type Category = { id: number; name: string; cylinderCount: number; totalPaise: number; advancePaise: number | null };
type Booking = {
  bookingCode: string; serviceDate: string; slotStart: string; slotEnd: string;
  reservationState: string; paymentState: string; source: string; cylinderCount: number;
  totalPricePaise: number; amountPaidPaise: number; advancePaise: number | null; balancePaise: number | null;
  customerName: string; mobile: string; vehicleRegistration: string; utr: string | null;
};
type Dashboard = { date: string; dailyCapacity: number; dailyReserved: number; dailyRemaining: number; pendingVerificationCount: number; slots: Slot[] };

const copy = {
  en: {
    eyebrow: 'Operations / Reception', title: 'Daily booking desk', sub: 'One live ledger for web, phone, WhatsApp and walk-in appointments.',
    date: 'Appointment date', refresh: 'Refresh', booked: 'Cylinders reserved', capacity: 'Daily capacity', free: 'Available', pending: 'Awaiting verification',
    slots: 'Slot occupancy', add: 'Add a manual booking', name: 'Customer name', mobile: 'Mobile number', vehicle: 'Vehicle registration',
    category: 'Vehicle category', slot: 'Time slot', source: 'Booking source', phone: 'Phone', whatsapp: 'WhatsApp', walkin: 'Walk-in',
    payment: 'Full payment collected at counter', save: 'Create booking', bookings: 'Appointments', code: 'Booking', customer: 'Customer', vehicleCol: 'Vehicle', time: 'Time', cylinders: 'Cylinders', status: 'Status', paymentStatus: 'Payment', actions: 'Actions',
    loading: 'Loading desk…', empty: 'No appointments for this date.', error: 'Could not load the receptionist desk.', saved: 'Manual booking created and capacity reserved.', verify: 'Verify payment', reject: 'Reject', cancel: 'Cancel', checkin: 'Check in', start: 'Start work', complete: 'Mark completed', screenshot: 'View screenshot', loadFail: 'Action failed. Refresh and check the current booking status.',
    markPaid: 'Mark paid at counter', language: 'हिंदी', noSlots: 'No open slots for this date.', choose: 'Choose…', reload: 'Loading…'
  },
  hi: {
    eyebrow: 'संचालन / रिसेप्शन', title: 'दैनिक बुकिंग डेस्क', sub: 'वेबसाइट, फोन, व्हाट्सऐप और वॉक-इन बुकिंग के लिए एक साझा लाइव रिकॉर्ड।',
    date: 'अपॉइंटमेंट की तारीख', refresh: 'रीफ्रेश', booked: 'आरक्षित सिलेंडर', capacity: 'दैनिक क्षमता', free: 'उपलब्ध', pending: 'सत्यापन लंबित',
    slots: 'समय स्लॉट की स्थिति', add: 'मैनुअल बुकिंग जोड़ें', name: 'ग्राहक का नाम', mobile: 'मोबाइल नंबर', vehicle: 'वाहन रजिस्ट्रेशन',
    category: 'वाहन श्रेणी', slot: 'समय स्लॉट', source: 'बुकिंग का माध्यम', phone: 'फोन', whatsapp: 'व्हाट्सऐप', walkin: 'वॉक-इन',
    payment: 'काउंटर पर पूरा भुगतान प्राप्त हुआ', save: 'बुकिंग बनाएं', bookings: 'अपॉइंटमेंट', code: 'बुकिंग', customer: 'ग्राहक', vehicleCol: 'वाहन', time: 'समय', cylinders: 'सिलेंडर', status: 'स्थिति', paymentStatus: 'भुगतान', actions: 'कार्रवाई',
    loading: 'डेस्क लोड हो रही है…', empty: 'इस तारीख के लिए कोई अपॉइंटमेंट नहीं है।', error: 'रिसेप्शन डेस्क लोड नहीं हो सकी।', saved: 'मैनुअल बुकिंग बन गई और क्षमता आरक्षित हो गई।', verify: 'भुगतान सत्यापित करें', reject: 'अस्वीकार करें', cancel: 'रद्द करें', checkin: 'चेक-इन', start: 'काम शुरू करें', complete: 'पूरा हुआ', screenshot: 'स्क्रीनशॉट देखें', loadFail: 'कार्रवाई असफल रही। रीफ्रेश करके वर्तमान स्थिति जांचें।',
    markPaid: 'काउंटर पर भुगतान दर्ज करें', language: 'English', noSlots: 'इस तारीख के लिए कोई खुला स्लॉट नहीं है।', choose: 'चुनें…', reload: 'लोड हो रहा है…'
  }
};

function businessToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function money(paise: number | null) {
  return paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}
function statusLabel(state: string, locale: Locale) {
  if (locale === 'en') return state.replaceAll('_', ' ');
  const labels: Record<string,string> = {
    HELD: 'होल्ड', PENDING_VERIFICATION: 'सत्यापन लंबित', CONFIRMED: 'कन्फर्म', CHECKED_IN: 'चेक-इन', IN_PROGRESS: 'कार्य जारी',
    COMPLETED: 'पूर्ण', CANCELLED: 'रद्द', EXPIRED: 'समय समाप्त', REJECTED: 'अस्वीकृत',
    ADVANCE_PENDING: 'अग्रिम लंबित', EVIDENCE_SUBMITTED: 'प्रमाण जमा', ADVANCE_VERIFIED: 'अग्रिम सत्यापित', PAID_AT_COUNTER: 'काउंटर पर भुगतान', NOT_REQUIRED: 'लागू नहीं'
  };
  return labels[state] ?? state;
}

export default function ReceptionDashboard() {
  const [locale, setLocale] = useState<Locale>('en');
  const t = copy[locale];
  const [date, setDate] = useState(businessToday());
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [registration, setRegistration] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [source, setSource] = useState<'PHONE'|'WHATSAPP'|'WALKIN'>('PHONE');
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, bookingsRes, catsRes] = await Promise.all([
        fetch(`/api/admin/dashboard?date=${encodeURIComponent(date)}`),
        fetch(`/api/admin/bookings?fromDate=${encodeURIComponent(date)}`),
        fetch(`/api/public/vehicle-categories?locale=${locale}`),
      ]);
      const [dash, book, cats] = await Promise.all([dashRes.json(), bookingsRes.json(), catsRes.json()]) as any[];
      if (!dashRes.ok || !bookingsRes.ok || !catsRes.ok) throw new Error('Request failed');
      setDashboard(dash.data);
      setBookings(book.data.rows ?? []);
      setCategories(cats.data.categories ?? []);
      const firstOpenSlot = (dash.data.slots ?? []).find((slot: Slot) => !slot.isClosed && slot.remaining > 0);
      setSlotId(firstOpenSlot ? String(firstOpenSlot.slotSnapshotId) : '');
      setCategoryId((current) => cats.data.categories?.some((item: Category) => String(item.id) === current) ? current : String(cats.data.categories?.[0]?.id ?? ''));
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [date, locale]);

  useEffect(() => { void load(); }, [load]);

  const selectedCategory = categories.find((item) => item.id === Number(categoryId));
  const availableSlots = useMemo(() => (dashboard?.slots ?? []).filter((slot) => !slot.isClosed && slot.remaining >= (selectedCategory?.cylinderCount ?? 1)), [dashboard, selectedCategory]);

  useEffect(() => {
    if (!availableSlots.some((slot) => String(slot.slotSnapshotId) === slotId)) {
      setSlotId(availableSlots[0] ? String(availableSlots[0].slotSnapshotId) : '');
    }
  }, [availableSlots, slotId]);

  const submitManualBooking = async (event: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/manual-bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale, slotSnapshotId: Number(slotId), categoryId: Number(categoryId),
          customerName: name, mobile, vehicleRegistration: registration, source,
          paymentCollected, idempotencyKey
        })
      });
      const payload: any = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? t.loadFail);
      setMessage(t.saved);
      setName(''); setMobile(''); setRegistration(''); setPaymentCollected(false);
      setIdempotencyKey(crypto.randomUUID());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.loadFail);
    } finally { setBusy(false); }
  };

  const act = async (bookingCode: string, action: string) => {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/bookings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingCode, action })
      });
      const payload: any = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? t.loadFail);
      setMessage(`${bookingCode}: ${statusLabel(payload.data.reservationState, locale)}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.loadFail);
    } finally { setBusy(false); }
  };

  const actionsFor = (booking: Booking) => {
    if (booking.reservationState === 'PENDING_VERIFICATION') return [
      { key: 'VERIFY_PAYMENT', text: t.verify, cls: 'admin-button' },
      { key: 'REJECT', text: t.reject, cls: 'admin-button danger' },
    ];
    if (booking.reservationState === 'HELD' || booking.reservationState === 'CONFIRMED') return [
      ...(booking.reservationState === 'CONFIRMED' ? [
        { key: 'CHECK_IN', text: t.checkin, cls: 'admin-button' },
        ...(booking.paymentState !== 'PAID_AT_COUNTER' ? [{ key: 'MARK_PAID_AT_COUNTER', text: t.markPaid, cls: 'admin-button secondary' }] : []),
      ] : []),
      { key: 'CANCEL', text: t.cancel, cls: 'admin-button danger' },
    ];
    if (booking.reservationState === 'CHECKED_IN') return [{ key: 'START', text: t.start, cls: 'admin-button' }];
    if (booking.reservationState === 'IN_PROGRESS') return [{ key: 'COMPLETE', text: t.complete, cls: 'admin-button' }];
    return [];
  };

  return (
    <div className="admin-app" lang={locale}>
      <div className="admin-heading">
        <div><p className="admin-eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="admin-subtitle">{t.sub}</p></div>
        <div className="admin-actions">
          <button className="admin-lang" onClick={() => setLocale(locale === 'en' ? 'hi' : 'en')}>{t.language}</button>
          <label className="admin-inline"><span className="admin-note">{t.date}</span><input className="admin-control" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button className="admin-button secondary" onClick={() => void load()} disabled={loading}>{loading ? t.reload : t.refresh}</button>
        </div>
      </div>

      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {message && <div className="admin-alert" role="status">{message}</div>}
      {loading && !dashboard ? <div className="admin-loading">{t.loading}</div> : dashboard && (
        <>
          <div className="admin-metrics">
            <div className="admin-card"><div className="admin-metric-label">{t.booked}</div><div className="admin-metric-value">{dashboard.dailyReserved}</div><div className="admin-metric-note">{t.capacity}: {dashboard.dailyCapacity}</div></div>
            <div className="admin-card"><div className="admin-metric-label">{t.free}</div><div className="admin-metric-value">{dashboard.dailyRemaining}</div><div className="admin-metric-note">{t.capacity}: {dashboard.dailyCapacity}</div></div>
            <div className="admin-card"><div className="admin-metric-label">{t.pending}</div><div className="admin-metric-value">{dashboard.pendingVerificationCount}</div><div className="admin-metric-note">{t.date}: {date}</div></div>
            <div className="admin-card"><div className="admin-metric-label">{t.capacity}</div><div className="admin-metric-value">{dashboard.dailyCapacity > 0 ? Math.round(dashboard.dailyReserved / dashboard.dailyCapacity * 100) : 0}%</div><div className="admin-track"><span style={{width:`${dashboard.dailyCapacity > 0 ? Math.min(100,dashboard.dailyReserved / dashboard.dailyCapacity * 100) : 0}%`}} /></div></div>
          </div>

          <div className="admin-main-grid">
            <section className="admin-card">
              <h2 className="admin-section-title">{t.slots}</h2>
              {dashboard.slots.length ? <div className="admin-slot-list">{dashboard.slots.map((slot) => (
                <div className="admin-slot" key={slot.slotSnapshotId}>
                  <div className="admin-slot-head"><span>{locale === 'en' ? slot.labelEn : slot.labelHi}</span><strong>{slot.reserved}/{slot.capacity}</strong></div>
                  <div className="admin-slot-sub">{slot.remaining} {t.free}</div>
                  <div className="admin-track"><span style={{width:`${slot.capacity > 0 ? Math.min(100,slot.reserved / slot.capacity * 100) : 0}%`}} /></div>
                </div>
              ))}</div> : <div className="admin-empty">{t.noSlots}</div>}
            </section>

            <section className="admin-card">
              <h2 className="admin-section-title">{t.add}</h2>
              <form className="admin-form" onSubmit={submitManualBooking}>
                <div className="admin-form-grid">
                  <label className="admin-field">{t.name}<input className="admin-input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label className="admin-field">{t.mobile}<input className="admin-input" required inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g,''))} /></label>
                </div>
                <label className="admin-field">{t.vehicle}<input className="admin-input" required minLength={4} value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} /></label>
                <div className="admin-form-grid">
                  <label className="admin-field">{t.category}<select className="admin-select" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">{t.choose}</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} · {cat.cylinderCount}</option>)}</select></label>
                  <label className="admin-field">{t.slot}<select className="admin-select" required value={slotId} onChange={(e) => setSlotId(e.target.value)}><option value="">{t.choose}</option>{availableSlots.map((slot) => <option key={slot.slotSnapshotId} value={slot.slotSnapshotId}>{slot.startTime}–{slot.endTime} · {slot.remaining} {t.free}</option>)}</select></label>
                </div>
                <label className="admin-field">{t.source}<select className="admin-select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}><option value="PHONE">{t.phone}</option><option value="WHATSAPP">{t.whatsapp}</option><option value="WALKIN">{t.walkin}</option></select></label>
                <label className="admin-check"><input type="checkbox" checked={paymentCollected} onChange={(e) => setPaymentCollected(e.target.checked)} />{t.payment}</label>
                <button className="admin-button" type="submit" disabled={busy || !availableSlots.length || !slotId || !categoryId}>{busy ? t.reload : t.save}</button>
                <p className="admin-note">Manual bookings are confirmed immediately and use the same cylinder quota ledger as website bookings.</p>
              </form>
            </section>
          </div>

          <section className="admin-card">
            <h2 className="admin-section-title">{t.bookings}</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{t.code}</th><th>{t.customer}</th><th>{t.vehicleCol}</th><th>{t.time}</th><th>{t.cylinders}</th><th>{t.status}</th><th>{t.paymentStatus}</th><th>{t.actions}</th></tr></thead>
                <tbody>
                  {bookings.length ? bookings.map((booking) => (
                    <tr key={booking.bookingCode}>
                      <td><strong>{booking.bookingCode}</strong><div className="admin-note">{booking.source}</div></td>
                      <td>{booking.customerName}<div className="admin-note">{booking.mobile}</div></td>
                      <td>{booking.vehicleRegistration}</td>
                      <td>{booking.slotStart}–{booking.slotEnd}</td>
                      <td>{booking.cylinderCount}</td>
                      <td><span className={`admin-status ${booking.reservationState === 'PENDING_VERIFICATION' ? 'pending' : ''}`}>{statusLabel(booking.reservationState,locale)}</span></td>
                      <td>{statusLabel(booking.paymentState,locale)}<div className="admin-note">Paid: {money(booking.amountPaidPaise)} / {money(booking.totalPricePaise)}</div>{booking.utr&&<div className="admin-note">UTR: {booking.utr}</div>}</td>
                      <td><div className="admin-row-actions">{actionsFor(booking).map((action) => <button key={action.key} className={action.cls} disabled={busy} onClick={() => void act(booking.bookingCode,action.key)}>{action.text}</button>)}{booking.paymentState === 'EVIDENCE_SUBMITTED' && <button className="admin-button secondary" onClick={() => window.open(`/api/admin/evidence?bookingCode=${encodeURIComponent(booking.bookingCode)}`,'_blank','noopener,noreferrer')}>{t.screenshot}</button>}</div></td>
                    </tr>
                  )) : <tr><td colSpan={8} className="admin-empty">{t.empty}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
