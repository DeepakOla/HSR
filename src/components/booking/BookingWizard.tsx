import { useEffect, useMemo, useState } from 'react';

type Locale = 'en' | 'hi';

interface Slot {
  slotSnapshotId: number;
  serviceDate: string;
  slotLabel: string;
  slotCapacity: number;
  slotRemaining: number;
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

interface Props {
  locale: Locale;
}

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function inr(paise: number | null) {
  if (paise == null) return 'SETUP_REQUIRED';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}

export default function BookingWizard({ locale }: Props) {
  const [step, setStep] = useState(1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayInIndia());
  const [loadError, setLoadError] = useState('');
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [registration, setRegistration] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any>(null);
  const [utr, setUtr] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submittingHold, setSubmittingHold] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [availabilityRes, categoriesRes] = await Promise.all([
          fetch(`/api/public/availability?locale=${locale}&fromDate=${encodeURIComponent(date)}`),
          fetch(`/api/public/vehicle-categories?locale=${locale}`),
        ]);
        const availability: any = await availabilityRes.json();
        const cats: any = await categoriesRes.json();
        if (!availabilityRes.ok || !categoriesRes.ok) throw new Error(availability.error?.message ?? cats.error?.message ?? 'Could not load availability');
        setSlots((availability.data.slots ?? []).filter((slot: Slot) => slot.serviceDate === date));
        setCategories(cats.data.categories ?? []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load availability');
        setSlots([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [locale, date]);

  const filteredCategories = useMemo(() => {
    if (!selectedSlot) return [];
    return categories.map((category) => ({
      ...category,
      disabled: category.cylinderCount > selectedSlot.slotRemaining || category.cylinderCount > selectedSlot.dayRemaining,
    }));
  }, [categories, selectedSlot]);

  const canContinueStep1 = !!selectedSlot;
  const canContinueStep2 = !!selectedCategory;
  const canContinueStep3 = name.trim().length >= 2 && /^\d{10}$/.test(mobile.replace(/\D/g, '')) && registration.trim().length >= 4;

  const createHold = async () => {
    if (!selectedSlot || !selectedCategory) return;
    if (submittingHold) return;
    const requestKey = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(requestKey);
    setSubmittingHold(true);
    try {
    const response = await fetch('/api/booking/create-hold', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locale,
        slotSnapshotId: selectedSlot.slotSnapshotId,
        categoryId: selectedCategory.id,
        customerName: name,
        mobile,
        vehicleRegistration: registration,
        source: 'WEB',
        idempotencyKey: requestKey,
      }),
    });
    const payload: any = await response.json();
    if (!response.ok) {
      setMessage(payload.error?.message ?? 'Failed to create hold');
      return;
    }
    setResult(payload.data);
    setMessage('');
    } catch {
      setMessage(locale === 'en' ? 'Network error. Retry safely using the same request.' : 'नेटवर्क त्रुटि। उसी अनुरोध के साथ सुरक्षित रूप से पुनः प्रयास करें।');
    } finally {
      setSubmittingHold(false);
    }
  };

  const submitUtr = async () => {
    if (!result?.bookingCode || !utr.trim() || submittingEvidence || evidenceSubmitted) return;
    setSubmittingEvidence(true);
    try {
    const response = await fetch('/api/booking/submit-evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingCode: result.bookingCode, statusToken: result.statusToken, utr, source: 'WEB' }),
    });
    const payload: any = await response.json();
    if (!response.ok) {
      setMessage(payload.error?.message ?? 'Failed to submit evidence');
      return;
    }
    setEvidenceSubmitted(true);
    setMessage(locale === 'en' ? 'Evidence submitted. Your cylinders remain reserved while reception verifies payment.' : 'प्रमाण जमा हो गया। रिसेप्शन द्वारा भुगतान सत्यापन तक सिलेंडर आरक्षित रहेंगे।');
    } catch {
      setMessage(locale === 'en' ? 'Network error. Please retry.' : 'नेटवर्क त्रुटि। कृपया फिर प्रयास करें।');
    } finally { setSubmittingEvidence(false); }
  };

  if (loading) return <p>{locale === 'en' ? 'Loading availability...' : 'उपलब्धता लोड हो रही है...'}</p>;

  return (
    <section aria-label={locale === 'en' ? 'Booking wizard' : 'बुकिंग विज़ार्ड'}>
      <ol style={{ display: 'flex', gap: '0.6rem', padding: 0, listStyle: 'none' }}>
        {[1, 2, 3].map((n) => (
          <li key={n} style={{ padding: '0.35rem .7rem', borderRadius: 999, background: n === step ? '#0f4a34' : '#d9e0dc', color: n === step ? '#fff' : '#1e2428' }}>
            {locale === 'en' ? `Step ${n}` : `चरण ${n}`}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div>
          <h2>{locale === 'en' ? 'Step 1: Date and slot' : 'चरण 1: तारीख और स्लॉट'}</h2>
          <label style={{ display: 'grid', gap: '.35rem', maxWidth: 320, marginBottom: '1rem' }}>
            {locale === 'en' ? 'Choose appointment date' : 'अपॉइंटमेंट की तारीख चुनें'}
            <input type="date" min={todayInIndia()} value={date} disabled={!!result} onChange={(event) => { setDate(event.target.value); setSelectedSlot(null); setSelectedCategory(null); setIdempotencyKey(''); setMessage(''); }} style={{ minHeight: 56, width: '100%' }} />
          </label>
          {loadError && <p role="alert">{loadError}</p>}
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {slots.map((slot) => (
              <button
                key={slot.slotSnapshotId}
                type="button"
                disabled={!!result}
                onClick={() => {
                  setSelectedSlot(slot);
                  setSelectedCategory(null);
                  setResult(null);
                  setIdempotencyKey('');
                }}
                style={{ minHeight: 56, textAlign: 'left', borderRadius: 8, border: '1px solid #d9e0dc', background: selectedSlot?.slotSnapshotId === slot.slotSnapshotId ? '#eaf7f2' : '#fff' }}
              >
                {slot.serviceDate} • {slot.slotLabel} • {locale === 'en' ? 'Remaining' : 'शेष'} {slot.slotRemaining}
              </button>
            ))}
          </div>
          <button className="cta cta-primary" disabled={!canContinueStep1} style={{ marginTop: '1rem' }} onClick={() => setStep(2)}>
            {locale === 'en' ? 'Continue' : 'आगे बढ़ें'}
          </button>
          {!slots.length && !loading && <p>{locale === 'en' ? 'No available slots for this date. Choose another date or contact reception.' : 'इस तारीख के लिए कोई स्लॉट उपलब्ध नहीं है। दूसरी तारीख चुनें या रिसेप्शन से संपर्क करें।'}</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>{locale === 'en' ? 'Step 2: Vehicle category' : 'चरण 2: वाहन श्रेणी'}</h2>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {filteredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                disabled={category.disabled || !!result || category.advancePaise == null || category.advancePaise <= 0}
                onClick={() => { setSelectedCategory(category); setResult(null); setIdempotencyKey(''); }}
                style={{ minHeight: 56, textAlign: 'left', borderRadius: 8, border: '1px solid #d9e0dc', opacity: category.disabled ? 0.55 : 1, background: selectedCategory?.id === category.id ? '#eaf7f2' : '#fff' }}
              >
                <strong>{category.name}</strong> • {category.cylinderCount} {locale === 'en' ? 'cylinders' : 'सिलेंडर'} • {inr(category.totalPaise)}{category.advancePaise == null ? (locale === 'en' ? ' • Advance policy needs setup' : ' • अग्रिम भुगतान सेटअप आवश्यक') : ''}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '.7rem', marginTop: '1rem' }}>
            <button className="cta cta-secondary" disabled={!!result} onClick={() => setStep(1)}>{locale === 'en' ? 'Back' : 'वापस'}</button>
            <button className="cta cta-primary" disabled={!canContinueStep2} onClick={() => setStep(3)}>{locale === 'en' ? 'Continue' : 'आगे बढ़ें'}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>{locale === 'en' ? 'Step 3: Customer details' : 'चरण 3: ग्राहक विवरण'}</h2>
          <label>{locale === 'en' ? 'Name' : 'नाम'}<input style={{ minHeight: 56, width: '100%' }} value={name} onChange={(e) => { setName(e.target.value); setIdempotencyKey(''); }} /></label>
          <label>{locale === 'en' ? 'Mobile' : 'मोबाइल'}<input style={{ minHeight: 56, width: '100%' }} value={mobile} onChange={(e) => { setMobile(e.target.value); setIdempotencyKey(''); }} /></label>
          <label>{locale === 'en' ? 'Vehicle registration' : 'वाहन नंबर'}<input style={{ minHeight: 56, width: '100%' }} value={registration} onChange={(e) => { setRegistration(e.target.value.toUpperCase()); setIdempotencyKey(''); }} /></label>
          <div style={{ display: 'flex', gap: '.7rem', marginTop: '1rem' }}>
            {!result && <button className="cta cta-secondary" onClick={() => setStep(2)}>{locale === 'en' ? 'Back' : 'वापस'}</button>}
            {!result && <button className="cta cta-primary" disabled={!canContinueStep3 || submittingHold || selectedCategory?.advancePaise == null || selectedCategory.advancePaise <= 0} onClick={createHold}>{submittingHold ? (locale === 'en' ? 'Creating hold...' : 'होल्ड बनाया जा रहा है...') : (locale === 'en' ? 'Create hold' : 'होल्ड बनाएं')}</button>}
          </div>

          {result && (
            <section className="card" style={{ marginTop: '1rem' }}>
              <h3>{locale === 'en' ? 'Booking created' : 'बुकिंग बन गई'}</h3>
              <p>{locale === 'en' ? 'Booking code:' : 'बुकिंग कोड:'} <strong>{result.bookingCode}</strong></p>
              <p>{locale === 'en' ? 'Hold expires at:' : 'होल्ड समाप्ति:'} {result.holdExpiresAt}</p>
              <p>{locale === 'en' ? 'Payment status:' : 'भुगतान स्थिति:'} {evidenceSubmitted ? 'PENDING_VERIFICATION' : 'ADVANCE_PENDING'}</p>
              <p>{locale === 'en' ? 'Reservation state:' : 'बुकिंग स्थिति:'} {evidenceSubmitted ? 'PENDING_VERIFICATION' : 'HELD'}</p>
              <hr />
              <p>{locale === 'en' ? 'Base price' : 'मूल कीमत'}: {inr(result.pricing.basePricePaise)}</p>
              <p>{locale === 'en' ? 'GST' : 'GST'} ({(result.pricing.gstRateBps / 100).toFixed(2)}%): {inr(result.pricing.gstAmountPaise)}</p>
              <p><strong>{locale === 'en' ? 'Total price' : 'कुल कीमत'}: {inr(result.pricing.totalPricePaise)}</strong></p>
              <p>{locale === 'en' ? 'Advance payable now' : 'अभी देय अग्रिम'}: {inr(result.pricing.advancePaise)}</p>
              <p>{locale === 'en' ? 'Balance at workshop' : 'वर्कशॉप पर शेष'}: {inr(result.pricing.balancePaise)}</p>
              <p>{locale === 'en' ? 'UPI ID:' : 'यूपीआई आईडी:'} {result.paymentConfig.vpaId}</p>

              {result.upiUri && (
                <p><a href={result.upiUri}>{locale === 'en' ? 'Pay via UPI app' : 'UPI ऐप से भुगतान करें'}</a></p>
              )}
              {result.upiQrDataUrl && (
                <img src={result.upiQrDataUrl} alt={locale === 'en' ? 'UPI payment QR' : 'यूपीआई भुगतान क्यूआर'} width={220} height={220} />
              )}
              {!result.uploadEnabled && result.uploadUnavailableReason && <p>{result.uploadUnavailableReason}</p>}
              <label>{locale === 'en' ? 'UTR/reference number' : 'UTR/रेफरेंस नंबर'}<input style={{ minHeight: 56, width: '100%' }} value={utr} onChange={(e) => setUtr(e.target.value)} /></label>
              <button className="cta cta-primary" disabled={!utr.trim() || submittingEvidence || evidenceSubmitted} onClick={submitUtr}>{submittingEvidence ? (locale === 'en' ? 'Submitting…' : 'जमा हो रहा है…') : (locale === 'en' ? 'Submit payment evidence' : 'भुगतान प्रमाण जमा करें')}</button>

              {result.uploadEnabled && !evidenceSubmitted && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget as HTMLFormElement);
                    form.set('bookingCode', result.bookingCode);
                    form.set('statusToken', result.statusToken);
                    const uploadRes = await fetch('/api/booking/upload-evidence', { method: 'POST', body: form });
                    const uploadPayload: any = await uploadRes.json();
                    if (!uploadRes.ok) {
                      setMessage(uploadPayload.error?.message ?? 'Upload failed');
                      return;
                    }
                    setEvidenceSubmitted(true);
                    setMessage(locale === 'en' ? 'Screenshot uploaded. Your cylinders remain reserved while reception verifies payment.' : 'स्क्रीनशॉट अपलोड हो गया। रिसेप्शन द्वारा भुगतान सत्यापन तक सिलेंडर आरक्षित रहेंगे।');
                  }}
                >
                  <input type="hidden" name="bookingCode" value={result.bookingCode} />
                  <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
                  <button className="cta cta-secondary" type="submit">{locale === 'en' ? 'Upload screenshot (optional)' : 'स्क्रीनशॉट अपलोड करें (वैकल्पिक)'}</button>
                </form>
              )}
              {result.paymentConfig.whatsappNumber && result.paymentConfig.whatsappNumber !== 'SETUP_REQUIRED' && <p><a target="_blank" rel="noreferrer" href={`https://wa.me/${result.paymentConfig.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`HSR booking ${result.bookingCode}\nVehicle: ${registration}\nDate: ${date}\nSlot: ${selectedSlot?.slotLabel}\nCylinders: ${selectedCategory?.cylinderCount}\nCustomer: ${name}\nMobile: ${mobile}`)}`}>{locale === 'en' ? 'Send payment screenshot via WhatsApp' : 'WhatsApp पर भुगतान स्क्रीनशॉट भेजें'}</a></p>}
              <p>
                <a href={`/${locale}/status/?booking=${encodeURIComponent(result.bookingCode)}&token=${encodeURIComponent(result.statusToken)}`}>
                  {locale === 'en' ? 'View secure status' : 'सुरक्षित स्थिति देखें'}
                </a>
              </p>
            </section>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
