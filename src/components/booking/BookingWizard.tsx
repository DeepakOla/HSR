import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../lib/constants';
import { validateVehicleRegistration } from '../../lib/vehicle-registration';
import {
  VEHICLE_OPTIONS,
  PUBLIC_CYLINDER_OPTIONS,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_CONTACT_WHATSAPP,
  DEFAULT_WHATSAPP_URL,
  formatHourOption,
  calculateDurationMinutes,
  buildVehicleDescription,
  todayInIndia,
  addDays,
  inr,
  monthTitle,
} from '../../lib/booking-wizard-helpers';

// Re-export helpers for testability and consumers
export {
  VEHICLE_OPTIONS,
  PUBLIC_CYLINDER_OPTIONS,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_CONTACT_WHATSAPP,
  DEFAULT_WHATSAPP_URL,
  formatHourOption,
  calculateDurationMinutes,
  buildVehicleDescription,
  todayInIndia,
  addDays,
  inr,
  monthTitle,
};

export interface Slot {
  slotSnapshotId: number;
  serviceDate: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  canStartBooking: boolean;
  bookingEndTime: string | null;
  dayRemaining: number;
}

export interface Category {
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

export interface Props {
  locale: Locale;
}

interface PricingBreakdownCardProps {
  basePricePaise: number;
  gstPaise: number;
  totalPaise: number;
  advancePaise: number | null;
  balancePaise?: number | null;
  cylinders: number;
  labels: {
    price: string;
    gst: string;
    total: string;
    advance: string;
    balance: string;
    pricingNotice: string;
  };
  hindi: boolean;
}

export function PricingBreakdownCard({
  basePricePaise,
  gstPaise,
  totalPaise,
  advancePaise,
  balancePaise: propBalancePaise,
  cylinders,
  labels,
  hindi,
}: PricingBreakdownCardProps) {
  const balancePaise = propBalancePaise !== undefined
    ? propBalancePaise
    : (advancePaise != null ? totalPaise - advancePaise : null);

  return (
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '.75rem',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '.5rem',
        }}
      >
        <strong style={{ color: '#0F172A', fontSize: '1rem' }}>
          {hindi
            ? `${cylinders} सिलेंडर शुल्क विवरण`
            : `Fee Breakdown (${cylinders} Cylinder${cylinders > 1 ? 's' : ''})`}
        </strong>
        <span
          style={{
            fontSize: '.8rem',
            padding: '.2rem .5rem',
            background: '#EFF6FF',
            color: '#1E40AF',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          {hindi ? 'मानक दर' : 'Standard Rate'}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '.35rem', fontSize: '.9rem', color: '#334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {labels.price} <small style={{ color: '#64748B' }}>(₹2,500 × {cylinders})</small>:
          </span>
          <span style={{ fontWeight: 600 }}>{inr(basePricePaise)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {labels.gst} <small style={{ color: '#64748B' }}>(₹450 × {cylinders})</small>:
          </span>
          <span style={{ fontWeight: 600 }}>{inr(gstPaise)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 700,
            color: '#0F172A',
            borderTop: '1px solid #E2E8F0',
            paddingTop: '.4rem',
            fontSize: '1rem',
          }}
        >
          <span>{labels.total}:</span>
          <span>{inr(totalPaise)}</span>
        </div>
      </div>

      <div
        style={{
          marginTop: '1rem',
          padding: '.75rem',
          background: '#F8FAFC',
          borderRadius: 6,
          border: '1px solid #E2E8F0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ color: '#0F172A', fontSize: '.95rem' }}>{labels.advance}:</strong>
            <p style={{ margin: 0, fontSize: '.8rem', color: '#64748B' }}>
              {hindi ? 'स्लॉट सुरक्षित करने हेतु फ्लैट टोकन राशि' : 'Flat advance to hold your slot'}
            </p>
          </div>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E40AF' }}>
            {inr(advancePaise)}
          </span>
        </div>
        {balancePaise != null && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '.5rem',
              paddingTop: '.5rem',
              borderTop: '1px dashed #CBD5E1',
              fontSize: '.9rem',
            }}
          >
            <span style={{ color: '#475569' }}>{labels.balance}:</span>
            <strong style={{ color: '#0F172A' }}>{inr(balancePaise)}</strong>
          </div>
        )}
      </div>

      <p style={{ margin: '.6rem 0 0', fontSize: '.8rem', color: '#64748B' }}>
        {labels.pricingNotice}
      </p>
    </div>
  );
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
  const [moreThan6Selected, setMoreThan6Selected] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [registration, setRegistration] = useState('');
  const [regTouched, setRegTouched] = useState(false);
  const [regError, setRegError] = useState('');
  const [utr, setUtr] = useState('');
  const [message, setMessage] = useState('');
  const [serverContact, setServerContact] = useState<{ phone: string; whatsapp: string; whatsappUrl: string } | null>(null);
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
      setSelectedHour('');
      try {
        const [availabilityRes, categoriesRes] = await Promise.all([
          fetch('/api/public/availability?locale=' + locale + '&fromDate=' + encodeURIComponent(todayInIndia()) + '&days=60&cylinderCount=' + cylinderCount),
          fetch('/api/public/vehicle-categories?locale=' + locale),
        ]);
        const availability: any = await availabilityRes.json();
        const categoryPayload: any = await categoriesRes.json();
        if (!availabilityRes.ok || !categoriesRes.ok) {
          throw new Error(availability.error?.message ?? categoryPayload.error?.message ?? 'Could not load appointment availability');
        }
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
    for (const slot of availableStarts) {
      map.set(slot.serviceDate, [...(map.get(slot.serviceDate) ?? []), slot]);
    }
    return map;
  }, [availableStarts]);

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

  // Step 1: Single-tap date selection and auto-advance
  const handleDateSelectAndAdvance = (selectedDate: string, isAvailable: boolean) => {
    if (!isAvailable || loading || !!result) return;
    setDate(selectedDate);
    setSelectedHour('');
    setSelectedSlotId(null);
    setMessage('');
    setStep(2); // Instant single-tap progression to Step 2
  };

  // Step 2: Vehicle selection & truck preselection
  const setVehicle = (value: string) => {
    setVehicleClass(value);
    setMoreThan6Selected(false);
    if (value === 'Truck') {
      setCylinderCount(4); // Preselect 4 cylinders for Truck
    } else if (vehicleClass === 'Truck' && cylinderCount === 4) {
      setCylinderCount(1); // Reset default to 1 when leaving Truck
    }
    setSelectedHour('');
    setSelectedSlotId(null);
  };

  // Step 3: Cylinder count selection (1–6 or >6)
  const chooseCylinderCount = (value: string) => {
    if (value === 'more') {
      setMoreThan6Selected(true);
      setMessage('');
      setSelectedHour('');
      setSelectedSlotId(null);
      return;
    }
    setMoreThan6Selected(false);
    setMessage('');
    setCylinderCount(Number(value));
    setSelectedHour('');
    setSelectedSlotId(null);
  };

  // Step 5: Vehicle Registration handling with validation
  const handleRegistrationChange = (value: string) => {
    const upper = value.toUpperCase();
    setRegistration(upper);
    if (regTouched) {
      const regRes = validateVehicleRegistration(upper, locale);
      setRegError(regRes.valid ? '' : (regRes.error ?? ''));
    }
  };

  const handleRegistrationBlur = () => {
    setRegTouched(true);
    const regRes = validateVehicleRegistration(registration, locale);
    setRegError(regRes.valid ? '' : (regRes.error ?? ''));
  };

  const vehicleDescription = buildVehicleDescription(vehicleClass, vehicleModel);

  const createHold = async () => {
    if (!category || !selectedSlot || busy) return;

    // 1. Client-side registration validation
    const regResult = validateVehicleRegistration(registration, locale);
    if (!regResult.valid) {
      setRegTouched(true);
      setRegError(regResult.error || (hindi ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'));
      return;
    }

    // 2. Pre-check advance configuration
    if (category.advancePaise == null || category.advancePaise <= 0) {
      setMessage(hindi
        ? 'ऑनलाइन अग्रिम भुगतान नीति अभी सेट नहीं है। कृपया फोन पर बुकिंग करें।'
        : 'Online advance-payment settings are not configured for this cylinder count. Please book by phone.');
      return;
    }

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
          vehicleType: vehicleDescription,
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

  const submitUtr = async () => {
    if (!result?.bookingCode || !utr.trim() || busy || evidenceSubmitted) return;
    setBusy(true);
    try {
      const response = await fetch('/api/booking/submit-evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookingCode: result.bookingCode,
          statusToken: result.statusToken,
          utr: utr.trim(),
          source: 'WEB',
        }),
      });
      const payload: any = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not submit payment reference');
      setEvidenceSubmitted(true);
      setMessage(hindi ? 'भुगतान संदर्भ जमा हो गया। रिसेप्शन सत्यापन करेगा।' : 'Payment reference submitted. Reception will verify it.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit payment reference');
    } finally {
      setBusy(false);
    }
  };

  const labels = hindi
    ? {
        steps: ['तारीख', 'वाहन', 'सिलेंडर', 'समय', 'विवरण'],
        date: 'अपॉइंटमेंट की तारीख चुनें',
        dateHint: 'आगे बढ़ने के लिए कैलेंडर में से कोई भी उपलब्ध तारीख चुनें:',
        vehicle: 'आपका वाहन कौन सा है?',
        vehicleSelectLabel: 'वाहन का प्रकार चुनें *',
        model: 'वाहन का मेक / मॉडल (वैकल्पिक)',
        modelPlaceholder: 'जैसे Tata 407, Maruti WagonR, Bolero',
        modelHint: 'वैकल्पिक: टेस्टिंग एडॉप्टर की तैयारी में सहायता करता है।',
        cylinder: 'वाहन में कितने CNG गैस सिलेंडर लगे हैं?',
        cylinderSelectLabel: 'CNG सिलेंडर की संख्या चुनें *',
        time: 'उपलब्ध समय चुनें',
        hourSelectLabel: '1. घंटा चुनें',
        hourSelectPlaceholder: '— घंटा चुनें —',
        timeSelectLabel: '2. सटीक शुरू होने का समय',
        timeSelectPlaceholderNoHour: '— कृपया पहले घंटा चुनें —',
        timeSelectPlaceholderWithHour: '— शुरू होने का समय चुनें —',
        customer: 'ग्राहक विवरण एवं पुष्टि',
        name: 'पूरा नाम *',
        namePlaceholder: 'अपना पूरा नाम दर्ज करें',
        mobile: 'मोबाइल नंबर *',
        mobilePlaceholder: '10 अंकों का मोबाइल नंबर',
        registration: 'वाहन रजिस्ट्रेशन नंबर *',
        regPlaceholder: 'उदा. DL01AB1234 या 22BH1234AA',
        regHint: 'प्रारूप: राज्य श्रृंखला (उदा. DL01AB1234) या भारत श्रृंखला (उदा. 22BH1234AA)',
        back: 'वापस',
        next: 'आगे बढ़ें',
        createBooking: 'बुकिंग बनाएँ',
        creatingBooking: 'बुकिंग बन रही है…',
        loading: 'उपलब्धता लोड हो रही है…',
        noDate: 'इस तारीख पर चुने गए सिलेंडर संख्या के लिए लगातार समय उपलब्ध नहीं है।',
        noTime: 'इस तारीख पर कोई उपयुक्त समय उपलब्ध नहीं है।',
        choose: 'चुनें',
        price: 'मूल सेवा शुल्क',
        gst: 'जीएसटी / GST (18%)',
        total: 'कुल राशि',
        advance: 'अस्थायी अग्रिम (ऑनलाइन देय)',
        balance: 'शेष देय राशि (केंद्र पर देय)',
        pricingNotice: 'स्लॉट सुरक्षित करने हेतु फ्लैट टोकन अग्रिम। शेष राशि आगमन पर केंद्र में देय है।',
        weekday: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
        contact: '6 से अधिक सिलेंडर? केंद्र से सीधे संपर्क करें।',
        availableLegend: 'उपलब्ध (टैप करके चुनें)',
        unavailableLegend: 'पूर्ण बुक / अनुपलब्ध',
      }
    : {
        steps: ['Date', 'Vehicle', 'Cylinders', 'Time', 'Details'],
        date: 'Choose appointment date',
        dateHint: 'Select an available appointment date to proceed:',
        vehicle: 'Which vehicle do you have?',
        vehicleSelectLabel: 'Select vehicle type *',
        model: 'Vehicle make / model (optional)',
        modelPlaceholder: 'e.g. Tata 407, Maruti WagonR, Bolero',
        modelHint: 'Optional: Helps technicians prepare testing adapters in advance.',
        cylinder: 'How many CNG gas cylinders are fitted to this vehicle?',
        cylinderSelectLabel: 'Number of CNG cylinders fitted *',
        time: 'Choose an available start time',
        hourSelectLabel: '1. Select Hour',
        hourSelectPlaceholder: '— Choose an hour —',
        timeSelectLabel: '2. Exact Start Time',
        timeSelectPlaceholderNoHour: '— Select an hour first —',
        timeSelectPlaceholderWithHour: '— Choose start time —',
        customer: 'Customer details & confirmation',
        name: 'Full name *',
        namePlaceholder: 'Enter your full name',
        mobile: 'Mobile number *',
        mobilePlaceholder: '10-digit mobile number',
        registration: 'Vehicle registration number *',
        regPlaceholder: 'e.g. DL01AB1234 or 22BH1234AA',
        regHint: 'Format: State series (e.g. DL01AB1234) or Bharat series (e.g. 22BH1234AA)',
        back: 'Back',
        next: 'Continue',
        createBooking: 'Create booking',
        creatingBooking: 'Creating booking…',
        loading: 'Loading availability…',
        noDate: 'There is no continuous appointment time for this cylinder count on this date.',
        noTime: 'No suitable appointments are available on this date.',
        choose: 'Select',
        price: 'Base service charge',
        gst: 'GST (18%)',
        total: 'Total amount',
        advance: 'Temporary advance (Pay online)',
        balance: 'Remaining balance (Payable at centre)',
        pricingNotice: 'Flat advance to hold your slot. Remaining balance is payable at centre upon arrival.',
        weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        contact: 'More than 6 cylinders? Book directly with centre.',
        availableLegend: 'Available (Tap to proceed)',
        unavailableLegend: 'Booked / Unavailable',
      };

  const isRegistrationValid = validateVehicleRegistration(registration, locale).valid;
  const canSubmit = !busy &&
    !!category &&
    category.advancePaise != null &&
    category.advancePaise > 0 &&
    name.trim().length >= 2 &&
    mobile.trim().length === 10 &&
    isRegistrationValid &&
    selectedSlot != null;

  return (
    <section aria-label={hindi ? 'बुकिंग फ़ॉर्म' : 'Booking form'}>
      {/* 5-Step Stepper Header */}
      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '.5rem',
          padding: 0,
          listStyle: 'none',
          marginBottom: '1.5rem',
        }}
      >
        {labels.steps.map((item, index) => {
          const stepNumber = index + 1;
          const isActive = step === stepNumber;
          return (
            <li
              key={item}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.4rem',
                padding: '.45rem .85rem',
                borderRadius: 999,
                fontSize: '.875rem',
                fontWeight: 600,
                minHeight: 36,
                background: isActive ? '#1E40AF' : '#F1F5F9',
                color: isActive ? '#FFFFFF' : '#475569',
                border: isActive ? '1px solid #1E40AF' : '1px solid #CBD5E1',
                boxShadow: isActive ? '0 1px 2px rgba(30,64,175,0.2)' : 'none',
                transition: 'background-color 0.15s, color 0.15s',
              }}
            >
              <span>{stepNumber}.</span> {item}
            </li>
          );
        })}
      </ol>

      {/* Step 1: Single-Tap Date Progression */}
      {step === 1 && (
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>
            {labels.date}
          </h2>
          <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1rem' }}>
            {labels.dateHint}
          </p>

          {/* Month Header Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '.75rem',
              marginBottom: '1rem',
              background: '#F8FAFC',
              padding: '.5rem .75rem',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
            }}
          >
            <button
              type="button"
              disabled={
                monthYear === new Date(today + 'T00:00:00Z').getUTCFullYear() &&
                monthIndex === new Date(today + 'T00:00:00Z').getUTCMonth()
              }
              onClick={() => setMonth(new Date(Date.UTC(monthYear, monthIndex - 1, 1)))}
              aria-label={hindi ? 'पिछला महीना' : 'Previous month'}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '.4rem .8rem',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#0F172A',
              }}
            >
              ←
            </button>
            <strong style={{ fontSize: '1.05rem', color: '#0F172A' }}>
              {monthTitle(month, locale)}
            </strong>
            <button
              type="button"
              disabled={
                new Date(Date.UTC(monthYear, monthIndex + 1, 1)).toISOString().slice(0, 10) > lastDate
              }
              onClick={() => setMonth(new Date(Date.UTC(monthYear, monthIndex + 1, 1)))}
              aria-label={hindi ? 'अगला महीना' : 'Next month'}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '.4rem .8rem',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#0F172A',
              }}
            >
              →
            </button>
          </div>

          {/* Calendar 7-Column Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: '.4rem',
            }}
          >
            {labels.weekday.map((day) => (
              <div
                key={day}
                style={{
                  textAlign: 'center',
                  fontSize: '.8rem',
                  fontWeight: 700,
                  color: '#475569',
                  paddingBottom: '.25rem',
                }}
              >
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
                  aria-label={`${day}: ${
                    hasAvailability
                      ? (hindi ? 'उपलब्ध, चयन करने और आगे बढ़ने के लिए टैप करें' : 'Available, tap to select and proceed')
                      : (hindi ? 'अनुपलब्ध' : 'Unavailable')
                  }`}
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
          <div
            style={{
              display: 'flex',
              gap: '1.25rem',
              marginTop: '1rem',
              fontSize: '.85rem',
              color: '#475569',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  display: 'inline-block',
                }}
              />
              <span>{labels.availableLegend}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1px solid #E2E8F0',
                  background: '#F1F5F9',
                  display: 'inline-block',
                }}
              />
              <span>{labels.unavailableLegend}</span>
            </div>
          </div>

          {loadError && (
            <p role="alert" style={{ color: '#DC2626', marginTop: '.75rem', fontWeight: 600 }}>
              {loadError}
            </p>
          )}
          {loading && (
            <p style={{ color: '#1E40AF', marginTop: '.75rem', fontWeight: 600 }}>
              {labels.loading}
            </p>
          )}
        </div>
      )}

      {/* Step 2: Vehicle Selection & Truck Preselection */}
      {step === 2 && (
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>
            {labels.vehicle}
          </h2>
          <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1.25rem' }}>
            {hindi ? 'अपॉइंटमेंट की तारीख:' : 'Appointment date:'} <strong>📅 {date}</strong>
          </p>

          {/* Vehicle Class Select */}
          <label style={{ display: 'grid', gap: '.4rem', maxWidth: 440 }}>
            <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
              {labels.vehicleSelectLabel}
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
              placeholder={labels.modelPlaceholder}
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
              {labels.modelHint}
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
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }} aria-hidden="true">🚛</span>
              <div style={{ fontSize: '.875rem', color: '#1E40AF' }}>
                <strong style={{ fontSize: '.95rem' }}>
                  {hindi ? 'ट्रक: 4 CNG सिलेंडर पूर्व-चयनित' : 'Truck Selected: 4 Cylinders Preselected'}
                </strong>
                <p style={{ margin: '.25rem 0 0', color: '#1E3A8A', lineHeight: 1.45 }}>
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
              style={{
                minHeight: 48,
                padding: '.6rem 1.2rem',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setStep(1)}
            >
              {labels.back}
            </button>
            <button
              type="button"
              className="cta cta-primary"
              disabled={!vehicleDescription || !!result}
              style={{
                minHeight: 48,
                padding: '.6rem 1.5rem',
                borderRadius: 6,
                border: 'none',
                background: '#1E40AF',
                color: '#FFFFFF',
                fontWeight: 700,
                cursor: (!vehicleDescription || !!result) ? 'not-allowed' : 'pointer',
                opacity: (!vehicleDescription || !!result) ? 0.6 : 1,
              }}
              onClick={() => setStep(3)}
            >
              {labels.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Public 1–6 Cylinder Dropdown & Contact Card */}
      {step === 3 && (
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>
            {labels.cylinder}
          </h2>
          <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1.25rem' }}>
            📅 {date} · <strong>{vehicleDescription}</strong>
          </p>

          {/* Cylinder Count Dropdown */}
          <label style={{ display: 'grid', gap: '.4rem', maxWidth: 440 }}>
            <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
              {labels.cylinderSelectLabel}
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

          {/* Dedicated Fleet Contact Card (When >6 Cylinders Selected) */}
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
              <div
                style={{
                  display: 'inline-block',
                  padding: '.25rem .6rem',
                  background: '#FEF3C7',
                  color: '#92400E',
                  borderRadius: 4,
                  fontSize: '.75rem',
                  fontWeight: 700,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  marginBottom: '.75rem',
                }}
              >
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
                  href={`tel:${DEFAULT_CONTACT_PHONE}`}
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
                  📞 {hindi ? `कॉल करें: ${DEFAULT_CONTACT_PHONE}` : `Call: ${DEFAULT_CONTACT_PHONE}`}
                </a>
                <a
                  href={DEFAULT_WHATSAPP_URL}
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
              <div
                style={{
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '.5rem',
                }}
              >
                <span style={{ fontSize: '.8rem', color: '#64748B' }}>
                  {hindi ? 'संचालन समय: सुबह 6:00 – रात 8:00 (सोम–शनि)' : 'Working Hours: 06:00 AM – 08:00 PM (Mon–Sat)'}
                </span>
                <button
                  type="button"
                  onClick={() => chooseCylinderCount('4')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1E40AF',
                    textDecoration: 'underline',
                    fontSize: '.85rem',
                    cursor: 'pointer',
                    padding: '.25rem .5rem',
                    fontWeight: 600,
                  }}
                >
                  {hindi ? '← 1–6 सिलेंडर ऑनलाइन बुकिंग पर लौटें' : '← Return to 1–6 online booking'}
                </button>
              </div>
            </div>
          )}

          {/* Transparent 5-Row Pricing Breakdown for 1–6 Cylinders */}
          {!moreThan6Selected && category && (
            <PricingBreakdownCard
              basePricePaise={category.basePricePaise}
              gstPaise={category.gstPaise}
              totalPaise={category.totalPaise}
              advancePaise={category.advancePaise}
              cylinders={cylinderCount}
              labels={labels}
              hindi={hindi}
            />
          )}

          {!moreThan6Selected && !category && !loading && (
            <p role="alert" style={{ color: '#DC2626', marginTop: '1rem', fontWeight: 600 }}>
              {hindi
                ? 'इस सिलेंडर संख्या की ऑनलाइन कीमत उपलब्ध नहीं है। कृपया केंद्र से संपर्क करें।'
                : 'Online pricing is not enabled for this cylinder count. Please contact the centre.'}
            </p>
          )}

          {/* Navigation CTAs */}
          <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="cta cta-secondary"
              style={{
                minHeight: 48,
                padding: '.6rem 1.2rem',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 600,
                cursor: 'pointer',
              }}
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
                style={{
                  minHeight: 48,
                  padding: '.6rem 1.5rem',
                  borderRadius: 6,
                  border: 'none',
                  background: '#1E40AF',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  cursor: (loading || !category || !!result) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !category || !!result) ? 0.6 : 1,
                }}
                onClick={() => {
                  setSelectedSlotId(null);
                  setSelectedHour('');
                  setStep(4);
                }}
              >
                {labels.next}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Linked Time Dropdowns & Calculated Finish Time */}
      {step === 4 && (
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>
            {labels.time}
          </h2>
          <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1.25rem' }}>
            <strong>📅 {date}</strong> · {cylinderCount} {hindi ? 'सिलेंडर' : cylinderCount === 1 ? 'cylinder' : 'cylinders'} · {vehicleDescription}
          </p>

          {loading && (
            <p style={{ color: '#1E40AF', fontWeight: 600 }}>{labels.loading}</p>
          )}

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
                style={{
                  minHeight: 44,
                  padding: '.5rem 1rem',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setStep(1)}
              >
                {hindi ? '← दूसरी तारीख चुनें' : '← Choose another date'}
              </button>
            </div>
          )}

          {!loading && selectedDateSlots.length > 0 && (
            <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 480 }}>
              {/* Linked Dropdown 1: Select Hour */}
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
                  {labels.hourSelectLabel}
                </span>
                <select
                  id="appointment-hour-select"
                  value={selectedHour}
                  disabled={!!result}
                  onChange={(e) => {
                    setSelectedHour(e.target.value);
                    setSelectedSlotId(null);
                  }}
                  style={{
                    minHeight: 48,
                    padding: '0.6rem 0.8rem',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: '1rem',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                  }}
                  aria-label={hindi ? 'अपॉइंटमेंट का घंटा चुनें' : 'Select appointment hour'}
                >
                  <option value="">{labels.hourSelectPlaceholder}</option>
                  {availableHours.map((hour) => (
                    <option key={hour} value={hour}>
                      {formatHourOption(hour, locale)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Linked Dropdown 2: Exact Start Time */}
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '.95rem',
                    color: !selectedHour ? '#94A3B8' : '#0F172A',
                  }}
                >
                  {labels.timeSelectLabel}
                </span>
                <select
                  id="appointment-time-select"
                  value={selectedSlotId ? String(selectedSlotId) : ''}
                  disabled={!selectedHour || !!result}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelectedSlotId(id);
                  }}
                  style={{
                    minHeight: 48,
                    padding: '0.6rem 0.8rem',
                    borderRadius: 6,
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
                      ? labels.timeSelectPlaceholderNoHour
                      : labels.timeSelectPlaceholderWithHour}
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
                    padding: '1rem 1.25rem',
                    borderRadius: 8,
                    border: '1px solid #1E40AF',
                    backgroundColor: '#EFF6FF',
                    color: '#1E3A8A',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.3rem' }} aria-hidden="true">⏱️</span>
                    <strong style={{ fontSize: '1.1rem' }}>
                      {selectedSlot.startTime} {hindi ? 'से' : 'to'} {selectedSlot.bookingEndTime}
                      {' · '}
                      {cylinderCount} {hindi ? 'सिलेंडर' : cylinderCount === 1 ? 'cylinder' : 'cylinders'}
                    </strong>
                  </div>
                  {selectedSlot.bookingEndTime && (
                    <p style={{ margin: '0.25rem 0 0 1.8rem', fontSize: '0.875rem', color: '#1E40AF' }}>
                      {hindi
                        ? `कुल अनुमानित अवधि: ${calculateDurationMinutes(selectedSlot.startTime, selectedSlot.bookingEndTime)} मिनट (${cylinderCount} लगातार इकाइयाँ)`
                        : `Total estimated duration: ${calculateDurationMinutes(selectedSlot.startTime, selectedSlot.bookingEndTime)} minutes (${cylinderCount} consecutive work units)`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation CTAs */}
          <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="cta cta-secondary"
              style={{
                minHeight: 48,
                padding: '.6rem 1.2rem',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setStep(3)}
            >
              {labels.back}
            </button>
            <button
              type="button"
              className="cta cta-primary"
              disabled={loading || !selectedSlot || !!result}
              style={{
                minHeight: 48,
                padding: '.6rem 1.5rem',
                borderRadius: 6,
                border: 'none',
                background: '#1E40AF',
                color: '#FFFFFF',
                fontWeight: 700,
                cursor: (loading || !selectedSlot || !!result) ? 'not-allowed' : 'pointer',
                opacity: (loading || !selectedSlot || !!result) ? 0.6 : 1,
              }}
              onClick={() => setStep(5)}
            >
              {labels.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Customer Details, Vehicle Registration & Pricing Breakdown */}
      {step === 5 && !result && (
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '.5rem' }}>
            {labels.customer}
          </h2>
          <p style={{ fontSize: '.9rem', color: '#475569', marginBottom: '1.25rem' }}>
            <strong>📅 {date}</strong> · ⏱️ {selectedSlot?.startTime}–{selectedSlot?.bookingEndTime} · 🚛 {vehicleDescription} · {cylinderCount} {hindi ? 'सिलेंडर' : 'cylinders'}
          </p>

          <div style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
            {/* Customer Full Name */}
            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontWeight: 600, fontSize: '.95rem', color: '#0F172A' }}>
                {labels.name}
              </span>
              <input
                id="customer-name-input"
                style={{
                  minHeight: 48,
                  width: '100%',
                  padding: '.6rem .75rem',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '1rem',
                }}
                value={name}
                placeholder={labels.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            {/* Customer Mobile */}
            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontWeight: 600, fontSize: '.95rem', color: '#0F172A' }}>
                {labels.mobile}
              </span>
              <input
                id="customer-mobile-input"
                style={{
                  minHeight: 48,
                  width: '100%',
                  padding: '.6rem .75rem',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '1rem',
                }}
                inputMode="numeric"
                value={mobile}
                placeholder={labels.mobilePlaceholder}
                onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </label>

            {/* Vehicle Registration Number with Validation */}
            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontWeight: 600, fontSize: '.95rem', color: '#0F172A' }}>
                {labels.registration}
              </span>
              <input
                id="vehicle-registration-input"
                style={{
                  minHeight: 48,
                  width: '100%',
                  padding: '.6rem .75rem',
                  borderRadius: 6,
                  border: regTouched && regError ? '2px solid #DC2626' : '1px solid #CBD5E1',
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  background: '#FFFFFF',
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
                <p
                  id="reg-error-msg"
                  role="alert"
                  style={{ color: '#DC2626', fontSize: '.85rem', margin: '.2rem 0 0 0', fontWeight: 600 }}
                >
                  {regError}
                </p>
              ) : (
                <p
                  id="reg-hint-msg"
                  style={{ color: '#64748B', fontSize: '.8rem', margin: '.2rem 0 0 0' }}
                >
                  {labels.regHint}
                </p>
              )}
            </label>
          </div>

          {/* Full 5-Row Pricing Breakdown (Base, GST, Total, Advance, Balance) */}
          {category && (
            <PricingBreakdownCard
              basePricePaise={category.basePricePaise}
              gstPaise={category.gstPaise}
              totalPaise={category.totalPaise}
              advancePaise={category.advancePaise}
              cylinders={cylinderCount}
              labels={labels}
              hindi={hindi}
            />
          )}

          {category?.advancePaise == null && (
            <p role="alert" style={{ color: '#DC2626', marginTop: '1rem', fontWeight: 600 }}>
              {hindi
                ? 'ऑनलाइन बुकिंग चालू करने के लिए मालिक को पहले अग्रिम राशि सेट करनी होगी। अभी फोन बुकिंग उपलब्ध है।'
                : 'The owner must configure an advance amount before online booking can be enabled. Phone bookings remain available.'}
            </p>
          )}

          {/* Server Contact / Gating Card if payment is unavailable */}
          {serverContact && (
            <div
              role="alert"
              style={{
                marginTop: '1.25rem',
                padding: '1.25rem',
                background: '#FFFBEB',
                border: '1px solid #FCD34D',
                borderRadius: 8,
                maxWidth: 480,
              }}
            >
              <h4 style={{ margin: '0 0 .5rem', color: '#92400E', fontSize: '1.05rem' }}>
                {hindi ? 'फ़ोन या व्हाट्सएप द्वारा बुकिंग करें' : 'Book by Phone or WhatsApp'}
              </h4>
              <p style={{ margin: '0 0 1rem', color: '#78350F', fontSize: '.9rem' }}>
                {message}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
                <a
                  href={`tel:${serverContact.phone}`}
                  className="cta"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.4rem',
                    background: '#1E40AF',
                    color: '#FFFFFF',
                    padding: '.6rem 1rem',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontWeight: 700,
                    minHeight: 44,
                    fontSize: '.9rem',
                  }}
                >
                  📞 {hindi ? `कॉल करें: ${serverContact.phone}` : `Call: ${serverContact.phone}`}
                </a>
                <a
                  href={serverContact.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cta"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.4rem',
                    background: '#15803D',
                    color: '#FFFFFF',
                    padding: '.6rem 1rem',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontWeight: 700,
                    minHeight: 44,
                    fontSize: '.9rem',
                  }}
                >
                  💬 {hindi ? 'व्हाट्सएप चैट' : 'Chat on WhatsApp'}
                </a>
              </div>
            </div>
          )}

          {message && !serverContact && (
            <p role="alert" style={{ color: '#DC2626', marginTop: '1rem', fontWeight: 600 }}>
              {message}
            </p>
          )}

          {/* Navigation CTAs */}
          <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="cta cta-secondary"
              style={{
                minHeight: 48,
                padding: '.6rem 1.2rem',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setStep(4)}
            >
              {labels.back}
            </button>
            <button
              type="button"
              className="cta cta-primary"
              disabled={!canSubmit}
              style={{
                minHeight: 48,
                padding: '.6rem 1.5rem',
                borderRadius: 6,
                border: 'none',
                background: '#1E40AF',
                color: '#FFFFFF',
                fontWeight: 700,
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
                opacity: !canSubmit ? 0.6 : 1,
              }}
              onClick={createHold}
            >
              {busy ? labels.creatingBooking : labels.createBooking}
            </button>
          </div>
        </div>
      )}

      {/* Booking Confirmation / Hold Created Screen */}
      {result && (
        <section
          className="card"
          style={{
            marginTop: '1.25rem',
            padding: '1.5rem',
            background: '#FFFFFF',
            border: '2px solid #1E40AF',
            borderRadius: 10,
            maxWidth: 540,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '.25rem .6rem',
              background: '#DCFCE7',
              color: '#166534',
              borderRadius: 4,
              fontSize: '.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: '.75rem',
            }}
          >
            {hindi ? 'स्लॉट सुरक्षित' : 'Slot Held'}
          </div>

          <h3 style={{ margin: '0 0 .75rem 0', fontSize: '1.3rem', color: '#0F172A' }}>
            {hindi ? 'बुकिंग बन गई' : 'Booking Created'}
          </h3>

          <div style={{ display: 'grid', gap: '.4rem', fontSize: '.95rem', color: '#334155', marginBottom: '1.25rem' }}>
            <p style={{ margin: 0 }}>
              {hindi ? 'बुकिंग कोड:' : 'Booking code:'}{' '}
              <strong style={{ fontSize: '1.1rem', color: '#1E40AF', letterSpacing: '.05em' }}>
                {result.bookingCode}
              </strong>
            </p>
            <p style={{ margin: 0 }}>
              {hindi ? 'होल्ड समाप्ति समय:' : 'Hold expires at:'}{' '}
              <strong>{result.holdExpiresAt}</strong>
            </p>
            <p style={{ margin: 0 }}>
              {hindi ? 'भुगतान स्थिति:' : 'Payment status:'}{' '}
              <span
                style={{
                  display: 'inline-block',
                  padding: '.15rem .45rem',
                  borderRadius: 4,
                  fontSize: '.85rem',
                  fontWeight: 700,
                  background: evidenceSubmitted ? '#FEF3C7' : '#FEE2E2',
                  color: evidenceSubmitted ? '#92400E' : '#991B1B',
                }}
              >
                {evidenceSubmitted ? 'PENDING_VERIFICATION' : 'ADVANCE_PENDING'}
              </span>
            </p>
          </div>

          {/* Consistent 5-Row Pricing Breakdown */}
          {result.pricing && (
            <PricingBreakdownCard
              basePricePaise={result.pricing.basePricePaise}
              gstPaise={result.pricing.gstAmountPaise ?? result.pricing.gstPaise}
              totalPaise={result.pricing.totalPricePaise ?? result.pricing.totalPaise}
              advancePaise={result.pricing.advancePaise}
              balancePaise={result.pricing.balancePaise}
              cylinders={cylinderCount}
              labels={labels}
              hindi={hindi}
            />
          )}

          {/* UPI Intent & QR Code */}
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              background: '#F8FAFC',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              textAlign: 'center',
            }}
          >
            <h4 style={{ margin: '0 0 .75rem 0', color: '#0F172A', fontSize: '1.05rem' }}>
              {hindi ? 'अग्रिम भुगतान (₹500 टोकन)' : 'Advance Payment (₹500 Flat)'}
            </h4>

            {result.upiUri && (
              <p style={{ margin: '0 0 1rem 0' }}>
                <a
                  href={result.upiUri}
                  className="cta"
                  style={{
                    display: 'inline-block',
                    background: '#1E40AF',
                    color: '#FFFFFF',
                    padding: '.65rem 1.25rem',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontWeight: 700,
                    minHeight: 44,
                  }}
                >
                  📲 {hindi ? 'UPI ऐप से भुगतान करें' : 'Pay using UPI App'}
                </a>
              </p>
            )}

            {result.upiQrDataUrl && (
              <div style={{ marginTop: '.75rem' }}>
                <p style={{ fontSize: '.85rem', color: '#64748B', margin: '0 0 .5rem 0' }}>
                  {hindi ? 'या किसी भी UPI ऐप (GPay, PhonePe, Paytm) से QR कोड स्कैन करें:' : 'Or scan QR code using any UPI app:'}
                </p>
                <img
                  src={result.upiQrDataUrl}
                  alt="UPI payment QR Code"
                  width={240}
                  height={240}
                  style={{
                    margin: '0 auto',
                    display: 'block',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                    padding: 8,
                    background: '#FFFFFF',
                  }}
                />
              </div>
            )}
          </div>

          {/* Payment Reference (UTR) Form */}
          <div style={{ marginTop: '1.5rem' }}>
            <label style={{ display: 'grid', gap: '.4rem' }}>
              <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '.95rem' }}>
                {hindi ? 'UTR / भुगतान संदर्भ संख्या (12 अंक)' : 'UTR / Payment Reference (12 digits)'}
              </span>
              <input
                id="utr-reference-input"
                style={{
                  minHeight: 48,
                  padding: '.6rem .75rem',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '1rem',
                  width: '100%',
                }}
                value={utr}
                placeholder={hindi ? 'उदा. 412345678901' : 'e.g. 412345678901'}
                onChange={(event) => setUtr(event.target.value.trim())}
              />
            </label>
            <button
              type="button"
              className="cta cta-primary"
              disabled={!utr.trim() || busy || evidenceSubmitted}
              onClick={submitUtr}
              style={{
                marginTop: '.75rem',
                minHeight: 48,
                padding: '.6rem 1.25rem',
                borderRadius: 6,
                border: 'none',
                background: '#1E40AF',
                color: '#FFFFFF',
                fontWeight: 700,
                cursor: (!utr.trim() || busy || evidenceSubmitted) ? 'not-allowed' : 'pointer',
                opacity: (!utr.trim() || busy || evidenceSubmitted) ? 0.6 : 1,
              }}
            >
              {busy ? (hindi ? 'जमा हो रहा है…' : 'Submitting…') : (hindi ? 'भुगतान संदर्भ जमा करें' : 'Submit payment reference')}
            </button>
          </div>

          {message && (
            <p role="status" style={{ color: '#1E40AF', marginTop: '1rem', fontWeight: 600 }}>
              {message}
            </p>
          )}

          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
            <a
              href={'/' + locale + '/status/?booking=' + encodeURIComponent(result.bookingCode) + '&token=' + encodeURIComponent(result.statusToken)}
              style={{ color: '#1E40AF', fontWeight: 600, textDecoration: 'underline' }}
            >
              {hindi ? '→ अपनी बुकिंग की स्थिति यहाँ देखें' : '→ View your booking status here'}
            </a>
          </div>
        </section>
      )}

      {message && !result && !serverContact && step !== 5 && (
        <p role="status" style={{ color: '#DC2626', marginTop: '1rem', fontWeight: 600 }}>
          {message}
        </p>
      )}
    </section>
  );
}
