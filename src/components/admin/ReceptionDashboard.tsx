import { useCallback, useEffect, useState } from 'react';
import '../../styles/admin.css';

type Locale = 'en' | 'hi';
type SlotUnit = {
  slotSnapshotId: number; labelEn: string; labelHi: string; startTime: string; endTime: string;
  capacity: number; reserved: number; remaining: number; isClosed: boolean; isPublic: boolean;
};
type StartSlot = {
  slotSnapshotId: number; serviceDate: string; slotLabel: string; startTime: string;
  endTime: string; canStartBooking: boolean; bookingEndTime: string | null; dayRemaining: number;
};
type Category = { id: number; name: string; cylinderCount: number; totalPaise: number; advancePaise: number | null };
type Booking = {
  bookingCode: string; serviceDate: string; slotStart: string; slotEnd: string;
  reservationState: string; paymentState: string; source: string; cylinderCount: number;
  vehicleType: string; totalPricePaise: number; amountPaidPaise: number;
  advancePaise: number | null; balancePaise: number | null;
  customerName: string; mobile: string; vehicleRegistration: string; utr: string | null;
};
type Dashboard = {
  date: string; dailyCapacity: number; dailyReserved: number; dailyRemaining: number;
  pendingVerificationCount: number; slots: SlotUnit[];
};

const vehicleTypes = ['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other'];

const copy = {
  en: {
    eyebrow: 'Operations / Reception', title: 'Daily booking desk', sub: 'One live ledger for website, phone, WhatsApp and walk-in appointments.',
    date: 'Appointment date', refresh: 'Refresh', booked: 'Cylinder-work units reserved', capacity: 'Available work units', free: 'Free',
    pending: 'Awaiting payment verification', slots: '20-minute work units', add: 'Create a manual booking',
    name: 'Customer name', mobile: 'Mobile number', vehicle: 'Vehicle type', model: 'Make / model', registration: 'Vehicle registration',
    cylinder: 'How many CNG gas cylinders are fitted?', time: 'Available start time', duration: 'Reserved time',
    source: 'Booking source', phone: 'Phone', whatsapp: 'WhatsApp', walkin: 'Walk-in',
    payment: 'Full payment collected at counter', save: 'Create booking', bookings: 'Appointments',
    code: 'Booking', customer: 'Customer', vehicleCol: 'Vehicle', timeCol: 'Time', cylinders: 'CNG cylinders',
    status: 'Status', paymentStatus: 'Payment', actions: 'Actions',
    loading: 'Loading desk…', empty: 'No appointments for this date.', error: 'Could not load the receptionist desk.',
    saved: 'Manual booking created and consecutive cylinder-work units reserved.', verify: 'Verify payment',
    reject: 'Reject', cancel: 'Cancel', checkin: 'Check in', start: 'Start work', complete: 'Mark completed',
    screenshot: 'View screenshot', loadFail: 'Action failed. Refresh and check the current booking status.',
    markPaid: 'Mark paid at counter', language: 'हिंदी', noSlots: 'No consecutive start times are available for this date and cylinder count.',
    choose: 'Choose…', reload: 'Loading…', price: 'Estimated total', otherHint: 'Enter the vehicle make / model for Other.',
    more: 'More than 12 cylinders must be referred to the owner for a manual assessment.'
  },
  hi: {
    eyebrow: 'संचालन / रिसेप्शन', title: 'दैनिक बुकिंग डेस्क', sub: 'वेबसाइट, फोन, व्हाट्सऐप और वॉक-इन अपॉइंटमेंट का साझा रिकॉर्ड।',
    date: 'अपॉइंटमेंट की तारीख', refresh: 'रीफ्रेश', booked: 'आरक्षित कार्य इकाइयाँ', capacity: 'उपलब्ध कार्य इकाइयाँ', free: 'खाली',
    pending: 'भुगतान सत्यापन लंबित', slots: '20-मिनट कार्य इकाइयाँ', add: 'मैनुअल बुकिंग बनाएँ',
    name: 'ग्राहक का नाम', mobile: 'मोबाइल नंबर', vehicle: 'वाहन का प्रकार', model: 'कंपनी / मॉडल', registration: 'वाहन रजिस्ट्रेशन',
    cylinder: 'वाहन में कितने CNG गैस सिलेंडर लगे हैं?', time: 'उपलब्ध शुरू होने का समय', duration: 'आरक्षित समय',
    source: 'बुकिंग का माध्यम', phone: 'फोन', whatsapp: 'व्हाट्सऐप', walkin: 'वॉक-इन',
    payment: 'काउंटर पर पूरा भुगतान प्राप्त हुआ', save: 'बुकिंग बनाएँ', bookings: 'अपॉइंटमेंट',
    code: 'बुकिंग', customer: 'ग्राहक', vehicleCol: 'वाहन', timeCol: 'समय', cylinders: 'CNG सिलेंडर',
    status: 'स्थिति', paymentStatus: 'भुगतान', actions: 'कार्रवाई',
    loading: 'डेस्क लोड हो रही है…', empty: 'इस तारीख के लिए कोई अपॉइंटमेंट नहीं है।', error: 'रिसेप्शन डेस्क लोड नहीं हो सकी।',
    saved: 'मैनुअल बुकिंग बन गई और लगातार कार्य इकाइयाँ आरक्षित हो गईं।', verify: 'भुगतान सत्यापित करें',
    reject: 'अस्वीकार करें', cancel: 'रद्द करें', checkin: 'चेक-इन', start: 'काम शुरू करें', complete: 'पूरा हुआ',
    screenshot: 'स्क्रीनशॉट देखें', loadFail: 'कार्रवाई असफल रही। रीफ्रेश करके वर्तमान स्थिति जांचें।',
    markPaid: 'काउंटर पर भुगतान दर्ज करें', language: 'English', noSlots: 'इस तारीख और सिलेंडर संख्या के लिए लगातार शुरू होने का समय उपलब्ध नहीं है।',
    choose: 'चुनें…', reload: 'लोड हो रहा है…', price: 'अनुमानित कुल राशि', otherHint: 'Other चुनने पर वाहन कंपनी / मॉडल भरें।',
    more: '12 से अधिक सिलेंडर के लिए मालिक से मैनुअल आकलन करवाएँ।'
  }
};

function businessToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function money(paise: number | null) {
  return paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}
function statusLabel(state: string, locale: Locale) {
  if (locale === 'en') return state.replaceAll('_', ' ');
  const labels: Record<string,string> = {
    HELD: 'होल्ड', PENDING_VERIFICATION: 'सत्यापन लंबित', CONFIRMED: 'कन्फर्म', CHECKED_IN: 'चेक-इन',
    IN_PROGRESS: 'कार्य जारी', COMPLETED: 'पूर्ण', CANCELLED: 'रद्द', EXPIRED: 'समय समाप्त',
    REJECTED: 'अस्वीकृत', ADVANCE_PENDING: 'अग्रिम लंबित', EVIDENCE_SUBMITTED: 'प्रमाण जमा',
    ADVANCE_VERIFIED: 'अग्रिम सत्यापित', PAID_AT_COUNTER: 'काउंटर पर भुगतान', NOT_REQUIRED: 'लागू नहीं'
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
  const [startSlots, setStartSlots] = useState<StartSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [registration, setRegistration] = useState('');
  const [vehicleType, setVehicleType] = useState('Car');
  const [vehicleModel, setVehicleModel] = useState('');
  const [cylinderCount, setCylinderCount] = useState(1);
  const [slotId, setSlotId] = useState('');
  const [source, setSource] = useState<'PHONE'|'WHATSAPP'|'WALKIN'>('PHONE');
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const category = categories.find((item) => item.cylinderCount === cylinderCount);
  const vehicleDescription = vehicleType === 'Other'
    ? vehicleModel.trim()
    : vehicleModel.trim() ? vehicleType + ' - ' + vehicleModel.trim() : vehicleType;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setStartSlots([]);
    setSlotId('');
    try {
      const [dashRes, bookingsRes, catsRes, availabilityRes] = await Promise.all([
        fetch(`/api/admin/dashboard?date=${encodeURIComponent(date)}`),
        fetch(`/api/admin/bookings?fromDate=${encodeURIComponent(date)}`),
        fetch(`/api/public/vehicle-categories?locale=${locale}`),
        fetch(`/api/admin/availability?locale=${locale}&fromDate=${encodeURIComponent(date)}&days=1&cylinderCount=${cylinderCount}`),
      ]);
      const [dash, book, cats, availability] = await Promise.all([
        dashRes.json(), bookingsRes.json(), catsRes.json(), availabilityRes.json()
      ]) as any[];
      if (!dashRes.ok || !bookingsRes.ok || !catsRes.ok || !availabilityRes.ok) {
        throw new Error(dash.error?.message ?? book.error?.message ?? cats.error?.message ?? availability.error?.message ?? t.error);
      }
      const validStarts = (availability.data.slots ?? []).filter((slot: StartSlot) =>
        slot.serviceDate === date && slot.canStartBooking
      );
      setDashboard(dash.data);
      setBookings(book.data.rows ?? []);
      setCategories(cats.data.categories ?? []);
      setStartSlots(validStarts);
      setSlotId((current) => validStarts.some((slot: StartSlot) => String(slot.slotSnapshotId) === current)
        ? current : String(validStarts[0]?.slotSnapshotId ?? ''));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.error);
      setStartSlots([]);
      setSlotId('');
    } finally {
      setLoading(false);
    }
  }, [date, locale, cylinderCount]);

  useEffect(() => { void load(); }, [load]);

  const handleVehicleChange = (value: string) => {
    setVehicleType(value);
    setVehicleModel('');
    setCylinderCount(value === 'Truck' ? 4 : 1);
    setSlotId('');
  };

  const handleCylinderChange = (value: string) => {
    setCylinderCount(Number(value));
    setSlotId('');
  };

  const submitManualBooking = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!category || !slotId || !vehicleDescription || busy) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/manual-bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale, slotSnapshotId: Number(slotId), categoryId: category.id,
          vehicleType: vehicleDescription, customerName: name, mobile,
          vehicleRegistration: registration, source, paymentCollected, idempotencyKey
        })
      });
      const payload: any = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? t.loadFail);
      setMessage(t.saved + ' ' + payload.data.bookingCode);
      setName(''); setMobile(''); setRegistration(''); setVehicleModel('');
      setVehicleType('Car'); setCylinderCount(1); setPaymentCollected(false);
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
        ...(booking.paymentState !== 'PAID_AT_COUNTER' ? [
          { key: 'MARK_PAID_AT_COUNTER', text: t.markPaid, cls: 'admin-button secondary' }
        ] : []),
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
                  <div className="admin-slot-head"><span>{slot.startTime}–{slot.endTime}{!slot.isPublic ? ' · Staff only' : ''}</span><strong>{slot.reserved}/{slot.capacity}</strong></div>
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
                <label className="admin-field">{t.vehicle}
                  <select className="admin-select" required value={vehicleType} onChange={(e) => handleVehicleChange(e.target.value)}>
                    {vehicleTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="admin-field">{t.model}
                  <input className="admin-input" required={vehicleType === 'Other'} value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="e.g. Tata 407, Maruti WagonR" />
                </label>
                <label className="admin-field">{t.registration}<input className="admin-input" required minLength={4} value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} /></label>
                <label className="admin-field">{t.cylinder}
                  <select className="admin-select" required value={cylinderCount} onChange={(e) => handleCylinderChange(e.target.value)}>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((count) =>
                      <option key={count} value={count}>{count} {count === 1 ? 'cylinder' : 'cylinders'}</option>
                    )}
                  </select>
                </label>
                {category && <p className="admin-note">{t.price}: {money(category.totalPaise)}</p>}
                {vehicleType === 'Other' && <p className="admin-note">{t.otherHint}</p>}
                <label className="admin-field">{t.time}
                  <select className="admin-select" required value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                    <option value="">{t.choose}</option>
                    {startSlots.map((slot) => <option key={slot.slotSnapshotId} value={slot.slotSnapshotId}>{slot.startTime}–{slot.bookingEndTime} · {cylinderCount} {t.cylinders}</option>)}
                  </select>
                </label>
                <label className="admin-field">{t.source}<select className="admin-select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}><option value="PHONE">{t.phone}</option><option value="WHATSAPP">{t.whatsapp}</option><option value="WALKIN">{t.walkin}</option></select></label>
                <label className="admin-check"><input type="checkbox" checked={paymentCollected} onChange={(e) => setPaymentCollected(e.target.checked)} />{t.payment}</label>
                <button className="admin-button" type="submit" disabled={busy || loading || !category || !startSlots.length || !slotId || !vehicleDescription || (vehicleType === 'Other' && !vehicleModel.trim())}>{busy ? t.reload : t.save}</button>
                <p className="admin-note">{t.more}</p>
              </form>
            </section>
          </div>

          <section className="admin-card">
            <h2 className="admin-section-title">{t.bookings}</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{t.code}</th><th>{t.customer}</th><th>{t.vehicleCol}</th><th>{t.timeCol}</th><th>{t.cylinders}</th><th>{t.status}</th><th>{t.paymentStatus}</th><th>{t.actions}</th></tr></thead>
                <tbody>
                  {bookings.length ? bookings.map((booking) => (
                    <tr key={booking.bookingCode}>
                      <td><strong>{booking.bookingCode}</strong><div className="admin-note">{booking.source}</div></td>
                      <td>{booking.customerName}<div className="admin-note">{booking.mobile}</div></td>
                      <td>{booking.vehicleType}<div className="admin-note">{booking.vehicleRegistration}</div></td>
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
