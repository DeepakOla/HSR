import { useEffect, useMemo, useState } from 'react';

type Locale = 'en' | 'hi';
interface Slot {
  slotSnapshotId: number;
  serviceDate: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  canStartBooking: boolean;
  bookingEndTime: string | null;
  dayRemaining: number;
}
interface Category {
  id: number;
  code: string;
  name: string;
  cylinderCount: number;
  basePricePaise: number;
  gstRateBps: number;
  gstPaise: number;
  totalPaise: number;
  advancePaise: number | null;
}
interface Props { locale: Locale; }
const vehicleTypes = ['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other'];

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}
function addDays(value: string, days: number) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function inr(paise: number | null) {
  return paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}
function monthTitle(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export default function BookingWizard({ locale }: Props) {
  const hindi = locale === 'hi';
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(todayInIndia());
  const [month, setMonth] = useState(() => {
    const now = new Date(todayInIndia() + 'T00:00:00Z');
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [vehicleClass, setVehicleClass] = useState('Car');
  const [vehicleModel, setVehicleModel] = useState('');
  const [cylinderCount, setCylinderCount] = useState(1);
  const [moreThan12Selected, setMoreThan12Selected] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [registration, setRegistration] = useState('');
  const [utr, setUtr] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any>(null);
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      setSlots([]);
      setSelectedSlotId(null);
      try {
        const [availabilityRes, categoriesRes] = await Promise.all([
          fetch('/api/public/availability?locale=' + locale + '&fromDate=' + encodeURIComponent(todayInIndia()) + '&days=60&cylinderCount=' + cylinderCount),
          fetch('/api/public/vehicle-categories?locale=' + locale),
        ]);
        const availability: any = await availabilityRes.json();
        const categoryPayload: any = await categoriesRes.json();
        if (!availabilityRes.ok || !categoriesRes.ok) throw new Error(availability.error?.message ?? categoryPayload.error?.message ?? 'Could not load appointment availability');
        if (!cancelled) {
          setSlots(availability.data.slots ?? []);
          setCategories(categoryPayload.data.categories ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load availability');
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [locale, cylinderCount]);

  const category = categories.find((item) => item.cylinderCount === cylinderCount);
  const availableStarts = useMemo(
    () => slots.filter((slot) => slot.canStartBooking),
    [slots]
  );
  const availableByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of availableStarts) map.set(slot.serviceDate, [...(map.get(slot.serviceDate) ?? []), slot]);
    return map;
  }, [availableStarts]);
  const selectedDateSlots = availableByDate.get(date) ?? [];
  const selectedSlot = selectedDateSlots.find((slot) => slot.slotSnapshotId === selectedSlotId) ?? null;

  const today = todayInIndia();
  const lastDate = addDays(today, 59);
  const monthYear = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(monthYear, monthIndex, 1)).getUTCDay();
  const monthDays = new Date(Date.UTC(monthYear, monthIndex + 1, 0)).getUTCDate();
  const calendarCells = Array.from({ length: Math.ceil((firstWeekday + monthDays) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > monthDays) return null;
    return new Date(Date.UTC(monthYear, monthIndex, day)).toISOString().slice(0, 10);
  });

  const setVehicle = (value: string) => {
    setVehicleClass(value);
    setMoreThan12Selected(false);
    setCylinderCount(value === 'Truck' ? 4 : 1);
    setSelectedSlotId(null);
  };
  const chooseCylinderCount = (value: string) => {
    if (value === 'more') {
      setMoreThan12Selected(true);
      setMessage('');
      setSelectedSlotId(null);
      return;
    }
    setMoreThan12Selected(false);
    setMessage('');
    setCylinderCount(Number(value));
    setSelectedSlotId(null);
  };
  const selectDate = (value: string) => {
    setDate(value);
    setSelectedSlotId(null);
    setMessage('');
  };
  const vehicleDescription = vehicleClass === 'Other'
    ? vehicleModel.trim()
    : vehicleModel.trim() ? vehicleClass + ' - ' + vehicleModel.trim() : vehicleClass;

  const createHold = async () => {
    if (!category || !selectedSlot || !vehicleDescription || busy) return;
    if (category.advancePaise == null || category.advancePaise <= 0) {
      setMessage(hindi
        ? 'ऑनलाइन अग्रिम भुगतान नीति अभी सेट नहीं है। कृपया फोन पर बुकिंग करें।'
        : 'Online advance-payment settings are not configured for this cylinder count. Please book by phone.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/booking/create-hold', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
          slotSnapshotId: selectedSlot.slotSnapshotId,
          categoryId: category.id,
          vehicleType: vehicleDescription,
          customerName: name,
          mobile,
          vehicleRegistration: registration,
          source: 'WEB',
          idempotencyKey,
        }),
      });
      const payload: any = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not create booking');
      setResult(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Booking failed. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const submitUtr = async () => {
    if (!result?.bookingCode || !utr.trim() || busy || evidenceSubmitted) return;
    setBusy(true);
    try {
      const response = await fetch('/api/booking/submit-evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingCode: result.bookingCode, statusToken: result.statusToken, utr, source: 'WEB' }),
      });
      const payload: any = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not submit payment reference');
      setEvidenceSubmitted(true);
      setMessage(hindi ? 'भुगतान संदर्भ जमा हो गया। रिसेप्शन सत्यापन करेगा।' : 'Payment reference submitted. Reception will verify it.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit payment reference');
    } finally { setBusy(false); }
  };

  const labels = hindi
    ? { steps: ['तारीख', 'वाहन', 'सिलेंडर', 'समय', 'विवरण'], date: 'अपॉइंटमेंट की तारीख चुनें', vehicle: 'आपका वाहन कौन सा है?', model: 'वाहन का मॉडल / विवरण', cylinder: 'वाहन में कितने CNG गैस सिलेंडर लगे हैं?', time: 'उपलब्ध समय चुनें', customer: 'ग्राहक विवरण', name: 'पूरा नाम', mobile: 'मोबाइल नंबर', registration: 'वाहन रजिस्ट्रेशन नंबर', back: 'वापस', next: 'आगे बढ़ें', continue: 'आगे', loading: 'उपलब्धता लोड हो रही है…', noDate: 'इस तारीख पर चुने गए सिलेंडर संख्या के लिए लगातार समय उपलब्ध नहीं है।', noTime: 'इस तारीख पर कोई उपयुक्त समय उपलब्ध नहीं है।', choose: 'चुनें', price: 'मूल सेवा शुल्क', gst: 'GST (18%)', total: 'कुल राशि', advance: 'अग्रिम', balance: 'अग्रिम के बाद शेष राशि', weekday: ['रवि','सोम','मंगल','बुध','गुरु','शुक्र','शनि'], contact: '12 से अधिक सिलेंडर? फोन पर बुकिंग करें।' }
    : { steps: ['Date', 'Vehicle', 'Cylinders', 'Time', 'Details'], date: 'Choose appointment date', vehicle: 'Which vehicle do you have?', model: 'Vehicle make / model (optional)', cylinder: 'How many CNG gas cylinders are fitted to this vehicle?', time: 'Choose an available start time', customer: 'Customer details', name: 'Full name', mobile: 'Mobile number', registration: 'Vehicle registration number', back: 'Back', next: 'Continue', continue: 'Continue', loading: 'Loading availability…', noDate: 'There is no continuous appointment time for this cylinder count on this date.', noTime: 'No suitable appointments are available on this date.', choose: 'Select', price: 'Base service charge', gst: 'GST (18%)', total: 'Total amount', advance: 'Advance', balance: 'Balance after advance', weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], contact: 'More than 12 cylinders? Book by phone.' };

  return (
    <section aria-label={hindi ? 'बुकिंग फ़ॉर्म' : 'Booking form'}>
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem', padding: 0, listStyle: 'none' }}>
        {labels.steps.map((item, index) => <li key={item} style={{ padding: '.4rem .65rem', borderRadius: 999, background: step === index + 1 ? '#0f4a34' : '#e4e9e6', color: step === index + 1 ? '#fff' : '#26322b' }}>{index + 1}. {item}</li>)}
      </ol>

      {step === 1 && (
        <div>
          <h2>{labels.date}</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: '.75rem' }}>
            <button type="button" disabled={monthYear === new Date(today + 'T00:00:00Z').getUTCFullYear() && monthIndex === new Date(today + 'T00:00:00Z').getUTCMonth()} onClick={() => setMonth(new Date(Date.UTC(monthYear, monthIndex - 1, 1)))} aria-label="Previous month">←</button>
            <strong>{monthTitle(month, locale)}</strong>
            <button type="button" disabled={new Date(Date.UTC(monthYear, monthIndex + 1, 1)).toISOString().slice(0,10) > lastDate} onClick={() => setMonth(new Date(Date.UTC(monthYear, monthIndex + 1, 1)))} aria-label="Next month">→</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: '.35rem' }}>
            {labels.weekday.map((day) => <div key={day} style={{ textAlign: 'center', fontSize: '.8rem', fontWeight: 700 }}>{day}</div>)}
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
              );
            })}
          </div>
          <p style={{ fontSize: '.85rem', color: '#a12622' }}>Red dates are fully booked or have no continuous time long enough for {cylinderCount} cylinder(s).</p>
          {loadError && <p role="alert">{loadError}</p>}
          <button className="cta cta-primary" disabled={!selectedDateSlots.length || !!result} style={{ marginTop: '1rem' }} onClick={() => setStep(2)}>{labels.next}</button>
          {loading && <p>{labels.loading}</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>{labels.vehicle}</h2>
          <label style={{ display: 'grid', gap: '.4rem', maxWidth: 420 }}>
            {hindi ? 'वाहन का प्रकार' : 'Vehicle type'}
            <select value={vehicleClass} disabled={!!result} onChange={(event) => setVehicle(event.target.value)} style={{ minHeight: 52, padding: '.5rem' }}>
              {vehicleTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '.4rem', maxWidth: 420, marginTop: '.8rem' }}>
            {labels.model}
            <input value={vehicleModel} disabled={!!result} onChange={(event) => setVehicleModel(event.target.value)} placeholder={hindi ? 'जैसे Tata 407, Maruti WagonR' : 'e.g. Tata 407, Maruti WagonR'} style={{ minHeight: 52, width: '100%' }} />
          </label>
          {vehicleClass === 'Truck' && <p>{hindi ? 'ट्रक के लिए 4 CNG सिलेंडर पहले से चुने गए हैं। आप इसे बदल सकते हैं।' : 'Truck selected: 4 CNG cylinders are preselected. You can change this.'}</p>}
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
            <button className="cta cta-secondary" onClick={() => setStep(1)}>{labels.back}</button>
            <button className="cta cta-primary" disabled={!vehicleDescription || !!result} onClick={() => setStep(3)}>{labels.next}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>{labels.cylinder}</h2>
          <label style={{ display: 'grid', gap: '.4rem', maxWidth: 420 }}>
            {hindi ? 'CNG सिलेंडर की संख्या' : 'CNG cylinder count'}
            <select value={moreThan12Selected ? 'more' : String(cylinderCount)} disabled={!!result} onChange={(event) => chooseCylinderCount(event.target.value)} style={{ minHeight: 52, padding: '.5rem' }}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {hindi ? 'सिलेंडर' : count === 1 ? 'cylinder' : 'cylinders'}</option>)}
              <option value="more">{hindi ? '12 से अधिक' : 'More than 12'}</option>
            </select>
          </label>
          {moreThan12Selected ? (
            <p style={{ marginTop: '.6rem' }}>
              {labels.contact} <a href={'/' + locale + '/contact/'}>{hindi ? 'संपर्क करें' : 'Contact the centre'}</a>.
            </p>
          ) : null}
          {!moreThan12Selected && !category && <p role="alert">{hindi ? 'इस सिलेंडर संख्या की ऑनलाइन कीमत उपलब्ध नहीं है। कृपया केंद्र से संपर्क करें।' : 'Online pricing is not enabled for this cylinder count. Please contact the centre.'}</p>}
          {!moreThan12Selected && category && (
            <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
              <p>{labels.price}: {inr(category.basePricePaise)}</p>
              <p>{labels.gst}: {inr(category.gstPaise)}</p>
              <p><strong>{labels.total}: {inr(category.totalPaise)}</strong></p>
              <p>{labels.advance}: {inr(category.advancePaise)}</p>
              {category.advancePaise != null && <p>{labels.balance}: {inr(category.totalPaise - category.advancePaise)}</p>}
              {category.advancePaise == null && <p role="status">{hindi ? 'इस श्रेणी के लिए ऑनलाइन अग्रिम राशि अभी मालिक द्वारा सेट नहीं की गई है।' : 'The owner has not configured an online advance for this cylinder count yet.'}</p>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
            <button className="cta cta-secondary" onClick={() => setStep(2)}>{labels.back}</button>
            <button className="cta cta-primary" disabled={loading || moreThan12Selected || !category || !!result} onClick={() => { setSelectedSlotId(null); setStep(4); }}>{labels.next}</button>
          </div>
        </div>
      )}

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

      {step === 5 && !result && (
        <div>
          <h2>{labels.customer}</h2>
          <p>{date} · {selectedSlot?.startTime}–{selectedSlot?.bookingEndTime} · {vehicleDescription} · {cylinderCount} {hindi ? 'सिलेंडर' : 'cylinders'}</p>
          <label style={{ display: 'grid', gap: '.35rem' }}>{labels.name}<input style={{ minHeight: 52, width: '100%' }} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label style={{ display: 'grid', gap: '.35rem' }}>{labels.mobile}<input style={{ minHeight: 52, width: '100%' }} inputMode="numeric" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} /></label>
          <label style={{ display: 'grid', gap: '.35rem' }}>{labels.registration}<input style={{ minHeight: 52, width: '100%' }} value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} /></label>
          {category && <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
            <p>{labels.price}: {inr(category.basePricePaise)}</p>
            <p>{labels.gst}: {inr(category.gstPaise)}</p>
            <p><strong>{labels.total}: {inr(category.totalPaise)}</strong></p>
            <p>{labels.advance}: {inr(category.advancePaise)}</p>
          </div>}
          {category?.advancePaise == null && <p role="alert">{hindi ? 'ऑनलाइन बुकिंग चालू करने के लिए मालिक को पहले अग्रिम राशि सेट करनी होगी। अभी फोन बुकिंग उपलब्ध है।' : 'The owner must configure an advance amount before online booking can be enabled. Phone bookings remain available.'}</p>}
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
            <button className="cta cta-secondary" onClick={() => setStep(4)}>{labels.back}</button>
            <button className="cta cta-primary" disabled={busy || !category || category.advancePaise == null || category.advancePaise <= 0 || name.trim().length < 2 || mobile.length !== 10 || registration.trim().length < 4 || !selectedSlot} onClick={createHold}>{busy ? (hindi ? 'बुकिंग बन रही है…' : 'Creating booking…') : (hindi ? 'बुकिंग बनाएँ' : 'Create booking')}</button>
          </div>
        </div>
      )}

      {result && (
        <section className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
          <h3>{hindi ? 'बुकिंग बन गई' : 'Booking created'}</h3>
          <p>{hindi ? 'बुकिंग नंबर' : 'Booking code'}: <strong>{result.bookingCode}</strong></p>
          <p>{hindi ? 'समाप्ति समय' : 'Hold expires'}: {result.holdExpiresAt}</p>
          <p>{hindi ? 'भुगतान स्थिति' : 'Payment status'}: {evidenceSubmitted ? 'PENDING_VERIFICATION' : 'ADVANCE_PENDING'}</p>
          <hr />
          <p>{labels.price}: {inr(result.pricing.basePricePaise)}</p>
          <p>{labels.gst}: {inr(result.pricing.gstAmountPaise)}</p>
          <p><strong>{labels.total}: {inr(result.pricing.totalPricePaise)}</strong></p>
          <p>{labels.advance}: {inr(result.pricing.advancePaise)}</p>
          <p>{labels.balance}: {inr(result.pricing.balancePaise)}</p>
          {result.upiUri && <p><a href={result.upiUri}>{hindi ? 'UPI ऐप से भुगतान करें' : 'Pay using UPI app'}</a></p>}
          {result.upiQrDataUrl && <img src={result.upiQrDataUrl} alt="UPI payment QR" width={220} height={220} />}
          <label style={{ display: 'grid', gap: '.35rem' }}>{hindi ? 'UTR / भुगतान संदर्भ संख्या' : 'UTR / payment reference'}<input style={{ minHeight: 52 }} value={utr} onChange={(event) => setUtr(event.target.value)} /></label>
          <button className="cta cta-primary" disabled={!utr.trim() || busy || evidenceSubmitted} onClick={submitUtr}>{busy ? 'Submitting…' : (hindi ? 'भुगतान संदर्भ जमा करें' : 'Submit payment reference')}</button>
          {message && <p role="status">{message}</p>}
          <p><a href={'/' + locale + '/status/?booking=' + encodeURIComponent(result.bookingCode) + '&token=' + encodeURIComponent(result.statusToken)}>{hindi ? 'बुकिंग की स्थिति देखें' : 'View booking status'}</a></p>
        </section>
      )}
      {message && !result && <p role="status">{message}</p>}
    </section>
  );
}
