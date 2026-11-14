import React, { useState, useEffect } from 'react';
import type { Locale } from '../../lib/constants';

interface BookingStatusData {
  bookingCode: string;
  reservationState: string;
  paymentState: string;
  serviceDate: string;
  slotLabel: string;
  cylinderCount: number;
}

interface VehicleDueData {
  registration: string;
  lastTestDate: string | null;
  nextDueDate: string;
  daysRemaining: number;
  timeRemainingFormatted: string;
  status: 'VALID' | 'EXPIRING_SOON' | 'OVERDUE';
  statusLabel: string;
  certificateReference?: string | null;
}

interface CustomerStatusViewProps {
  locale: Locale;
  initialBooking?: string;
  initialToken?: string;
  initialData?: BookingStatusData | null;
  stationCity?: string;
  stationPhone?: string;
  stationAddress?: string;
  stationMapUrl?: string;
}

const statusStepMap: Record<string, number> = {
  HELD: 1,
  PENDING_VERIFICATION: 1,
  CONFIRMED: 2,
  CHECKED_IN: 3,
  IN_PROGRESS: 4,
  COMPLETED: 5,
};

export default function CustomerStatusView({
  locale,
  initialBooking = '',
  initialToken = '',
  initialData = null,
  stationCity = 'Rewari',
  stationPhone = '+919910055355',
  stationAddress = 'HSR Green Energy, Rewari, Haryana',
  stationMapUrl = '#',
}: CustomerStatusViewProps) {
  const hindi = locale === 'hi';

  const [activeTab, setActiveTab] = useState<'BOOKING' | 'VEHICLE'>(initialBooking ? 'BOOKING' : 'VEHICLE');
  const [bookingCode, setBookingCode] = useState<string>(initialBooking);
  const [statusToken, setStatusToken] = useState<string>(initialToken);
  const [bookingData, setBookingData] = useState<BookingStatusData | null>(initialData);

  const [vehicleReg, setVehicleReg] = useState<string>('');
  const [vehicleData, setVehicleData] = useState<VehicleDueData | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialBooking && initialToken && !initialData) {
      void fetchBookingStatus(initialBooking, initialToken);
    }
  }, [initialBooking, initialToken]);

  const fetchBookingStatus = async (code: string, token: string) => {
    if (!code.trim() || !token.trim()) {
      setError(hindi ? 'कृपया बुकिंग कोड और सुरक्षा टोकन दोनों दर्ज करें।' : 'Please enter both your Booking Code and Security Token.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/status/${encodeURIComponent(code.trim())}?token=${encodeURIComponent(token.trim())}&locale=${locale}`);
      const payload: any = await res.json();
      if (!res.ok) {
        throw new Error(payload.error?.message || (hindi ? 'बुकिंग नहीं मिली' : 'Booking not found'));
      }
      setBookingData(payload.data);
    } catch (err: any) {
      setError(err.message || (hindi ? 'बुकिंग स्थिति प्राप्त करने में असमर्थ' : 'Could not fetch booking status'));
      setBookingData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBookingSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    void fetchBookingStatus(bookingCode, statusToken);
  };

  const handleVehicleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanReg = vehicleReg.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanReg.length < 5) {
      setError(hindi ? 'कृपया मान्य वाहन पंजीकरण संख्या दर्ज करें (उदा. HR26AB1234)।' : 'Please enter a valid vehicle registration number (e.g. HR26AB1234).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/public/due-date-lookup/?regNumber=${encodeURIComponent(cleanReg)}&locale=${locale}`);
      const payload: any = await res.json();
      if (!res.ok) throw new Error(payload.error?.message || 'Lookup failed');

      if (payload.found && Array.isArray(payload.records) && payload.records.length > 0) {
        setVehicleData(payload.records[0]);
      } else {
        setVehicleData(null);
        setError(payload.message || (hindi ? 'इस वाहन के लिए कोई पूर्व रिकॉर्ड नहीं मिला।' : 'No test records found for this vehicle.'));
      }
    } catch (err: any) {
      setError(err.message || (hindi ? 'जाँच करने में समस्या हुई' : 'Could not complete vehicle lookup'));
      setVehicleData(null);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = bookingData ? (statusStepMap[bookingData.reservationState] || 1) : 1;

  const steps = [
    { num: 1, title: hindi ? 'स्लॉट आरक्षित' : 'Bay Reserved', desc: hindi ? 'अपॉइंटमेंट तय हुआ' : 'Hold / Scheduled' },
    { num: 2, title: hindi ? 'भुगतान सत्यापित' : 'Payment Verified', desc: hindi ? 'वैधानिक शुल्क स्वीकृत' : 'Statutory Fee Confirmed' },
    { num: 3, title: hindi ? 'वाहन चेक-इन' : 'Vehicle Check-In', desc: hindi ? 'केंद्र पर आगमन' : 'Arrived at Station' },
    { num: 4, title: hindi ? 'हाइड्रो टेस्ट' : 'Hydrostatic Test', desc: hindi ? '300 बार दबाव परीक्षण' : '300 Bar Water Jacket Test' },
    { num: 5, title: hindi ? 'प्रमाणपत्र जारी' : 'Certified', desc: hindi ? 'अनुपालन प्लेट व प्रमाण' : 'Official Certificate Issued' },
  ];

  return (
    <div className="customer-status-container">
      {/* Header */}
      <div className="status-header">
        <span className="metric-chip metric-cyan">
          🛡️ {hindi ? 'केंद्रीय कैलेंडर एवं स्थिति पोर्टल' : 'Central Calendar & Live Status'}
        </span>
        <h1 className="status-title">
          {hindi ? 'सीएनजी सिलेंडर टेस्टिंग स्थिति एवं ट्रैकिंग' : 'Live CNG Cylinder Testing Status & Tracking'}
        </h1>
        <p className="status-subtitle">
          {hindi
            ? 'अपनी आगामी हाइड्रो-टेस्टिंग अपॉइंटमेंट की लाइव स्थिति ट्रैक करें, स्लॉट समय देखें, या डिजिटल प्रमाणपत्र डाउनलोड करें।'
            : 'Track your live appointment progress, verify scheduled slot time, or view compliance certification.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="status-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'BOOKING'}
          className={`status-tab ${activeTab === 'BOOKING' ? 'active' : ''}`}
          onClick={() => { setActiveTab('BOOKING'); setError(''); }}
        >
          🎫 {hindi ? 'बुकिंग कोड द्वारा' : 'By Booking Code & Token'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'VEHICLE'}
          className={`status-tab ${activeTab === 'VEHICLE' ? 'active' : ''}`}
          onClick={() => { setActiveTab('VEHICLE'); setError(''); }}
        >
          🚗 {hindi ? 'वाहन नंबर द्वारा' : 'By Vehicle Registration'}
        </button>
      </div>

      {/* Lookup Forms */}
      {activeTab === 'BOOKING' && !bookingData && (
        <div className="lookup-card">
          <form onSubmit={handleBookingSubmit} className="lookup-form">
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="input-booking-code" className="form-label">
                  {hindi ? 'बुकिंग कोड *' : 'Booking Code *'}
                </label>
                <input
                  id="input-booking-code"
                  type="text"
                  placeholder="e.g. HSR-20241024-XXXX"
                  value={bookingCode}
                  onChange={(e) => setBookingCode(e.target.value.toUpperCase())}
                  required
                  className="form-input font-mono-num"
                />
              </div>
              <div className="form-group">
                <label htmlFor="input-status-token" className="form-label">
                  {hindi ? 'सुरक्षा टोकन (Security Token) *' : 'Security Token (From SMS / Receipt) *'}
                </label>
                <input
                  id="input-status-token"
                  type="text"
                  placeholder="e.g. 8f4b62e..."
                  value={statusToken}
                  onChange={(e) => setStatusToken(e.target.value)}
                  required
                  className="form-input font-mono-num"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
              {loading ? '⏳ ...' : (hindi ? '🔍 स्थिति खोजें' : '🔍 Track Appointment')}
            </button>
          </form>
          <span className="lookup-hint">
            💡 {hindi
              ? 'टिप: यदि आपने बुकिंग पेज से लिंक खोला है, तो आपका टोकन अपने-आप भरा होना चाहिए।'
              : 'Tip: If you clicked the secure link in your booking confirmation, your token is loaded automatically.'}
          </span>
        </div>
      )}

      {activeTab === 'VEHICLE' && (
        <div className="lookup-card">
          <form onSubmit={handleVehicleSubmit} className="lookup-form">
            <div className="form-group">
              <label htmlFor="input-vehicle-reg" className="form-label">
                {hindi ? 'वाहन पंजीकरण संख्या दर्ज करें *' : 'Enter Indian Vehicle Registration Number *'}
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  id="input-vehicle-reg"
                  type="text"
                  placeholder="e.g. HR26DQ5551"
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                  required
                  style={{ flex: 1, minWidth: '220px' }}
                  className="form-input font-mono-num"
                />
                <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
                  {loading ? '⏳ ...' : (hindi ? '🔍 स्थिति जांचें' : '🔍 Check Validity')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="status-error-alert" role="alert">
          ⚠️ {error}
        </div>
      )}

      {/* BOOKING STATUS CARD & TIMELINE */}
      {activeTab === 'BOOKING' && bookingData && (
        <div className="booking-status-card">
          <div className="booking-top-bar">
            <div>
              <span className="eyebrow">{hindi ? 'बुकिंग संदर्भ' : 'Booking Reference'}</span>
              <h2 className="booking-code-heading font-mono-num">{bookingData.bookingCode}</h2>
            </div>
            <div className="status-badge-wrap">
              <span className={`metric-chip ${bookingData.reservationState === 'COMPLETED' ? 'metric-pass' : bookingData.reservationState === 'IN_PROGRESS' ? 'metric-cyan' : bookingData.reservationState === 'PENDING_VERIFICATION' ? 'metric-amber' : 'metric-navy'}`}>
                {bookingData.reservationState === 'COMPLETED' ? '✅ ' : '⚡ '}
                {bookingData.reservationState.replaceAll('_', ' ')}
              </span>
            </div>
          </div>

          {/* 5-Step Visual Stepper */}
          <div className="stepper-wrap">
            <div className="stepper-bar">
              {steps.map((step) => {
                const isPassed = step.num < currentStep;
                const isCurrent = step.num === currentStep;
                return (
                  <div key={step.num} className={`step-item ${isPassed ? 'step-passed' : isCurrent ? 'step-current' : 'step-upcoming'}`}>
                    <div className="step-circle">
                      {isPassed ? '✓' : step.num}
                    </div>
                    <div className="step-content">
                      <span className="step-title">{step.title}</span>
                      <span className="step-desc">{step.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Synchronized Calendar Details */}
          <div className="booking-details-grid">
            <div className="detail-card">
              <span className="detail-label">📅 {hindi ? 'अपॉइंटमेंट तिथि' : 'Scheduled Service Date'}</span>
              <strong className="detail-value font-mono-num">{bookingData.serviceDate}</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">⏰ {hindi ? 'आरक्षित समय स्लॉट' : 'Reserved Time Slot'}</span>
              <strong className="detail-value">{bookingData.slotLabel}</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">🛢️ {hindi ? 'सिलेंडर संख्या' : 'CNG Cylinders'}</span>
              <strong className="detail-value">{bookingData.cylinderCount} {bookingData.cylinderCount === 1 ? 'Cylinder' : 'Cylinders'}</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">💳 {hindi ? 'भुगतान स्थिति' : 'Payment Status'}</span>
              <strong className="detail-value text-success">{bookingData.paymentState.replaceAll('_', ' ')}</strong>
            </div>
          </div>

          {/* Station Location & Contact */}
          <div className="station-info-banner">
            <div className="station-text">
              <strong>📍 {hindi ? 'परीक्षण केंद्र का पता:' : 'Testing Centre Location:'}</strong>
              <p>{stationAddress} ({stationCity})</p>
            </div>
            <div className="station-actions">
              <a href={stationMapUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                🗺️ {hindi ? 'गूगल मैप्स पर दिशा देखें' : 'Get Directions'}
              </a>
              <a href={`https://wa.me/${stationPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ background: '#ffffff' }}>
                💬 {hindi ? 'व्हाट्सएप सहायता' : 'WhatsApp Desk'}
              </a>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ background: '#ffffff' }}
              onClick={() => { setBookingData(null); setBookingCode(''); setStatusToken(''); }}
            >
              🔄 {hindi ? 'अन्य बुकिंग खोजें' : 'Check Another Booking'}
            </button>
          </div>
        </div>
      )}

      {/* VEHICLE STATUS CARD */}
      {activeTab === 'VEHICLE' && vehicleData && (
        <div className="vehicle-result-card">
          <div className="booking-top-bar">
            <div>
              <span className="eyebrow">{hindi ? 'सत्यापित वाहन' : 'Verified Vehicle'}</span>
              <h2 className="booking-code-heading font-mono-num">{vehicleData.registration}</h2>
            </div>
            <div className="status-badge-wrap">
              <span className={`metric-chip ${vehicleData.status === 'OVERDUE' ? 'metric-fail' : vehicleData.status === 'EXPIRING_SOON' ? 'metric-amber' : 'metric-pass'}`}>
                {vehicleData.statusLabel}
              </span>
            </div>
          </div>

          <div className="booking-details-grid">
            {vehicleData.lastTestDate && (
              <div className="detail-card">
                <span className="detail-label">{hindi ? 'अंतिम टेस्ट की तारीख' : 'Last Tested Date'}</span>
                <strong className="detail-value font-mono-num">{vehicleData.lastTestDate}</strong>
              </div>
            )}
            <div className="detail-card">
              <span className="detail-label">{hindi ? 'अगली देय तिथि' : 'Next Retest Due Date'}</span>
              <strong className="detail-value font-mono-num highlight-due">{vehicleData.nextDueDate}</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">{hindi ? 'शेष वैधता' : 'Time Remaining'}</span>
              <strong className="detail-value">{vehicleData.timeRemainingFormatted}</strong>
            </div>
            {vehicleData.certificateReference && (
              <div className="detail-card">
                <span className="detail-label">{hindi ? 'डिजिटल प्रमाणपत्र कोड' : 'Certificate Ref'}</span>
                <strong className="detail-value font-mono-num">{vehicleData.certificateReference}</strong>
              </div>
            )}
          </div>

          <div className="station-info-banner" style={{ marginTop: '1.5rem' }}>
            <div>
              <strong>⚡ {hindi ? 'रीटेस्ट अपॉइंटमेंट की आवश्यकता है?' : 'Need to Schedule Retesting?'}</strong>
              <p>{hindi ? 'हमारे रेवाड़ी स्टेशन पर 2 से 3 घंटे में त्वरित प्रमाणित टेस्टिंग कराएँ।' : 'Express 2-3 hour turnaround with official compliance plate stamping.'}</p>
            </div>
            <a href={`/${locale}/book/`} className="btn btn-primary">
              ⚡ {hindi ? 'नया स्लॉट बुक करें' : 'Reserve Testing Bay'}
            </a>
          </div>
        </div>
      )}

      {/* Styling */}
      <style>{`
        .customer-status-container {
          max-width: 960px;
          margin: 1.5rem auto 3rem;
          padding: 0 1rem;
        }
        .status-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .status-title {
          font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
          font-size: clamp(1.8rem, 3.2vw, 2.3rem);
          color: var(--color-navy-900);
          margin: 0.5rem 0 0.4rem;
          letter-spacing: -0.02em;
        }
        .status-subtitle {
          color: var(--color-slate-600);
          font-size: 1.05rem;
          max-width: 620px;
          margin: 0 auto;
        }
        .status-tabs {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }
        .status-tab {
          padding: 0.65rem 1.25rem;
          background: #ffffff;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-weight: 600;
          color: var(--color-slate-600);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .status-tab.active {
          background: var(--color-navy-900);
          color: #ffffff;
          border-color: var(--color-navy-900);
        }
        .lookup-card {
          background: #ffffff;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 1.75rem;
          margin-bottom: 2rem;
          box-shadow: var(--shadow-sm);
        }
        .form-row-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .form-label {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--color-navy-900);
        }
        .form-input {
          padding: 0.75rem 1rem;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: 0.95rem;
        }
        .lookup-hint {
          display: block;
          margin-top: 1rem;
          font-size: 0.82rem;
          color: var(--color-slate-600);
        }
        .status-error-alert {
          background: #fef2f2;
          border: 1px solid #f87171;
          color: #dc2626;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-sm);
          margin-bottom: 2rem;
          font-weight: 500;
        }
        .booking-status-card, .vehicle-result-card {
          background: #ffffff;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 2rem;
          box-shadow: var(--shadow-md);
        }
        .booking-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 1.25rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .eyebrow {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--color-slate-600);
          letter-spacing: 0.05em;
          display: block;
        }
        .booking-code-heading {
          font-size: 1.6rem;
          color: var(--color-navy-900);
          margin: 0.2rem 0 0;
        }
        .stepper-wrap {
          margin: 2rem 0;
          overflow-x: auto;
        }
        .stepper-bar {
          display: flex;
          justify-content: space-between;
          position: relative;
          min-width: 580px;
        }
        .step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          flex: 1;
          position: relative;
        }
        .step-item:not(:last-child)::after {
          content: '';
          position: absolute;
          top: 18px;
          left: 50%;
          width: 100%;
          height: 2px;
          background: #e2e8f0;
          z-index: 1;
        }
        .step-item.step-passed:not(:last-child)::after {
          background: var(--color-success);
        }
        .step-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #cbd5e1;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.88rem;
          margin-bottom: 0.5rem;
          position: relative;
          z-index: 2;
        }
        .step-item.step-passed .step-circle {
          background: var(--color-success);
          border-color: var(--color-success);
          color: #ffffff;
        }
        .step-item.step-current .step-circle {
          background: var(--color-action);
          border-color: var(--color-action);
          color: #ffffff;
          box-shadow: 0 0 0 4px rgba(234, 88, 12, 0.2);
        }
        .step-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--color-navy-900);
          display: block;
        }
        .step-desc {
          font-size: 0.72rem;
          color: var(--color-slate-600);
        }
        .booking-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .detail-card {
          background: #f8fafc;
          border: 1px solid var(--border-subtle);
          padding: 1rem;
          border-radius: var(--radius-sm);
        }
        .detail-label {
          font-size: 0.78rem;
          color: var(--color-slate-600);
          display: block;
          margin-bottom: 0.35rem;
        }
        .detail-value {
          font-size: 1.15rem;
          color: var(--color-navy-900);
        }
        .station-info-banner {
          background: rgba(2, 132, 199, 0.05);
          border: 1px solid rgba(2, 132, 199, 0.2);
          border-radius: var(--radius-sm);
          padding: 1.25rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .station-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}
