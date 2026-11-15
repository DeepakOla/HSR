import React, { useEffect, useState } from 'react';
import type { Locale } from '../../lib/constants';

interface DueDateRecord {
  registration: string;
  lastTestDate: string | null;
  nextDueDate: string;
  daysRemaining: number;
  timeRemainingFormatted: string;
  status: 'VALID' | 'EXPIRING_SOON' | 'OVERDUE';
  statusLabel: string;
  certificateReference?: string | null;
}

interface RetestDueModalProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
  bookUrl?: string;
  initialPath?: 'calculate' | 'assist';
}

export default function RetestDueModal({
  locale,
  isOpen,
  onClose,
  bookUrl = `/${locale}/#booking-form`,
  initialPath = 'assist',
}: RetestDueModalProps) {
  const hindi = locale === 'hi';
  const [activeTab, setActiveTab] = useState<'assist' | 'calculate'>(initialPath);

  // Path A: Calculate Yourself States
  const [calcDate, setCalcDate] = useState<string>('');
  const [calcReg, setCalcReg] = useState<string>('');
  const [calcLoading, setCalcLoading] = useState<boolean>(false);
  const [calcResult, setCalcResult] = useState<DueDateRecord | null>(null);
  const [calcError, setCalcError] = useState<string>('');

  // Path B: Get Assistance States
  const [assistReg, setAssistReg] = useState<string>('');
  const [assistContact, setAssistContact] = useState<string>('');
  const [assistCylinderNote, setAssistCylinderNote] = useState<string>('');
  const [assistLoading, setAssistLoading] = useState<boolean>(false);
  const [assistError, setAssistError] = useState<string>('');
  const [assistDbMatch, setAssistDbMatch] = useState<DueDateRecord[] | null>(null);
  const [assistSubmitted, setAssistSubmitted] = useState<boolean>(false);
  const [assistVoucher, setAssistVoucher] = useState<string>('');
  const [assistSuccessMsg, setAssistSuccessMsg] = useState<string>('');

  // Reminder Subscription State
  const [reminderMobile, setReminderMobile] = useState<string>('');
  const [reminderLoading, setReminderLoading] = useState<boolean>(false);
  const [reminderSuccess, setReminderSuccess] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialPath);
    }
  }, [isOpen, initialPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handler for Path A: Calculate Yourself
  const handleCalculate = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCalcError('');
    setCalcResult(null);

    if (!calcDate) {
      setCalcError(
        hindi
          ? 'कृपया अंतिम हाइड्रो टेस्ट या सीएनजी फिटमेंट की तारीख चुनें।'
          : 'Please select your last hydro test or CNG fitment date.'
      );
      return;
    }

    setCalcLoading(true);
    try {
      const res = await fetch(`/api/public/due-date-lookup/?lastTestDate=${encodeURIComponent(calcDate)}&locale=${locale}`);
      const raw: any = await res.json();
      const data = raw?.data ?? raw;

      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'तारीख गणना में त्रुटि हुई' : 'Calculation error'));
      }

      if (data.found && Array.isArray(data.records) && data.records.length > 0) {
        const rec = data.records[0];
        if (calcReg) rec.registration = calcReg.toUpperCase();
        setCalcResult(rec);
      }
    } catch (err: any) {
      setCalcError(err.message || 'Error calculating statutory due date');
    } finally {
      setCalcLoading(false);
    }
  };

  // Handler for Path B: Search DB & Submit Assistance
  const handleAssistSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAssistError('');
    setAssistDbMatch(null);
    setAssistSuccessMsg('');

    const cleanReg = assistReg.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanContact = assistContact.trim();

    if (!cleanReg || cleanReg.length < 5) {
      setAssistError(
        hindi
          ? 'कृपया मान्य वाहन पंजीकरण संख्या दर्ज करें (उदा. HR26AB1234)।'
          : 'Please enter a valid vehicle registration number (e.g. HR26AB1234).'
      );
      return;
    }

    if (!cleanContact) {
      setAssistError(
        hindi
          ? 'कृपया मोबाइल नंबर या ईमेल आईडी दर्ज करें ताकि हम आपको जानकारी भेज सकें।'
          : 'Please enter mobile number or email so we can send your testing records.'
      );
      return;
    }

    setAssistLoading(true);
    try {
      // Step 1: Look up existing station database first
      const lookupParams = new URLSearchParams({ regNumber: cleanReg, locale });
      const lookupRes = await fetch(`/api/public/due-date-lookup/?${lookupParams.toString()}`);
      const lookupRaw: any = await lookupRes.json();
      const lookupData = lookupRaw?.data ?? lookupRaw;

      if (lookupRes.ok && lookupData.found && Array.isArray(lookupData.records) && lookupData.records.length > 0) {
        setAssistDbMatch(lookupData.records);
        setAssistLoading(false);
        return;
      }

      // Step 2: If not in local station DB, submit assistance request and issue ₹200 voucher
      const isEmail = cleanContact.includes('@');
      const payload: any = {
        vehicleRegistration: cleanReg,
        cylinderInfo: assistCylinderNote,
        locale,
      };
      if (isEmail) {
        payload.email = cleanContact;
      } else {
        payload.mobile = cleanContact.replace(/\D/g, '');
      }

      const assistRes = await fetch('/api/public/due-date-assistance/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const assistRaw: any = await assistRes.json();
      const assistData = assistRaw?.data ?? assistRaw;

      if (!assistRes.ok) {
        throw new Error(assistData?.error?.message || 'Could not submit assistance request');
      }

      setAssistSubmitted(true);
      setAssistVoucher(assistData.voucherCode || 'HSR200-SAVE');
      setAssistSuccessMsg(
        assistData.message ||
          (hindi
            ? 'अनुरोध प्राप्त हुआ! हमारी तकनीकी टीम रिकॉर्ड सत्यापित करके आपको सूचित करेगी।'
            : 'Assistance request logged! Our engineers will review cylinder plate records and notify you.')
      );
    } catch (err: any) {
      setAssistError(err.message || 'Could not complete request. Please try again.');
    } finally {
      setAssistLoading(false);
    }
  };

  // Handler for setting WhatsApp reminder
  const handleSetReminder = async (e: React.SyntheticEvent<HTMLFormElement>, reg: string, dueDate: string) => {
    e.preventDefault();
    const phone = reminderMobile.trim().replace(/\D/g, '');
    if (phone.length !== 10) {
      setCalcError(hindi ? 'कृपया 10-अंकों का मान्य मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setReminderLoading(true);
    try {
      const res = await fetch('/api/public/retest-reminder/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleRegistration: reg || 'UNKNOWN',
          mobile: phone,
          dueDate,
          channel: 'WHATSAPP',
          locale,
        }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to subscribe');

      setReminderSuccess(
        hindi
          ? 'रीटेस्ट रिमाइंडर सफलतापूर्वक सक्रिय! नियत तिथि से 30 दिन पहले आपको WhatsApp अलर्ट मिलेगा। ₹200 वाउचर कोड: HSR200-ALERT'
          : 'Free 3-year statutory reminder activated! You will receive a WhatsApp alert before due date. ₹200 Voucher Code: HSR200-ALERT'
      );
    } catch (err: any) {
      setCalcError(err.message || 'Error subscribing to reminder');
    } finally {
      setReminderLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 17, 40, 0.8)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          maxWidth: '580px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          padding: '2rem 1.75rem',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            cursor: 'pointer',
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
            fontWeight: 700,
          }}
        >
          ✕
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <span
            style={{
              display: 'inline-block',
              background: '#fed7aa',
              color: '#9a3412',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.4rem',
            }}
          >
            PESO Rule 35 • 3-Year Statutory Safety Retest
          </span>
          <h2
            style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: '#0a1128',
              margin: '0.25rem 0',
              lineHeight: 1.25,
            }}
          >
            {hindi ? 'सीएनजी सिलेंडर 3-वर्षीय रीटेस्ट तारीख जाँच' : 'Check 3-Year CNG Retest Due Date'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            {hindi
              ? 'अधिकांश ग्राहकों को अपनी अंतिम टेस्ट तिथि याद नहीं होती। सहायता चुनें या स्वयं गणना करें:'
              : "Most vehicle owners don't remember their last test date. Choose assistance or calculate below:"}
          </p>
        </div>

        {/* 2-Path Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            background: '#f1f5f9',
            padding: '0.35rem',
            borderRadius: '14px',
            marginBottom: '1.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('assist')}
            style={{
              background: activeTab === 'assist' ? '#ffffff' : 'transparent',
              color: activeTab === 'assist' ? '#0a1128' : '#64748b',
              border: 'none',
              padding: '0.7rem 0.5rem',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'assist' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🔍 {hindi ? 'मदद लें (अनुशंसित)' : 'Help me find it'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calculate')}
            style={{
              background: activeTab === 'calculate' ? '#ffffff' : 'transparent',
              color: activeTab === 'calculate' ? '#0a1128' : '#64748b',
              border: 'none',
              padding: '0.7rem 0.5rem',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'calculate' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            <span>📅 {hindi ? 'मुझे तारीख पता है' : 'I know my date'}</span>
          </button>
        </div>

        {/* TAB 1: HELP ME FIND MY DUE DATE (OPTION B) */}
        {activeTab === 'assist' && (
          <div>
            {!assistSubmitted && !assistDbMatch && (
              <form onSubmit={handleAssistSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>💡</span>
                    <strong style={{ fontSize: '0.85rem', color: '#0a1128' }}>
                      {hindi ? 'तारीख नहीं पता? कोई चिंता नहीं!' : "Don't know the exact date? No problem!"}
                    </strong>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, lineHeight: 1.45 }}>
                    {hindi
                      ? 'अपना गाड़ी नंबर और मोबाइल नंबर दर्ज करें। हम अपने स्टेशन डेटाबेस में जाँच करेंगे, और यदि नया रिकॉर्ड है तो हमारी टीम आरसी व सिलेंडर कॉलर प्लेट पढ़ने में आपकी निःशुल्क मदद करेगी।'
                      : 'Enter your vehicle and phone number. We search our verified database first. If new, our engineers assist you in reading your cylinder collar plate or RC without any charge.'}
                  </p>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {hindi ? 'वाहन पंजीकरण संख्या *' : 'Vehicle Registration Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HR26 DK 1234 or DL01 AB 5555"
                    value={assistReg}
                    onChange={(e) => setAssistReg(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      outline: 'none',
                      textTransform: 'uppercase',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {hindi ? 'मोबाइल नंबर अथवा ईमेल आईडी *' : 'Mobile Number or Email Address *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9812345678 or owner@example.com"
                    value={assistContact}
                    onChange={(e) => setAssistContact(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                    {hindi ? 'इस नंबर पर हम देय तारीख व ₹200 वाउचर कोड भेजेंगे।' : 'We send your verified due date and ₹200 voucher code here.'}
                  </span>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {hindi ? 'सिलेंडर प्लेट या आरसी पर कोई जानकारी (वैकल्पिक)' : 'Any Stamping on Plate or RC (Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder={hindi ? 'उदा. 03/23, कार मॉडल, या सिलेंडर सीरियल नंबर' : 'e.g. 03/23, car model, or serial stamped on plate'}
                    value={assistCylinderNote}
                    onChange={(e) => setAssistCylinderNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      fontSize: '0.88rem',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🎁</span>
                    <div>
                      <strong style={{ fontSize: '0.82rem', color: '#92400e' }}>
                        {hindi ? '₹200 एचएसआर वाउचर गारंटी' : 'Guaranteed ₹200 HSR Discount Voucher'}
                      </strong>
                      <p style={{ fontSize: '0.74rem', color: '#b45309', margin: 0 }}>
                        {hindi
                          ? 'अनुरोध सबमिट करने पर हमारे रेवाड़ी केंद्र पर टेस्ट के लिए तत्काल ₹200 वाउचर प्राप्त करें।'
                          : 'Get an instant ₹200 voucher redeemable on certified hydro testing at HSR Rewari.'}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={assistLoading}
                  style={{
                    background: '#ea580c',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '0.95rem',
                    fontSize: '0.98rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(234, 88, 12, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {assistLoading ? (
                    <span>⏳ {hindi ? 'जाँच एवं सबमिट हो रहा है...' : 'Searching & Processing...'}</span>
                  ) : (
                    <span>🔍 {hindi ? 'तारीख खोजें व ₹200 वाउचर पाएँ →' : 'Find My Due Date & Claim ₹200 Voucher →'}</span>
                  )}
                </button>
              </form>
            )}

            {/* Assistance Success Screen */}
            {assistSubmitted && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
                <h3 style={{ fontSize: '1.35rem', color: '#0a1128', fontWeight: 800, marginBottom: '0.5rem' }}>
                  {hindi ? 'अनुरोध सफलतापूर्वक दर्ज हुआ!' : 'Assistance Request Logged!'}
                </h3>
                <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                  {assistSuccessMsg}
                </p>

                {/* Voucher Box */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                    border: '2px dashed #ea580c',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    margin: '1.25rem 0',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9a3412', textTransform: 'uppercase' }}>
                    {hindi ? 'आपका विशिष्ट छूट वाउचर' : 'Your Exclusive Hydro Test Voucher'}
                  </span>
                  <div
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: '#ea580c',
                      letterSpacing: '0.08em',
                      margin: '0.35rem 0',
                    }}
                  >
                    {assistVoucher}
                  </div>
                  <strong style={{ display: 'block', fontSize: '0.95rem', color: '#0a1128' }}>
                    Flat ₹200 OFF on Hydro Testing
                  </strong>
                  <p style={{ fontSize: '0.75rem', color: '#78350f', margin: '0.25rem 0 0' }}>
                    {hindi
                      ? 'यह वाउचर एचएसआर रेवाड़ी स्टेशन पर मान्य है। स्लॉट बुक करते समय इसे दिखाएँ।'
                      : 'Redeemable at HSR Flagship Station, Rewari. Valid for 90 days.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a
                    href={bookUrl}
                    onClick={onClose}
                    style={{
                      background: '#0a1128',
                      color: '#ffffff',
                      padding: '0.8rem 1.5rem',
                      borderRadius: '12px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    ⚡ {hindi ? 'अभी ₹1,000 अग्रिम पर स्लॉट बुक करें' : 'Book Testing Slot (From ₹1,000 Advance) →'}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setAssistSubmitted(false);
                      setAssistDbMatch(null);
                    }}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      padding: '0.8rem 1.25rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: '#334155',
                    }}
                  >
                    {hindi ? 'अन्य गाड़ी की जाँच करें' : 'Check Another Vehicle'}
                  </button>
                </div>
              </div>
            )}

            {/* If Found in DB Match */}
            {assistDbMatch && assistDbMatch.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '12px', padding: '0.75rem 1rem' }}>
                  <strong style={{ color: '#166534', fontSize: '0.88rem' }}>
                    ✓ {hindi ? 'स्टेशन रिकॉर्ड में गाड़ी मिल गई!' : 'Vehicle Found in Certified Station Records!'}
                  </strong>
                </div>

                {assistDbMatch.map((rec, idx) => {
                  const isOverdue = rec.status === 'OVERDUE';
                  const isExpiringSoon = rec.status === 'EXPIRING_SOON';
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#f8fafc',
                        borderRadius: '16px',
                        border: `2px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                        padding: '1.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: '#0a1128' }}>
                          {rec.registration}
                        </span>
                        <span
                          style={{
                            background: isOverdue ? '#fee2e2' : isExpiringSoon ? '#fef3c7' : '#dcfce7',
                            color: isOverdue ? '#991b1b' : isExpiringSoon ? '#92400e' : '#166534',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {rec.statusLabel}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.82rem' }}>
                        <div>
                          <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>
                            {hindi ? 'अंतिम टेस्ट' : 'Last Hydro Test'}
                          </span>
                          <strong>{rec.lastTestDate || 'N/A'}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>
                            {hindi ? '3-वर्षीय नियत तारीख' : 'Statutory Retest Due'}
                          </span>
                          <strong style={{ color: isOverdue ? '#dc2626' : '#0f172a' }}>{rec.nextDueDate}</strong>
                        </div>
                      </div>

                      <p style={{ fontSize: '0.8rem', color: isOverdue ? '#dc2626' : '#475569', margin: '0.75rem 0' }}>
                        {rec.timeRemainingFormatted}
                      </p>

                      <a
                        href={bookUrl}
                        onClick={onClose}
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          background: '#ea580c',
                          color: '#ffffff',
                          padding: '0.75rem',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          textDecoration: 'none',
                        }}
                      >
                        ⚡ {hindi ? 'स्लॉट बुक करें (₹1,000 अग्रिम)' : 'Book Retest Slot (From ₹1,000 Advance) →'}
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            {assistError && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '10px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: '0.82rem' }}>
                ⚠️ {assistError}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CALCULATE YOURSELF (OPTION A) */}
        {activeTab === 'calculate' && (
          <div>
            <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* How to find stamping guide card */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem' }}>
                <strong style={{ fontSize: '0.82rem', color: '#0a1128', display: 'block', marginBottom: '0.35rem' }}>
                  🔎 {hindi ? 'तारीख कहाँ मिलेगी?' : 'Where to find your test/fitment date:'}
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.76rem', color: '#475569', lineHeight: 1.5 }}>
                  <li><strong>Brass Compliance Plate:</strong> Near the filling valve or boot frame (e.g. 05/2023).</li>
                  <li><strong>Cylinder Neck Ring:</strong> Stamped directly on the metal collar near valve.</li>
                  <li><strong>RC / Invoice:</strong> Date of vehicle CNG endorsement or kit installation.</li>
                </ul>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  {hindi ? 'अंतिम टेस्ट या सीएनजी फिटमेंट तारीख *' : 'Date of Last Hydro Test or Fitment *'}
                </label>
                <input
                  type="date"
                  required
                  value={calcDate}
                  onChange={(e) => setCalcDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  {hindi ? 'वाहन नंबर (वैकल्पिक)' : 'Vehicle Registration (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. HR26 DK 1234"
                  value={calcReg}
                  onChange={(e) => setCalcReg(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.9rem',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    textTransform: 'uppercase',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={calcLoading}
                style={{
                  background: '#0a1128',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {calcLoading ? (
                  <span>⏳ {hindi ? 'गणना हो रही है...' : 'Calculating Expiry...'}</span>
                ) : (
                  <span>📅 {hindi ? 'वैधानिक देय तारीख निकालें' : 'Calculate 3-Year Due Date'}</span>
                )}
              </button>
            </form>

            {calcError && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '10px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: '0.82rem' }}>
                ⚠️ {calcError}
              </div>
            )}

            {/* Calculated Result Card */}
            {calcResult && (
              <div
                style={{
                  marginTop: '1.25rem',
                  background: '#f8fafc',
                  border: `2px solid ${calcResult.status === 'OVERDUE' ? '#fca5a5' : '#86efac'}`,
                  borderRadius: '16px',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '1rem', color: '#0a1128' }}>
                    {hindi ? '3-वर्षीय वैधानिक परिणाम' : '3-Year Statutory Result'}
                  </strong>
                  <span
                    style={{
                      background: calcResult.status === 'OVERDUE' ? '#fee2e2' : '#dcfce7',
                      color: calcResult.status === 'OVERDUE' ? '#991b1b' : '#166534',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {calcResult.statusLabel}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.82rem', margin: '0.75rem 0' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Tested / Fitted</span>
                    <strong>{calcResult.lastTestDate}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Next Due Date (Rule 35)</span>
                    <strong style={{ color: calcResult.status === 'OVERDUE' ? '#dc2626' : '#0f172a' }}>
                      {calcResult.nextDueDate}
                    </strong>
                  </div>
                </div>

                <p style={{ fontSize: '0.82rem', color: calcResult.status === 'OVERDUE' ? '#dc2626' : '#15803d', margin: '0 0 1rem' }}>
                  {calcResult.timeRemainingFormatted}
                </p>

                {/* Free Reminder Alert Form */}
                <form
                  onSubmit={(e) => handleSetReminder(e, calcResult.registration, calcResult.nextDueDate)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <strong style={{ fontSize: '0.78rem', color: '#0a1128' }}>
                    🔔 {hindi ? 'निशुल्क WhatsApp रिमाइंडर सेट करें (+ ₹200 वाउचर)' : 'Set Free WhatsApp Alert (+ Claim ₹200 Voucher)'}
                  </strong>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      value={reminderMobile}
                      onChange={(e) => setReminderMobile(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={reminderLoading}
                      style={{
                        background: '#ea580c',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.5rem 0.85rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {reminderLoading ? 'Saving...' : 'Set Alert →'}
                    </button>
                  </div>
                  {reminderSuccess && (
                    <div style={{ fontSize: '0.75rem', color: '#166534', background: '#dcfce7', padding: '0.4rem', borderRadius: '6px' }}>
                      ✓ {reminderSuccess}
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
