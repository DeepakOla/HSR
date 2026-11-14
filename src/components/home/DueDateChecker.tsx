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

interface DueDateCheckerProps {
  locale: Locale;
  bookUrl?: string;
  stationPhone?: string;
}

export default function DueDateChecker({ locale, bookUrl = `/${locale}/book/`, stationPhone }: DueDateCheckerProps) {
  const hindi = locale === 'hi';
  const [queryInput, setQueryInput] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>('');
  const [showManualDateFallback, setShowManualDateFallback] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [results, setResults] = useState<DueDateRecord[] | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string>('');

  // Option B: Retest Reminder Notification state
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(true);
  const [reminderMobile, setReminderMobile] = useState<string>('');
  const [reminderChannel, setReminderChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');
  const [reminderSubmitting, setReminderSubmitting] = useState<boolean>(false);
  const [reminderStatus, setReminderStatus] = useState<{ [reg: string]: { success?: boolean; message?: string } }>({});

  useEffect(() => {
    fetch('/api/public/config/')
      .then((res) => res.json())
      .then((data: any) => {
        if (data?.data && typeof data.data.enablePublicReminders === 'boolean') {
          setRemindersEnabled(data.data.enablePublicReminders);
        }
      })
      .catch(() => {});
  }, []);

  const handleSetReminder = async (e: React.SyntheticEvent<HTMLFormElement>, reg: string, dueDate: string, lastDate?: string | null) => {
    e.preventDefault();
    const phone = reminderMobile.trim().replace(/\D/g, '');
    if (phone.length !== 10) {
      setReminderStatus((prev) => ({ ...prev, [reg]: { success: false, message: hindi ? 'कृपया 10-अंकों का मान्य मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.' } }));
      return;
    }

    setReminderSubmitting(true);
    try {
      const res = await fetch('/api/public/retest-reminder/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vehicleRegistration: reg,
          mobile: phone,
          lastTestDate: lastDate || undefined,
          dueDate,
          reminderChannel,
          locale,
        }),
      });
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'रिमाइंडर सेट करने में त्रुटि' : 'Could not schedule reminder'));
      }
      setReminderStatus((prev) => ({ ...prev, [reg]: { success: true, message: data.message || (hindi ? 'रिमाइंडर सफलतापूर्वक दर्ज!' : 'Reminder registered!') } }));
    } catch (err: any) {
      setReminderStatus((prev) => ({ ...prev, [reg]: { success: false, message: err.message } }));
    } finally {
      setReminderSubmitting(false);
    }
  };

  const handleLookup = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotFoundMsg('');
    setResults(null);

    const clean = queryInput.trim();
    if (!clean) {
      setError(hindi ? 'कृपया वाहन पंजीकरण संख्या या 10-अंकों का मोबाइल नंबर दर्ज करें।' : 'Please enter vehicle registration number or 10-digit mobile number.');
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
        setError(hindi ? 'कृपया मान्य वाहन पंजीकरण संख्या दर्ज करें (उदा. HR26AB1234)।' : 'Please enter a valid vehicle registration number (e.g. HR26AB1234).');
        return;
      }
      queryParams.set('regNumber', cleanReg);
      if (manualDate) {
        queryParams.set('lastTestDate', manualDate);
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/public/due-date-lookup/?${queryParams.toString()}`);
      const raw: any = await res.json();
      const data = raw?.data ?? raw;
      if (!res.ok) {
        throw new Error(raw?.error?.message || (hindi ? 'जाँच करने में त्रुटि' : 'Error checking status'));
      }

      if (data.found && Array.isArray(data.records) && data.records.length > 0) {
        setResults(data.records);
        setShowManualDateFallback(false);
      } else {
        setNotFoundMsg(data.message || (hindi ? 'कोई रिकॉर्ड नहीं मिला।' : 'No records found.'));
        setShowManualDateFallback(true);
      }
    } catch (err: any) {
      setError(err.message || (hindi ? 'सर्वर से संपर्क करने में समस्या हुई।' : 'Could not complete lookup. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleManualDateCheck = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!manualDate) {
      setError(hindi ? 'कृपया अंतिम टेस्ट की तारीख चुनें।' : 'Please select the last test date.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const queryParams = new URLSearchParams({
        locale,
        lastTestDate: manualDate,
      });

      const clean = queryInput.trim();
      const digitsOnly = clean.replace(/\D/g, '');
      const isMobile = digitsOnly.length === 10 && !/[a-zA-Z]/.test(clean);
      if (clean && !isMobile) {
        queryParams.set('regNumber', clean.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      }

      const res = await fetch(`/api/public/due-date-lookup/?${queryParams.toString()}`);
      const raw: any = await res.json();
      const data = raw?.data ?? raw;
      if (!res.ok) {
        throw new Error(raw?.error?.message || (hindi ? 'तारीख गणना में त्रुटि' : 'Date calculation error'));
      }

      if (data.found && Array.isArray(data.records)) {
        setResults(data.records);
        setNotFoundMsg('');
        setShowManualDateFallback(false);
      }
    } catch (err: any) {
      setError(err.message || (hindi ? 'गणना में त्रुटि' : 'Calculation error'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setResults(null);
    setNotFoundMsg('');
    setError('');
    setShowManualDateFallback(false);
    setQueryInput('');
    setManualDate('');
  };

  return (
    <div className="due-date-checker-card">
      {!results ? (
        <div className="checker-compact-box">
          {/* Line 1: Header / Title */}
          <div className="checker-compact-header">
            <div className="checker-title-inline">
              <span className="metric-chip metric-cyan">🔍 {hindi ? 'वैधता जाँच' : 'Retest Due Checker'}</span>
              <h3 className="checker-title-compact">
                {hindi ? 'सीएनजी सिलेंडर रीटेस्ट ड्यू-डेट' : 'Check CNG Cylinder Retest Due Date'}
              </h3>
            </div>
            <span className="checker-subtext-inline">
              {hindi ? '3 वर्ष वैधानिक वैधता जाँच' : 'Statutory 3-Year Retest Verification'}
            </span>
          </div>

          {/* Line 2: Single unified input row */}
          <form onSubmit={handleLookup} className="checker-compact-form">
            <div className="checker-compact-input-row">
              <div className="checker-input-wrapper">
                <span className="checker-input-icon">🚗/📱</span>
                <input
                  id="checker-query-input"
                  type="text"
                  required
                  placeholder={
                    hindi
                      ? 'वाहन पंजीकरण संख्या या फोन नंबर (Multi-Vehicle)'
                      : 'Vehicle Registration Number or Phone number (Multi-Vehicle)'
                  }
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  className="checker-input-compact font-mono-num"
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="btn btn-primary checker-compact-btn" disabled={loading}>
                {loading ? (hindi ? 'जाँच हो रही है...' : 'Checking...') : (hindi ? 'स्थिति जाँचें →' : 'Check Status →')}
              </button>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div className="checker-error-alert" role="alert">
              ⚠️ {error}
            </div>
          )}

          {/* Not Found / Manual Fallback */}
          {notFoundMsg && showManualDateFallback && (
            <div className="checker-fallback-box">
              <div className="fallback-header">
                <strong>💡 {hindi ? 'पिछला रिकॉर्ड उपलब्ध नहीं' : 'No Past HSR Record Found'}</strong>
                <p>{notFoundMsg}</p>
              </div>

              <form onSubmit={handleManualDateCheck} className="fallback-date-form">
                <label htmlFor="fallback-test-date" className="fallback-label">
                  {hindi ? 'सिलेंडर पर अंकित अंतिम टेस्ट की तारीख (DD-MM-YYYY):' : 'Enter last test date stamped on cylinder collar / brass plate:'}
                </label>
                <div className="fallback-input-row">
                  <input
                    id="fallback-test-date"
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="fallback-date-input"
                  />
                  <button type="submit" className="btn btn-secondary fallback-btn" disabled={loading}>
                    {hindi ? 'वैधता निकालें' : 'Calculate Expiry'}
                  </button>
                </div>
              </form>

              <div className="fallback-cta-row">
                <span>{hindi ? 'या सीधे हमारी लैब में टेस्टिंग स्लॉट आरक्षित करें:' : 'Or reserve a certified inspection slot directly:'}</span>
                <a href={bookUrl} className="btn btn-primary">
                  ⚡ {hindi ? 'नया स्लॉट बुक करें' : 'Book Testing Bay'}
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* RESULTS VIEW */
        <div className="checker-results-wrap">
          <div className="results-list">
            {results.map((rec, index) => {
              const isOverdue = rec.status === 'OVERDUE';
              const isExpiringSoon = rec.status === 'EXPIRING_SOON';

              return (
                <div key={index} className={`result-card ${isOverdue ? 'result-overdue' : isExpiringSoon ? 'result-expiring' : 'result-valid'}`}>
                  <div className="result-card-header">
                    <div className="result-vehicle-id">
                      <span className="vehicle-tag">{hindi ? 'वाहन नंबर' : 'Vehicle'}</span>
                      <strong className="vehicle-num font-mono-num">{rec.registration}</strong>
                    </div>
                    <div className="result-status-badge">
                      <span className={`metric-chip ${isOverdue ? 'metric-fail' : isExpiringSoon ? 'metric-amber' : 'metric-pass'}`}>
                        {isOverdue ? '🚨 ' : isExpiringSoon ? '⏳ ' : '✅ '}
                        {rec.statusLabel}
                      </span>
                    </div>
                  </div>

                  <div className="result-details-grid">
                    {rec.lastTestDate && (
                      <div className="detail-item">
                        <span className="detail-label">{hindi ? 'अंतिम टेस्ट की तारीख' : 'Last Tested Date'}</span>
                        <strong className="detail-val font-mono-num">{rec.lastTestDate}</strong>
                      </div>
                    )}
                    <div className="detail-item">
                      <span className="detail-label">{hindi ? 'अगली देय तारीख (रीटेस्ट)' : 'Next Retest Due Date'}</span>
                      <strong className="detail-val font-mono-num highlight-due">{rec.nextDueDate}</strong>
                    </div>
                    <div className="detail-item time-item">
                      <span className="detail-label">{hindi ? 'शेष समय / स्थिति' : 'Time Remaining'}</span>
                      <strong className={`detail-val ${isOverdue ? 'text-overdue' : 'text-remaining'}`}>
                        {rec.timeRemainingFormatted}
                      </strong>
                    </div>
                    {rec.certificateReference && (
                      <div className="detail-item">
                        <span className="detail-label">{hindi ? 'प्रमाणपत्र संदर्भ' : 'Certificate Ref'}</span>
                        <span className="detail-val font-mono-num">{rec.certificateReference}</span>
                      </div>
                    )}
                  </div>

                  <div className="result-action-bar">
                    {isOverdue || isExpiringSoon ? (
                      <div className="urgent-refill-alert">
                        <span>
                          {isOverdue
                            ? (hindi ? '⚠️ आपका सिलेंडर रीटेस्ट ओवरड्यू है। सीएनजी पंप पर गैस भरने से इंकार किया जा सकता है।' : '⚠️ Your cylinder testing is overdue. CNG fuel stations may refuse refilling.')
                            : (hindi ? '💡 आपका परीक्षण जल्द ही देय है। पंप पर असुविधा से बचने के लिए समय पूर्व बुक करें।' : '💡 Testing is due shortly. Book in advance to avoid refilling disruption.')}
                        </span>
                        <a href={bookUrl} className="btn btn-primary result-book-btn">
                          ⚡ {hindi ? 'तुरंत स्लॉट बुक करें' : 'Book Testing Appointment'}
                        </a>
                      </div>
                    ) : (
                      <div className="valid-safe-bar">
                        <span>{hindi ? '✅ आपका सीएनजी सिलेंडर वर्तमान में वैधानिक मानकों के अनुसार प्रमाणित है।' : '✅ Your CNG cylinder is currently certified and compliant with safety norms.'}</span>
                        <a href={bookUrl} className="btn btn-outline" style={{ background: '#ffffff' }}>
                          📅 {hindi ? 'अग्रिम में स्लॉट बुक करें' : 'Schedule Future Test'}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Option B: Retest Reminder Alert Sign-up */}
                  {remindersEnabled && (
                    <div className="retest-reminder-box">
                      <div className="reminder-header">
                        <span className="reminder-icon">🔔</span>
                        <div className="reminder-text">
                          <strong>{hindi ? 'रीटेस्ट रिमाइंडर अलर्ट प्राप्त करें' : 'Get Free Expiry & Retest Reminder Alert'}</strong>
                          <p>{hindi ? 'अंतिम तारीख से 30 दिन पहले WhatsApp या SMS द्वारा सूचना प्राप्त करें।' : 'Receive timely WhatsApp / SMS alerts 30 days before statutory expiry to prevent pump refusal.'}</p>
                        </div>
                      </div>

                      {reminderStatus[rec.registration]?.success ? (
                        <div className="reminder-success-msg" role="status">
                          ✅ {reminderStatus[rec.registration].message}
                        </div>
                      ) : (
                        <form onSubmit={(e) => handleSetReminder(e, rec.registration, rec.nextDueDate, rec.lastTestDate)} className="reminder-inline-form">
                          <input
                            type="tel"
                            placeholder={hindi ? '10-अंकों का मोबाइल नंबर' : '10-digit mobile number'}
                            maxLength={10}
                            value={reminderMobile}
                            onChange={(e) => setReminderMobile(e.target.value.replace(/\D/g, ''))}
                            required
                            className="reminder-input"
                          />
                          <select
                            value={reminderChannel}
                            onChange={(e) => setReminderChannel(e.target.value as any)}
                            className="reminder-channel-select"
                          >
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="SMS">SMS</option>
                          </select>
                          <button type="submit" className="btn btn-secondary reminder-submit-btn" disabled={reminderSubmitting}>
                            {reminderSubmitting ? '...' : (hindi ? 'रिमाइंडर सेट करें' : 'Set Retest Alert')}
                          </button>
                        </form>
                      )}
                      {reminderStatus[rec.registration]?.success === false && (
                        <div className="reminder-error-msg" role="alert">
                          ⚠️ {reminderStatus[rec.registration].message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="results-footer-row">
            <button type="button" onClick={resetForm} className="btn btn-secondary">
              🔄 {hindi ? 'अन्य वाहन की जाँच करें' : 'Check Another Vehicle'}
            </button>
            {stationPhone && (
              <a href={`tel:${stationPhone}`} className="contact-help-link">
                📞 {hindi ? 'मदद चाहिए? कॉल करें: ' : 'Need assistance? Call: '} {stationPhone}
              </a>
            )}
          </div>
        </div>
      )}

      <div className="checker-disclaimer">
        <p>
          ⚖️ {hindi
            ? 'सूचनात्मक अनुस्मारक मात्र। आधिकारिक सिलेंडर मार्किंग, पीतल की प्लेट, टेस्टिंग प्रमाणपत्र एवं लागू गैस सिलेंडर नियम 2016 अंतिम वैधता निर्धारित करते हैं।'
            : 'Informational reminder only. Official cylinder collar markings, stamped brass plate, test certificate, and Gas Cylinders Rules 2016 govern final legal validity.'}
        </p>
      </div>
    </div>
  );
}
