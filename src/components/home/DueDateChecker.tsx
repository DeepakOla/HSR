import React, { useState } from 'react';
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
  const [mode, setMode] = useState<'VEHICLE' | 'MOBILE'>('VEHICLE');
  const [vehicleInput, setVehicleInput] = useState<string>('');
  const [mobileInput, setMobileInput] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>('');
  const [showManualDateFallback, setShowManualDateFallback] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [results, setResults] = useState<DueDateRecord[] | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string>('');

  const handleLookup = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotFoundMsg('');
    setResults(null);

    const queryParams = new URLSearchParams({ locale });
    if (mode === 'VEHICLE') {
      const cleanReg = vehicleInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanReg.length < 5) {
        setError(hindi ? 'कृपया मान्य वाहन पंजीकरण संख्या दर्ज करें (उदा. HR26AB1234)।' : 'Please enter a valid vehicle registration number (e.g. HR26AB1234).');
        return;
      }
      queryParams.set('regNumber', cleanReg);
      if (manualDate) {
        queryParams.set('lastTestDate', manualDate);
      }
    } else {
      const cleanPhone = mobileInput.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        setError(hindi ? 'कृपया 10-अंकों का मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile phone number.');
        return;
      }
      queryParams.set('mobile', cleanPhone);
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/public/due-date-lookup/?${queryParams.toString()}`);
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'जाँच करने में त्रुटि' : 'Error checking status'));
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
      if (vehicleInput.trim()) {
        queryParams.set('regNumber', vehicleInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
      }

      const res = await fetch(`/api/public/due-date-lookup/?${queryParams.toString()}`);
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || (hindi ? 'तारीख गणना में त्रुटि' : 'Date calculation error'));
      }

      if (data.found && Array.isArray(data.records)) {
        setResults(data.records);
        setNotFoundMsg('');
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
    setVehicleInput('');
    setMobileInput('');
    setManualDate('');
  };

  return (
    <div className="due-date-checker-card">
      <div className="checker-header">
        <span className="metric-chip metric-cyan">
          🔍 {hindi ? 'ऑनलाइन वैधता जाँच' : 'Instant Validity Verification'}
        </span>
        <h2 className="checker-title">
          {hindi ? 'सीएनजी सिलेंडर रीटेस्ट ड्यू-डेट चेकर' : 'Check CNG Cylinder Retest Due Date'}
        </h2>
        <p className="checker-subtitle">
          {hindi
            ? 'अपने वाहन का नंबर दर्ज करें और तुरंत जानें कि आपकी सीएनजी सिलेंडर टेस्टिंग कब देय है तथा कितना समय शेष है।'
            : 'Enter your vehicle number to instantly verify cylinder testing status, next due date, and remaining time.'}
        </p>
      </div>

      {!results ? (
        <div className="checker-body">
          {/* Lookup Mode Toggle */}
          <div className="checker-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'VEHICLE'}
              className={`mode-tab ${mode === 'VEHICLE' ? 'active' : ''}`}
              onClick={() => {
                setMode('VEHICLE');
                setError('');
                setNotFoundMsg('');
              }}
            >
              🚗 {hindi ? 'वाहन नंबर द्वारा' : 'By Vehicle Registration'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'MOBILE'}
              className={`mode-tab ${mode === 'MOBILE' ? 'active' : ''}`}
              onClick={() => {
                setMode('MOBILE');
                setError('');
                setNotFoundMsg('');
              }}
            >
              📱 {hindi ? 'मोबाइल नंबर द्वारा (फ्लीट)' : 'By Mobile (Multi-Vehicle)'}
            </button>
          </div>

          <form onSubmit={handleLookup} className="checker-form">
            {mode === 'VEHICLE' ? (
              <div className="input-group">
                <label htmlFor="checker-vehicle-reg" className="input-label">
                  {hindi ? 'वाहन पंजीकरण संख्या' : 'Vehicle Registration Number'}
                </label>
                <div className="input-with-button">
                  <input
                    id="checker-vehicle-reg"
                    type="text"
                    required
                    placeholder="HR26DQ1234 / 22BH1234AA"
                    value={vehicleInput}
                    onChange={(e) => setVehicleInput(e.target.value.toUpperCase())}
                    className="checker-input font-mono-num"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn btn-primary checker-submit-btn" disabled={loading}>
                    {loading ? (hindi ? 'जाँच हो रही है...' : 'Checking...') : (hindi ? 'स्थिति जाँचें →' : 'Check Status →')}
                  </button>
                </div>
                <span className="input-hint">
                  {hindi ? 'राज्य श्रृंखला (उदा. HR26, DL01) या भारत श्रृंखला (BH) संख्या दर्ज करें।' : 'Supports State series (e.g. HR26, DL01) and Bharat (BH) series.'}
                </span>
              </div>
            ) : (
              <div className="input-group">
                <label htmlFor="checker-mobile" className="input-label">
                  {hindi ? '10-अंकों का मोबाइल नंबर' : '10-Digit Mobile Phone Number'}
                </label>
                <div className="input-with-button">
                  <input
                    id="checker-mobile"
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={mobileInput}
                    onChange={(e) => setMobileInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="checker-input font-mono-num"
                  />
                  <button type="submit" className="btn btn-primary checker-submit-btn" disabled={loading}>
                    {loading ? (hindi ? 'जाँच हो रही है...' : 'Checking...') : (hindi ? 'स्थिति जाँचें →' : 'Check Status →')}
                  </button>
                </div>
                <span className="input-hint">
                  {hindi ? 'इस नंबर से पंजीकृत सभी वाहनों की टेस्टिंग स्थिति एक साथ देखें।' : 'Lists all vehicles associated with this contact number.'}
                </span>
              </div>
            )}
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
