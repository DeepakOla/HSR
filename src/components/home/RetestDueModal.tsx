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
}

export default function RetestDueModal({
  locale,
  isOpen,
  onClose,
  bookUrl = `/${locale}/#booking-form`,
}: RetestDueModalProps) {
  const hindi = locale === 'hi';
  const [queryInput, setQueryInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [results, setResults] = useState<DueDateRecord[] | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string>('');

  // Retest Reminder subscription
  const [reminderMobile, setReminderMobile] = useState<string>('');
  const [reminderSubmitting, setReminderSubmitting] = useState<boolean>(false);
  const [reminderSuccess, setReminderSuccess] = useState<string>('');

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

  const handleLookup = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotFoundMsg('');
    setResults(null);
    setReminderSuccess('');

    const clean = queryInput.trim();
    if (!clean) {
      setError(
        hindi
          ? 'कृपया वाहन पंजीकरण संख्या या 10-अंकों का मोबाइल नंबर दर्ज करें।'
          : 'Please enter vehicle registration number or 10-digit mobile number.'
      );
      return;
    }

    const digitsOnly = clean.replace(/\D/g, '');
    const isMobile = digitsOnly.length === 10 && !/[a-zA-Z]/.test(clean);

    const queryParams = new URLSearchParams({ locale });
    if (isMobile) {
      queryParams.set('mobile', digitsOnly);
    } else {
      const cleanReg = clean.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanReg.length < 5) {
        setError(
          hindi
            ? 'कृपया मान्य वाहन पंजीकरण संख्या दर्ज करें (उदा. HR26AB1234)।'
            : 'Please enter a valid vehicle registration number (e.g. HR26AB1234).'
        );
        return;
      }
      queryParams.set('regNumber', cleanReg);
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/public/due-date-lookup/?${queryParams.toString()}`);
      const raw: any = await res.json();
      const data = raw?.data ?? raw;
      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'जाँच करने में त्रुटि' : 'Error checking status'));
      }

      if (data.found && Array.isArray(data.records) && data.records.length > 0) {
        setResults(data.records);
      } else {
        setNotFoundMsg(data.message || (hindi ? 'कोई रिकॉर्ड नहीं मिला।' : 'No records found for this vehicle.'));
      }
    } catch (err: any) {
      setError(err.message || (hindi ? 'सर्वर से संपर्क करने में समस्या हुई।' : 'Could not complete lookup. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetReminder = async (e: React.SyntheticEvent<HTMLFormElement>, reg: string, dueDate: string) => {
    e.preventDefault();
    const phone = reminderMobile.trim().replace(/\D/g, '');
    if (phone.length !== 10) {
      setError(hindi ? 'कृपया 10-अंकों का मान्य मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setReminderSubmitting(true);
    try {
      const res = await fetch('/api/public/retest-reminder/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleRegistration: reg,
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
          ? 'रीटेस्ट रिमाइंडर सफलतापूर्वक सक्रिय हो गया! नियत तारीख से पूर्व आपको WhatsApp संदेश प्राप्त होगा।'
          : 'Free 3-year retest reminder activated! You will receive a WhatsApp alert before the due date.'
      );
    } catch (err: any) {
      setError(err.message || 'Error subscribing to reminder');
    } finally {
      setReminderSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 17, 40, 0.75)',
        backdropFilter: 'blur(4px)',
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
          borderRadius: '20px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          padding: '1.75rem',
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
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
          }}
        >
          ✕
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <span
            style={{
              display: 'inline-block',
              background: '#fed7aa',
              color: '#9a3412',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.35rem',
            }}
          >
            Rule 35 • Gas Cylinders Rules (2016)
          </span>
          <h2
            style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#0a1128',
              margin: '0.25rem 0',
            }}
          >
            {hindi ? 'सीएनजी सिलेंडर रीटेस्ट ड्यू-डेट चेकर' : 'Check CNG Cylinder Retest Due Date'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            {hindi
              ? 'वाहन नंबर या मोबाइल नंबर दर्ज करें और वैधानिक 3-वर्षीय वैधता जाँचें:'
              : 'Check statutory 3-year validity by Vehicle Registration or Registered Mobile Number:'}
          </p>
        </div>

        {/* Unified Search Form */}
        <form onSubmit={handleLookup} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                marginBottom: '0.35rem',
              }}
            >
              {hindi
                ? 'वाहन पंजीकरण संख्या अथवा मोबाइल नंबर (मल्टी-वाहन)'
                : 'Vehicle Registration Number or Phone Number (Multi-Vehicle)'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="e.g. HR26 DK 1234 or 9812345678"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  outline: 'none',
                  textTransform: 'uppercase',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#ea580c',
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
              boxShadow: '0 4px 6px -1px rgba(234, 88, 12, 0.25)',
            }}
          >
            {loading ? (
              <span>⏳ {hindi ? 'जाँच हो रही है...' : 'Checking Records...'}</span>
            ) : (
              <span>🔍 {hindi ? 'ड्यू-डेट जाँचें' : 'Check Retest Due Date'}</span>
            )}
          </button>
        </form>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              borderRadius: '10px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              fontSize: '0.82rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Not Found Banner */}
        {notFoundMsg && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', margin: 0 }}>
              {notFoundMsg}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.35rem' }}>
              {hindi
                ? 'यदि आपने पहले किसी अन्य केंद्र पर टेस्ट कराया था, तो आप हमारे रीवाड़ी केंद्र पर नया टेस्ट बुक कर सकते हैं।'
                : 'If previously tested elsewhere, you can book your fresh certified hydro test at our Rewari plant.'}
            </p>
            <a
              href={bookUrl}
              onClick={onClose}
              style={{
                display: 'inline-block',
                marginTop: '0.75rem',
                background: '#0a1128',
                color: '#ffffff',
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Book Fresh Hydro Test (From ₹1,400) →
            </a>
          </div>
        )}

        {/* Results List */}
        {results && results.length > 0 && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {results.map((rec, idx) => {
              const isOverdue = rec.status === 'OVERDUE';
              const isExpiringSoon = rec.status === 'EXPIRING_SOON';
              const badgeBg = isOverdue ? '#fee2e2' : isExpiringSoon ? '#fef3c7' : '#dcfce7';
              const badgeColor = isOverdue ? '#991b1b' : isExpiringSoon ? '#92400e' : '#166534';

              return (
                <div
                  key={idx}
                  style={{
                    background: '#f8fafc',
                    borderRadius: '14px',
                    border: `1.5px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '1.05rem', color: '#0a1128', fontFamily: 'JetBrains Mono, monospace' }}>
                      {rec.registration}
                    </strong>
                    <span
                      style={{
                        background: badgeBg,
                        color: badgeColor,
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {rec.statusLabel}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', color: '#475569' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>
                        {hindi ? 'अंतिम टेस्ट तिथि' : 'Last Tested'}
                      </span>
                      <strong>{rec.lastTestDate || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>
                        {hindi ? 'रीटेस्ट नियत तिथि' : 'Next Due Date'}
                      </span>
                      <strong style={{ color: isOverdue ? '#dc2626' : '#0f172a' }}>{rec.nextDueDate}</strong>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.78rem', color: isOverdue ? '#dc2626' : '#64748b', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
                    {rec.timeRemainingFormatted}
                  </p>

                  {/* Immediate Action Buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(isOverdue || isExpiringSoon) && (
                      <a
                        href={bookUrl}
                        onClick={onClose}
                        style={{
                          background: '#ea580c',
                          color: '#ffffff',
                          padding: '0.55rem 1rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        ⚡ {hindi ? 'तत्काल स्लॉट बुक करें' : 'Reserve Priority Testing Slot →'}
                      </a>
                    )}

                    {/* Free Reminder Subscription Form */}
                    <form
                      onSubmit={(e) => handleSetReminder(e, rec.registration, rec.nextDueDate)}
                      style={{ display: 'flex', gap: '0.35rem', flex: 1, minWidth: '220px' }}
                    >
                      <input
                        type="tel"
                        placeholder={hindi ? 'WhatsApp नंबर' : '10-Digit Mobile'}
                        maxLength={10}
                        value={reminderMobile}
                        onChange={(e) => setReminderMobile(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '0.45rem 0.65rem',
                          fontSize: '0.78rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={reminderSubmitting}
                        style={{
                          background: '#0a1128',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {reminderSubmitting ? '...' : '🔔 Set Alert'}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reminder Success Notification */}
        {reminderSuccess && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              borderRadius: '10px',
              background: '#dcfce7',
              border: '1px solid #86efac',
              color: '#166534',
              fontSize: '0.82rem',
            }}
          >
            ✅ {reminderSuccess}
          </div>
        )}
      </div>
    </div>
  );
}
