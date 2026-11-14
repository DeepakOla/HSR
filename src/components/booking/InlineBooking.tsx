import React, { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../lib/constants';
import { readApiJson } from '../../lib/client-api';
import { validateVehicleRegistration } from '../../lib/vehicle-registration';
import {
  VEHICLE_OPTIONS,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_CONTACT_WHATSAPP,
  formatHourOption,
  todayInIndia,
  addDays,
  inr,
} from '../../lib/booking-wizard-helpers';

export interface Slot {
  slotSnapshotId: number;
  serviceDate: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  canStartBooking: boolean;
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
  stationPhone?: string;
  stationCity?: string;
}

interface MultiVehicleRow {
  id: string;
  vehicleType: string;
  cylinderCount: number;
  registration: string;
}

export default function InlineBooking({ locale, stationPhone = DEFAULT_CONTACT_PHONE, stationCity = 'Rewari' }: Props) {
  const hindi = locale === 'hi';

  // Mode: single vehicle or multiple fleet
  const [bookingMode, setBookingMode] = useState<'single' | 'fleet'>('single');

  // Single Vehicle State
  const [vehicleClass, setVehicleClass] = useState<string>('Car');
  const [cylinderCount, setCylinderCount] = useState<number>(1);
  const [serviceDate, setServiceDate] = useState<string>(() => todayInIndia());
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);

  const [regNumber, setRegNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [showCompanyDrawer, setShowCompanyDrawer] = useState<boolean>(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [companyGstin, setCompanyGstin] = useState<string>('');

  // Fleet Multi-vehicle State
  const [fleetVehicles, setFleetVehicles] = useState<MultiVehicleRow[]>([
    { id: '1', vehicleType: 'LCV', cylinderCount: 2, registration: '' },
    { id: '2', vehicleType: 'Truck', cylinderCount: 4, registration: '' },
  ]);
  const [fleetContactName, setFleetContactName] = useState<string>('');
  const [fleetContactPhone, setFleetContactPhone] = useState<string>('');
  const [fleetDate, setFleetDate] = useState<string>(() => addDays(todayInIndia(), 1));
  const [fleetSubmitted, setFleetSubmitted] = useState<boolean>(false);

  // Backend Data
  const [slots, setSlots] = useState<Slot[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');

  // Submission & Hold State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [holdResult, setHoldResult] = useState<any | null>(null);
  const [utrNumber, setUtrNumber] = useState<string>('');
  const [evidenceSubmitted, setEvidenceSubmitted] = useState<boolean>(false);
  const [evidenceError, setEvidenceError] = useState<string>('');
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  // Auto-select cylinder count when Truck is chosen (truck defaults to 4)
  const handleVehicleSelect = (v: string) => {
    setVehicleClass(v);
    if (v === 'Truck' && cylinderCount < 4) {
      setCylinderCount(4);
    }
  };

  // Fetch slots and pricing categories
  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoadingAvailability(true);
      setLoadError('');
      setSelectedSlotId(null);
      setSelectedHour('');
      try {
        const [availRes, catRes] = await Promise.all([
          fetch(`/api/public/availability/?locale=${locale}&fromDate=${encodeURIComponent(todayInIndia())}&days=14&cylinderCount=${cylinderCount}`),
          fetch(`/api/public/vehicle-categories/?locale=${locale}`),
        ]);
        const availData: any = await readApiJson(availRes);
        const catData: any = await readApiJson(catRes);

        if (!availRes.ok || !catRes.ok) {
          throw new Error(availData?.error?.message || catData?.error?.message || 'Could not load availability');
        }
        if (!cancelled) {
          setSlots(availData?.data?.slots || []);
          setCategories(catData?.data?.categories || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err.message || 'Error fetching testing slots');
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingAvailability(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [locale, cylinderCount]);

  // Current category pricing match
  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.cylinderCount === cylinderCount) || categories[0] || null;
  }, [categories, cylinderCount]);

  // Filter slots for chosen date
  const dateSlots = useMemo(() => {
    return slots.filter((s) => s.serviceDate === serviceDate && s.canStartBooking);
  }, [slots, serviceDate]);

  // Group slots by hour
  const hoursWithSlots = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of dateSlots) {
      const hour = s.startTime.slice(0, 2);
      if (!map.has(hour)) map.set(hour, []);
      map.get(hour)!.push(s);
    }
    return map;
  }, [dateSlots]);

  // Available hours list
  const availableHours = useMemo(() => {
    return Array.from(hoursWithSlots.keys()).sort();
  }, [hoursWithSlots]);

  // Auto-select first hour when date changes
  useEffect(() => {
    if (availableHours.length > 0 && (!selectedHour || !hoursWithSlots.has(selectedHour))) {
      setSelectedHour(availableHours[0]);
    }
  }, [availableHours, selectedHour, hoursWithSlots]);

  const activeSlots = useMemo(() => {
    return selectedHour ? (hoursWithSlots.get(selectedHour) || []) : [];
  }, [hoursWithSlots, selectedHour]);

  // Next 5 days quick date buttons
  const quickDates = useMemo(() => {
    const dates = [];
    const today = todayInIndia();
    for (let i = 0; i < 6; i++) {
      const d = addDays(today, i);
      const dateObj = new Date(d + 'T00:00:00Z');
      const dayName = i === 0 ? (hindi ? 'आज' : 'Today') : i === 1 ? (hindi ? 'कल' : 'Tomorrow') : dateObj.toLocaleDateString(hindi ? 'hi-IN' : 'en-IN', { weekday: 'short', timeZone: 'UTC' });
      const dayNum = dateObj.toLocaleDateString(hindi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      dates.push({ dateStr: d, label: `${dayName}, ${dayNum}` });
    }
    return dates;
  }, [hindi]);

  // Handle Single Vehicle Submission (Create Hold)
  const handleCreateHold = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');

    if (!selectedSlotId) {
      setFormError(hindi ? 'कृपया परीक्षण का समय (स्लॉट) चुनें।' : 'Please select an appointment time slot.');
      return;
    }

    const regValidation = validateVehicleRegistration(regNumber, locale);
    if (!regValidation.valid) {
      setFormError(regValidation.error || (hindi ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'));
      return;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setFormError(hindi ? 'कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile phone number.');
      return;
    }

    if (!selectedCategory) {
      setFormError(hindi ? 'मूल्य निर्धारण उपलब्ध नहीं है।' : 'Pricing category unavailable.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        locale,
        slotSnapshotId: selectedSlotId,
        categoryId: selectedCategory.id,
        vehicleType: `${vehicleClass}${companyName ? ` (${companyName})` : ''}`,
        customerName: customerName.trim() || (hindi ? 'ग्राहक' : 'Customer'),
        mobile: cleanPhone,
        vehicleRegistration: regValidation.normalized,
        source: 'WEB',
        idempotencyKey,
      };

      const res = await fetch('/api/booking/create-hold/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: any = await readApiJson(res);
      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'स्लॉट होल्ड करने में विफल।' : 'Could not reserve testing bay.'));
      }
      setHoldResult(data?.data);
    } catch (err: any) {
      setFormError(err.message || (hindi ? 'बुकिंग त्रुटि। कृपया पुनः प्रयास करें।' : 'Booking failed. Please retry.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle UTR Evidence Submission
  const handleSubmitUtr = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEvidenceError('');
    if (!holdResult?.bookingCode || !utrNumber.trim()) {
      setEvidenceError(hindi ? 'कृपया UPI लेनदेन संदर्भ संख्या (UTR) दर्ज करें।' : 'Please enter the 12-digit UPI UTR number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/booking/submit-evidence/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingCode: holdResult.bookingCode,
          statusToken: holdResult.statusToken,
          utr: utrNumber.trim(),
          source: 'WEB',
        }),
      });
      const data: any = await readApiJson(res);
      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'यूटीआर जमा करने में विफल।' : 'Could not submit payment reference.'));
      }
      setEvidenceSubmitted(true);
    } catch (err: any) {
      setEvidenceError(err.message || 'Error submitting UTR reference');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Multi-Vehicle Fleet Helpers
  const addFleetRow = () => {
    if (fleetVehicles.length >= 6) return;
    setFleetVehicles([
      ...fleetVehicles,
      { id: String(Date.now()), vehicleType: 'Car', cylinderCount: 1, registration: '' },
    ]);
  };

  const removeFleetRow = (id: string) => {
    if (fleetVehicles.length <= 1) return;
    setFleetVehicles(fleetVehicles.filter((v) => v.id !== id));
  };

  const updateFleetRow = (id: string, field: keyof MultiVehicleRow, val: any) => {
    setFleetVehicles(
      fleetVehicles.map((v) => (v.id === id ? { ...v, [field]: val } : v))
    );
  };

  const handleFleetSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!fleetContactPhone.trim()) {
      setFormError(hindi ? 'कृपया संपर्क मोबाइल नंबर दर्ज करें।' : 'Please enter contact phone number.');
      return;
    }
    setFleetSubmitted(true);
  };

  return (
    <div className="inline-booking-box" id="booking">
      {/* Header Tabs: Single Vehicle vs Multiple Vehicles */}
      <div className="booking-mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={bookingMode === 'single'}
          className={`tab-btn ${bookingMode === 'single' ? 'active' : ''}`}
          onClick={() => { setBookingMode('single'); setFormError(''); }}
        >
          🚗 {hindi ? 'एक वाहन' : 'One Vehicle'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bookingMode === 'fleet'}
          className={`tab-btn ${bookingMode === 'fleet' ? 'active' : ''}`}
          onClick={() => { setBookingMode('fleet'); setFormError(''); }}
        >
          🚛 {hindi ? 'एकाधिक वाहन / फ्लीट' : 'Multiple Vehicles / Fleets'}
        </button>
      </div>

      {/* SINGLE VEHICLE MODE */}
      {bookingMode === 'single' && (
        <div className="booking-pane">
          {!holdResult ? (
            <form onSubmit={handleCreateHold} className="booking-form-flow">
              {/* Step 1: Vehicle Category & Cylinder Selection */}
              <div className="flow-step">
                <div className="step-badge">
                  <span className="badge-num">1</span>
                  <label className="step-title">{hindi ? 'वाहन प्रकार एवं सिलेंडर संख्या' : 'Vehicle Type & Cylinder Count'}</label>
                </div>

                <div className="category-pill-grid">
                  {VEHICLE_OPTIONS.slice(0, 6).map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      className={`pill-choice ${vehicleClass === opt.value ? 'selected' : ''}`}
                      onClick={() => handleVehicleSelect(opt.value)}
                    >
                      {opt.value === 'Car' && '🚗 '}
                      {opt.value === 'Taxi' && '🚕 '}
                      {opt.value === 'Tempo' && '🛺 '}
                      {opt.value === 'Van' && '🚐 '}
                      {opt.value === 'LCV' && '🚚 '}
                      {opt.value === 'Truck' && '🚛 '}
                      {hindi ? opt.labelHi.split(' / ')[0] : opt.labelEn.split(' (')[0]}
                    </button>
                  ))}
                </div>

                <div className="cylinder-selector-row">
                  <span className="sub-label">{hindi ? 'सिलेंडर संख्या:' : 'Cylinders Fitted:'}</span>
                  <div className="cylinder-pill-group">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        type="button"
                        key={num}
                        className={`cyl-btn ${cylinderCount === num ? 'active' : ''}`}
                        onClick={() => setCylinderCount(num)}
                      >
                        {num}
                      </button>
                    ))}
                    <a
                      href={`https://wa.me/${DEFAULT_CONTACT_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(
                        hindi ? 'नमस्ते, मेरे वाहन में 6 से अधिक सीएनजी सिलेंडर हैं, विशेष टेस्टिंग स्लॉट चाहिए।' : 'Hello HSR, my vehicle has more than 6 CNG cylinders, I need to schedule a heavy testing bay.'
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="cyl-more-link"
                    >
                      {hindi ? '> 6 सिलेंडर?' : '> 6 Cylinders?'}
                    </a>
                  </div>
                </div>
              </div>

              {/* Step 2: Date & Available Time Slot */}
              <div className="flow-step">
                <div className="step-badge">
                  <span className="badge-num">2</span>
                  <label className="step-title">{hindi ? 'तारीख एवं समय का चयन' : 'Select Date & Available Slot'}</label>
                </div>

                {/* Quick Date Pills */}
                <div className="date-pills-row">
                  {quickDates.map((qd) => (
                    <button
                      type="button"
                      key={qd.dateStr}
                      className={`date-pill ${serviceDate === qd.dateStr ? 'selected' : ''}`}
                      onClick={() => setServiceDate(qd.dateStr)}
                    >
                      {qd.label}
                    </button>
                  ))}
                </div>

                {/* Slots Loading or Hour Grid */}
                {loadingAvailability ? (
                  <div className="loading-slots-notice">
                    <span className="spinner"></span> {hindi ? 'उपलब्ध स्लॉट लोड हो रहे हैं...' : 'Checking bay capacity...'}
                  </div>
                ) : loadError ? (
                  <div className="form-error-banner">{loadError}</div>
                ) : dateSlots.length === 0 ? (
                  <div className="no-slots-alert">
                    <p>{hindi ? 'चयनित तारीख पर ऑनलाइन स्लॉट उपलब्ध नहीं हैं। कृपया अन्य तारीख चुनें या सीधे स्टेशन पर कॉल करें।' : 'No online slots remaining on this date. Please choose another date or contact the station directly.'}</p>
                    <a href={`tel:${stationPhone}`} className="btn btn-outline" style={{ display: 'inline-flex', marginTop: '0.5rem' }}>
                      📞 {stationPhone}
                    </a>
                  </div>
                ) : (
                  <div className="slots-selection-container">
                    {/* Hour Tabs */}
                    <div className="hour-pills-row">
                      {availableHours.map((hr) => (
                        <button
                          type="button"
                          key={hr}
                          className={`hour-btn ${selectedHour === hr ? 'active' : ''}`}
                          onClick={() => setSelectedHour(hr)}
                        >
                          {formatHourOption(hr, locale)}
                        </button>
                      ))}
                    </div>

                    {/* Exact Start Times in Selected Hour */}
                    <div className="slot-cards-grid">
                      {activeSlots.map((slot) => {
                        const isSelected = selectedSlotId === slot.slotSnapshotId;
                        return (
                          <button
                            type="button"
                            key={slot.slotSnapshotId}
                            className={`slot-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedSlotId(slot.slotSnapshotId)}
                          >
                            <span className="slot-time">{slot.startTime} – {slot.endTime}</span>
                            <span className="slot-bay-tag">
                              {slot.dayRemaining > 2 ? (
                                <span className="metric-chip metric-pass">{slot.dayRemaining} {hindi ? 'स्थान' : 'bays'}</span>
                              ) : (
                                <span className="metric-chip metric-amber">{slot.dayRemaining} {hindi ? 'बचे' : 'left'}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Registration & Mobile Phone */}
              <div className="flow-step">
                <div className="step-badge">
                  <span className="badge-num">3</span>
                  <label className="step-title">{hindi ? 'वाहन नंबर व ग्राहक जानकारी' : 'Vehicle Registration & Contact'}</label>
                </div>

                <div className="form-grid-3">
                  <div className="input-field">
                    <label className="field-label" htmlFor="reg-input">
                      {hindi ? 'वाहन पंजीकरण संख्या *' : 'Vehicle Registration *'}
                    </label>
                    <input
                      id="reg-input"
                      type="text"
                      className="form-input text-uppercase font-mono-num"
                      placeholder="e.g. HR36AB1234"
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                      required
                    />
                    <span className="field-hint">
                      {hindi ? 'HR या BH सीरीज मान्य' : 'State / BH series'}
                    </span>
                  </div>

                  <div className="input-field">
                    <label className="field-label" htmlFor="name-input">
                      {hindi ? 'ग्राहक का नाम (वैकल्पिक)' : 'Customer Name (Optional)'}
                    </label>
                    <input
                      id="name-input"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Amit Sharma"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <span className="field-hint">
                      {hindi ? 'प्रमाणपत्र हेतु' : 'For test records'}
                    </span>
                  </div>

                  <div className="input-field">
                    <label className="field-label" htmlFor="phone-input">
                      {hindi ? 'मोबाइल नंबर *' : 'Mobile Phone *'}
                    </label>
                    <input
                      id="phone-input"
                      type="tel"
                      className="form-input font-mono-num"
                      placeholder="9876543210"
                      maxLength={10}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      required
                    />
                    <span className="field-hint">
                      {hindi ? 'पुष्टि और गेट पास हेतु' : 'SMS / Pass sent here'}
                    </span>
                  </div>
                </div>

                {/* Optional Company Details Toggle */}
                <div className="company-toggle-wrap">
                  <button
                    type="button"
                    className="toggle-link-btn"
                    onClick={() => setShowCompanyDrawer(!showCompanyDrawer)}
                  >
                    {showCompanyDrawer ? '▲ ' : '▼ '}
                    {hindi ? 'कंपनी / GST इनवॉइस विवरण जोड़ें (वैकल्पिक)' : 'Add Company / GST Tax Invoice details (Optional)'}
                  </button>

                  {showCompanyDrawer && (
                    <div className="drawer-fields-grid">
                      <div className="input-field">
                        <label className="field-label">{hindi ? 'कंपनी / व्यवसाय का नाम' : 'Company / Business Name'}</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Haryana Logistics Ltd"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        />
                      </div>
                      <div className="input-field">
                        <label className="field-label">{hindi ? 'GSTIN संख्या' : 'GSTIN Number'}</label>
                        <input
                          type="text"
                          className="form-input text-uppercase font-mono-num"
                          placeholder="06AAAAA0000A1Z5"
                          value={companyGstin}
                          onChange={(e) => setCompanyGstin(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Price Breakdown & Advance Banner */}
              {selectedCategory && (
                <div className="pricing-summary-card">
                  <div className="pricing-header-row">
                    <div>
                      <strong className="summary-title">{vehicleClass} — {cylinderCount} {hindi ? 'सिलेंडर' : 'Cylinder(s)'}</strong>
                      <span className="summary-subtitle">{hindi ? '300 बार हाइड्रोस्टेटिक स्ट्रेच टेस्टिंग + प्लेट + प्रमाणन' : '300 Bar Hydrostatic Stretch Test + Plate + Certificate'}</span>
                    </div>
                    <div className="summary-badge-pill">
                      <span className="metric-chip metric-cyan">{hindi ? 'स्थिर शुल्क' : 'Official Rate'}</span>
                    </div>
                  </div>

                  <div className="price-calc-grid">
                    <div className="calc-item">
                      <span>{hindi ? 'मूल सेवा शुल्क' : 'Service Fee'}:</span>
                      <strong>{inr(selectedCategory.basePricePaise)}</strong>
                    </div>
                    <div className="calc-item">
                      <span>GST (18%):</span>
                      <strong>{inr(selectedCategory.gstPaise)}</strong>
                    </div>
                    <div className="calc-item total-item">
                      <span>{hindi ? 'कुल शुल्क' : 'Total Amount'}:</span>
                      <strong className="highlight-price">{inr(selectedCategory.totalPaise)}</strong>
                    </div>
                  </div>

                  <div className="advance-highlight-banner">
                    <div className="advance-info">
                      <span className="adv-tag">{hindi ? 'अनिवार्य अग्रिम' : 'Advance Required'}</span>
                      <strong className="adv-amt">₹500.00</strong>
                      <span className="adv-desc">
                        {hindi ? 'स्लॉट होल्ड करने के लिए ₹500 का अग्रिम भुगतान आवश्यक है। शेष राशि टेस्टिंग के बाद केंद्र पर देय होगी।' : '₹500 flat advance to hold testing bay. Remaining balance payable at station after test completion.'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Error Banner */}
              {formError && (
                <div className="form-error-banner" role="alert">
                  ⚠️ {formError}
                </div>
              )}

              {/* Submit Button */}
              <div className="action-row">
                <button
                  type="submit"
                  className="btn btn-primary submit-book-btn"
                  disabled={isSubmitting || !selectedSlotId}
                >
                  {isSubmitting ? (
                    <span>⏳ {hindi ? 'स्लॉट सुरक्षित हो रहा है...' : 'Reserving Testing Bay...'}</span>
                  ) : (
                    <span>⚡ {hindi ? 'स्लॉट बुक करें (₹500 अग्रिम)' : 'Reserve Testing Bay (₹500 Advance)'}</span>
                  )}
                </button>
              </div>
            </form>
          ) : !evidenceSubmitted ? (
            /* STEP 2: HOLD CREATED — UPI PAYMENT & UTR SUBMISSION */
            <div className="hold-confirmation-card">
              <div className="hold-header">
                <span className="metric-chip metric-amber">⏳ {hindi ? 'स्लॉट 15 मिनट के लिए सुरक्षित' : 'Bay Held for 15 Minutes'}</span>
                <h3 className="hold-title">{hindi ? 'अग्रिम भुगतान (₹500.00) पूर्ण करें' : 'Complete ₹500.00 Advance Payment'}</h3>
                <p className="hold-meta">
                  <strong>{hindi ? 'बुकिंग कोड:' : 'Booking Reference:'}</strong> <code className="booking-code">{holdResult.bookingCode}</code>
                </p>
              </div>

              <div className="upi-payment-grid">
                {/* QR Code Container */}
                <div className="upi-qr-box">
                  {holdResult.upiUri ? (
                    <div className="qr-img-wrap">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(holdResult.upiUri)}`}
                        alt="UPI Payment QR"
                        className="qr-img"
                        width={180}
                        height={180}
                      />
                    </div>
                  ) : (
                    <div className="qr-placeholder">QR Code</div>
                  )}
                  <span className="qr-caption">{hindi ? 'किसी भी UPI ऐप से स्कैन करें' : 'Scan with GPay, PhonePe, Paytm'}</span>

                  {holdResult.upiUri && (
                    <a href={holdResult.upiUri} className="btn btn-outline upi-intent-btn">
                      📲 {hindi ? 'UPI ऐप में खोलें' : 'Pay via UPI App'}
                    </a>
                  )}
                </div>

                {/* UTR Form */}
                <div className="utr-submission-pane">
                  <form onSubmit={handleSubmitUtr}>
                    <label className="field-label" htmlFor="utr-input">
                      {hindi ? '12-अंकों का UPI लेनदेन संदर्भ (UTR Number) *' : 'Enter 12-digit UPI UTR / Ref Number *'}
                    </label>
                    <input
                      id="utr-input"
                      type="text"
                      className="form-input font-mono-num"
                      placeholder="e.g. 412345678901"
                      maxLength={20}
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      required
                    />
                    <span className="field-hint">
                      {hindi ? 'भुगतान सफल होने के बाद बैंक ऐप से प्राप्त 12-अंकों का संदर्भ नंबर दर्ज करें।' : 'Found in your UPI payment receipt (Google Pay / PhonePe / Paytm / BHIM).'}
                    </span>

                    {evidenceError && <div className="form-error-banner">{evidenceError}</div>}

                    <button
                      type="submit"
                      className="btn btn-primary submit-utr-btn"
                      disabled={isSubmitting || !utrNumber.trim()}
                    >
                      {isSubmitting ? '⏳ ...' : (hindi ? 'भुगतान संदर्भ जमा करें' : 'Submit Payment Reference')}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 3: EVIDENCE SUBMITTED CONFIRMATION */
            <div className="verified-confirmation-pane">
              <div className="success-icon-badge">✓</div>
              <h3 className="success-title">{hindi ? 'अपॉइंटमेंट संदर्भ सफलतापूर्वक जमा हो गया!' : 'Testing Bay Reserved Successfully!'}</h3>
              <p className="success-desc">
                {hindi
                  ? 'आपका भुगतान संदर्भ (UTR) दर्ज हो गया है। स्टेशन रिसेप्शन आगमन पर सत्यापन करेगा।'
                  : 'Your payment reference has been recorded. Our reception will verify your slot upon arrival.'}
              </p>

              <div className="booking-receipt-box">
                <div className="receipt-row">
                  <span>{hindi ? 'बुकिंग कोड' : 'Booking Code'}:</span>
                  <strong>{holdResult?.bookingCode}</strong>
                </div>
                <div className="receipt-row">
                  <span>{hindi ? 'वाहन नंबर' : 'Vehicle Reg'}:</span>
                  <strong className="font-mono-num">{regNumber}</strong>
                </div>
                <div className="receipt-row">
                  <span>{hindi ? 'तारीख व समय' : 'Slot Time'}:</span>
                  <strong>{serviceDate}</strong>
                </div>
                <div className="receipt-row">
                  <span>{hindi ? 'स्थान' : 'Station'}:</span>
                  <strong>{stationCity}, Haryana</strong>
                </div>
              </div>

              <div className="next-steps-guide">
                <strong>{hindi ? 'केंद्र पर आने से पहले ध्यान रखें:' : 'What to bring to the facility:'}</strong>
                <ul>
                  <li>{hindi ? 'वाहन की मूल आरसी (Registration Certificate)' : 'Original Vehicle RC (Registration Certificate)'}</li>
                  <li>{hindi ? 'पूर्व परीक्षण प्लेट / प्रमाणपत्र (यदि उपलब्ध हो)' : 'Previous test compliance plate / certificate if available'}</li>
                  <li>{hindi ? 'परीक्षण में लगभग 2 से 3 घंटे का समय लगता है।' : 'Typical turnaround time is 2 to 3 hours.'}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MULTIPLE VEHICLES / FLEET MODE */}
      {bookingMode === 'fleet' && (
        <div className="fleet-booking-pane">
          {!fleetSubmitted ? (
            <form onSubmit={handleFleetSubmit} className="fleet-form">
              <div className="fleet-intro-banner">
                <div>
                  <strong>{hindi ? 'वाणिज्यिक फ्लीट एवं मल्टी-व्हीकल टेस्टिंग' : 'Commercial Fleet & Multi-Vehicle Bulk Testing'}</strong>
                  <p>{hindi ? 'टेम्पो, बस, ट्रक और टैक्सी बेड़े के लिए समर्पित बे एवं प्राथमिकता परीक्षण।' : 'Priority bay reservation and scheduled turnaround for logistics, bus, and taxi fleets.'}</p>
                </div>
                <a
                  href={`https://wa.me/${DEFAULT_CONTACT_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(
                    hindi ? 'नमस्ते, हमारे फ्लीट वाहनों की सीएनजी हाइड्रो टेस्टिंग करवानी है।' : 'Hello HSR, we want to schedule hydro testing for our commercial vehicle fleet.'
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline fleet-wa-btn"
                >
                  💬 {hindi ? 'फ्लीट मैनेजर से चैट करें' : 'WhatsApp Fleet Manager'}
                </a>
              </div>

              {/* Fleet Vehicle Repeater */}
              <div className="fleet-repeater-box">
                <label className="field-label">{hindi ? 'फ्लीट वाहन सूची (2 से 6 वाहन)' : 'Vehicle Roster (2 to 6 vehicles)'}</label>
                {fleetVehicles.map((row, idx) => (
                  <div key={row.id} className="fleet-vehicle-row">
                    <span className="row-num">#{idx + 1}</span>
                    <select
                      className="form-input fleet-select"
                      value={row.vehicleType}
                      onChange={(e) => updateFleetRow(row.id, 'vehicleType', e.target.value)}
                    >
                      <option value="Car">Car</option>
                      <option value="Taxi">Taxi</option>
                      <option value="Tempo">Tempo</option>
                      <option value="LCV">LCV</option>
                      <option value="Truck">Truck</option>
                      <option value="Bus">Bus</option>
                    </select>

                    <input
                      type="number"
                      min={1}
                      max={6}
                      className="form-input fleet-cyl-input"
                      placeholder="Cylinders"
                      value={row.cylinderCount}
                      onChange={(e) => updateFleetRow(row.id, 'cylinderCount', parseInt(e.target.value, 10) || 1)}
                    />

                    <input
                      type="text"
                      className="form-input fleet-reg-input text-uppercase font-mono-num"
                      placeholder="HR36AB1234"
                      value={row.registration}
                      onChange={(e) => updateFleetRow(row.id, 'registration', e.target.value.toUpperCase())}
                      required
                    />

                    {fleetVehicles.length > 1 && (
                      <button
                        type="button"
                        className="remove-row-btn"
                        onClick={() => removeFleetRow(row.id)}
                        aria-label="Remove vehicle"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {fleetVehicles.length < 6 && (
                  <button type="button" className="btn btn-secondary add-fleet-btn" onClick={addFleetRow}>
                    + {hindi ? 'अन्य वाहन जोड़ें' : 'Add Another Vehicle'}
                  </button>
                )}
              </div>

              {/* Fleet Contact & Date */}
              <div className="form-grid-3" style={{ marginTop: '1.25rem' }}>
                <div className="input-field">
                  <label className="field-label">{hindi ? 'फ्लीट सुपरवाइज़र का नाम *' : 'Supervisor / Contact Name *'}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Rajesh Kumar"
                    value={fleetContactName}
                    onChange={(e) => setFleetContactName(e.target.value)}
                    required
                  />
                </div>

                <div className="input-field">
                  <label className="field-label">{hindi ? 'मोबाइल नंबर *' : 'Direct Phone Number *'}</label>
                  <input
                    type="tel"
                    className="form-input font-mono-num"
                    placeholder="9876543210"
                    value={fleetContactPhone}
                    onChange={(e) => setFleetContactPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="input-field">
                  <label className="field-label">{hindi ? 'पसंदीदा तारीख' : 'Preferred Date'}</label>
                  <input
                    type="date"
                    className="form-input font-mono-num"
                    min={todayInIndia()}
                    value={fleetDate}
                    onChange={(e) => setFleetDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="action-row" style={{ marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary submit-book-btn">
                  📋 {hindi ? 'फ्लीट अपॉइंटमेंट शेड्यूल करें' : 'Schedule Fleet Inspection'}
                </button>
              </div>
            </form>
          ) : (
            <div className="verified-confirmation-pane">
              <div className="success-icon-badge">✓</div>
              <h3 className="success-title">{hindi ? 'फ्लीट अनुरोध दर्ज हो गया!' : 'Fleet Request Received!'}</h3>
              <p className="success-desc">
                {hindi
                  ? `आपके ${fleetVehicles.length} वाहनों के लिए अनुरोध दर्ज कर लिया गया है। हमारे स्टेशन ऑपरेशंस मैनेजर आपसे 30 मिनट में संपर्क करेंगे।`
                  : `Your request for ${fleetVehicles.length} vehicles has been received. Our station operations team will coordinate bay allocation directly.`}
              </p>
              <div className="action-row" style={{ justifyContent: 'center' }}>
                <a href={`tel:${stationPhone}`} className="btn btn-primary">
                  📞 {hindi ? 'स्टेशन से सीधे बात करें' : 'Call Station Operations'} ({stationPhone})
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scoped CSS for Inline Booking Container */}
      <style>{`
        .inline-booking-box {
          background: #ffffff;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          overflow: hidden;
          margin: 1.5rem 0;
        }

        .booking-mode-tabs {
          display: flex;
          background: var(--color-slate-100);
          border-bottom: 1px solid var(--border-default);
        }

        .tab-btn {
          flex: 1;
          padding: 1rem;
          font-family: var(--font-heading);
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--color-slate-600);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .tab-btn.active {
          background: #ffffff;
          color: var(--color-navy-900);
          border-bottom: 3px solid var(--color-action);
        }

        .booking-pane, .fleet-booking-pane {
          padding: 1.75rem;
        }

        .flow-step {
          margin-bottom: 1.75rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .flow-step:last-of-type {
          border-bottom: none;
          margin-bottom: 1rem;
        }

        .step-badge {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin-bottom: 1rem;
        }

        .badge-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--color-navy-900);
          color: #ffffff;
          font-size: 0.8rem;
          font-weight: 800;
        }

        .step-title {
          font-family: var(--font-heading);
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--color-navy-900);
        }

        .category-pill-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 0.6rem;
          margin-bottom: 1rem;
        }

        .pill-choice {
          padding: 0.65rem 0.75rem;
          background: var(--color-slate-50);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.88rem;
          color: var(--color-slate-800);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }

        .pill-choice:hover {
          border-color: var(--color-steel-600);
          background: var(--color-steel-50);
        }

        .pill-choice.selected {
          border-color: var(--color-action);
          background: #fff7ed;
          color: var(--color-action-active);
          font-weight: 700;
          box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.2);
        }

        .cylinder-selector-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
          padding-top: 0.5rem;
        }

        .sub-label {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--color-slate-700);
        }

        .cylinder-pill-group {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .cyl-btn {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
          background: #ffffff;
          font-weight: 700;
          color: var(--color-slate-800);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .cyl-btn:hover {
          border-color: var(--color-steel-600);
        }

        .cyl-btn.active {
          background: var(--color-action);
          border-color: var(--color-action);
          color: #ffffff;
        }

        .cyl-more-link {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--color-steel-600);
          text-decoration: underline;
          margin-left: 0.5rem;
        }

        .date-pills-row {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding-bottom: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .date-pill {
          padding: 0.5rem 0.85rem;
          background: var(--color-slate-50);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--color-slate-700);
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .date-pill:hover {
          border-color: var(--color-steel-600);
        }

        .date-pill.selected {
          background: var(--color-navy-900);
          border-color: var(--color-navy-900);
          color: #ffffff;
        }

        .loading-slots-notice {
          padding: 1rem;
          color: var(--color-slate-600);
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--border-default);
          border-top-color: var(--color-action);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .no-slots-alert {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
          padding: 1rem;
          border-radius: var(--radius-md);
          font-size: 0.9rem;
        }

        .hour-pills-row {
          display: flex;
          gap: 0.4rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .hour-btn {
          padding: 0.35rem 0.75rem;
          background: var(--color-slate-100);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--color-slate-700);
          cursor: pointer;
          white-space: nowrap;
        }

        .hour-btn.active {
          background: var(--color-steel-600);
          border-color: var(--color-steel-600);
          color: #ffffff;
        }

        .slot-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 0.6rem;
        }

        .slot-card {
          padding: 0.75rem 0.85rem;
          background: #ffffff;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          text-align: left;
          transition: all 0.15s ease;
        }

        .slot-card:hover {
          border-color: var(--color-steel-600);
          background: var(--color-steel-50);
        }

        .slot-card.selected {
          border-color: var(--color-action);
          background: #fff7ed;
          box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.2);
        }

        .slot-time {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 0.92rem;
          color: var(--color-navy-900);
        }

        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .input-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .field-label {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--color-slate-800);
        }

        .field-hint {
          font-size: 0.75rem;
          color: var(--color-slate-600);
        }

        .text-uppercase {
          text-transform: uppercase;
        }

        .company-toggle-wrap {
          margin-top: 1rem;
        }

        .toggle-link-btn {
          background: none;
          border: none;
          padding: 0;
          color: var(--color-steel-600);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }

        .drawer-fields-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-top: 0.75rem;
          padding: 1rem;
          background: var(--color-slate-50);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
        }

        .pricing-summary-card {
          background: var(--color-slate-50);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          margin-bottom: 1.25rem;
        }

        .pricing-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 0.75rem;
        }

        .summary-title {
          display: block;
          font-size: 1rem;
          color: var(--color-navy-900);
        }

        .summary-subtitle {
          font-size: 0.8rem;
          color: var(--color-slate-600);
        }

        .price-calc-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .calc-item {
          display: flex;
          flex-direction: column;
          font-size: 0.85rem;
          color: var(--color-slate-700);
        }

        .calc-item strong {
          font-family: var(--font-mono);
          font-size: 1rem;
          color: var(--color-navy-900);
        }

        .total-item .highlight-price {
          color: var(--color-steel-600);
          font-size: 1.15rem;
          font-weight: 800;
        }

        .advance-highlight-banner {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: var(--radius-sm);
          padding: 0.85rem 1rem;
        }

        .advance-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .adv-tag {
          background: var(--color-action);
          color: #ffffff;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 0.15rem 0.5rem;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
        }

        .adv-amt {
          font-family: var(--font-mono);
          font-size: 1.25rem;
          color: var(--color-action-active);
        }

        .adv-desc {
          font-size: 0.82rem;
          color: var(--color-slate-700);
          flex: 1;
        }

        .action-row {
          display: flex;
          justify-content: flex-end;
        }

        .submit-book-btn {
          width: 100%;
          min-height: 52px;
          font-size: 1.05rem;
        }

        /* Hold Confirmation Styles */
        .hold-confirmation-card {
          padding: 1rem 0;
        }

        .hold-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .hold-title {
          font-size: 1.4rem;
          color: var(--color-navy-900);
          margin: 0.5rem 0 0.25rem;
        }

        .booking-code {
          background: var(--color-slate-100);
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 1.05rem;
          color: var(--color-action-active);
        }

        .upi-payment-grid {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 2rem;
          align-items: center;
          background: var(--color-slate-50);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: 1.5rem;
        }

        .upi-qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .qr-img-wrap {
          background: #ffffff;
          padding: 0.5rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-default);
        }

        .qr-caption {
          font-size: 0.78rem;
          color: var(--color-slate-600);
          margin-top: 0.5rem;
        }

        .upi-intent-btn {
          margin-top: 0.75rem;
          width: 100%;
          font-size: 0.85rem;
        }

        .submit-utr-btn {
          width: 100%;
          margin-top: 1rem;
        }

        /* Success Pane */
        .verified-confirmation-pane {
          text-align: center;
          padding: 2rem 1rem;
        }

        .success-title {
          font-size: 1.4rem;
          color: var(--color-success);
          margin: 0.5rem 0;
        }

        .success-desc {
          font-size: 0.95rem;
          color: var(--color-slate-600);
          max-width: 50ch;
          margin: 0 auto 1.5rem;
        }

        .booking-receipt-box {
          background: var(--color-slate-50);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          max-width: 420px;
          margin: 0 auto 1.5rem;
          padding: 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          text-align: left;
        }

        .receipt-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
        }

        .next-steps-guide {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: var(--radius-md);
          max-width: 500px;
          margin: 0 auto;
          padding: 1rem 1.25rem;
          text-align: left;
          font-size: 0.88rem;
          color: #166534;
        }

        .next-steps-guide ul {
          margin: 0.5rem 0 0 1.25rem;
          padding: 0;
        }

        /* Fleet Styles */
        .fleet-intro-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--color-slate-50);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          margin-bottom: 1.5rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .fleet-vehicle-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.65rem;
        }

        .row-num {
          font-weight: 700;
          color: var(--color-slate-600);
          width: 25px;
        }

        .fleet-select {
          width: 120px;
        }

        .fleet-cyl-input {
          width: 90px;
        }

        .fleet-reg-input {
          flex: 1;
        }

        .remove-row-btn {
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--color-danger);
          padding: 0.4rem 0.6rem;
          cursor: pointer;
        }

        .add-fleet-btn {
          margin-top: 0.5rem;
          font-size: 0.85rem;
        }

        @media (max-width: 768px) {
          .booking-pane, .fleet-booking-pane {
            padding: 1.25rem;
          }
          .form-grid-2, .form-grid-3, .drawer-fields-grid {
            grid-template-columns: 1fr;
          }
          .upi-payment-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          .price-calc-grid {
            grid-template-columns: 1fr;
            gap: 0.4rem;
          }
          .fleet-vehicle-row {
            flex-wrap: wrap;
          }
          .fleet-reg-input {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
