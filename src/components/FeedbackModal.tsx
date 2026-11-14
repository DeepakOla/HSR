import React, { useState, useEffect } from 'react';

interface FeedbackModalProps {
  locale: 'en' | 'hi';
}

export function FeedbackModal({ locale }: FeedbackModalProps) {

  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState<'general' | 'bug' | 'ui_ux' | 'booking_flow'>('general');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isHi = locale === 'hi';

  useEffect(() => {
    const handleTrigger = (e: MouseEvent) => {
      e.preventDefault();
      setIsOpen(true);
    };

    const trigger = document.getElementById('open-feedback-btn');
    if (trigger) {
      trigger.addEventListener('click', handleTrigger);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (trigger) trigger.removeEventListener('click', handleTrigger);
    };
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (comment.trim().length < 3) {
      setErrorMessage(isHi ? 'कृपया कम से कम 3 अक्षर दर्ज करें।' : 'Please enter at least 3 characters.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/feedback/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          category,
          name: name.trim() || undefined,
          contact: contact.trim() || undefined,
          comment: comment.trim(),
          locale,
          url: window.location.href,
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };
      if (res.ok && data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(data.error || (isHi ? 'प्रतिक्रिया भेजने में विफल।' : 'Failed to submit feedback.'));
      }
    } catch {
      setStatus('error');
      setErrorMessage(isHi ? 'नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।' : 'Network error. Please try again.');
    }
  };

  const resetForm = () => {
    setRating(5);
    setCategory('general');
    setName('');
    setContact('');
    setComment('');
    setStatus('idle');
    setErrorMessage('');
  };

  return (
    <>
      {/* Floating Feedback pill on bottom right */}
      <button
        type="button"
        className="feedback-floating-btn"
        onClick={() => setIsOpen(true)}
        aria-label={isHi ? 'प्रतिक्रिया साझा करें' : 'Share Feedback'}
      >
        <span className="feedback-icon" aria-hidden="true">💬</span>
        <span className="feedback-btn-label">{isHi ? 'प्रतिक्रिया दें' : 'Give Feedback'}</span>
      </button>

      {isOpen && (
        <div className="feedback-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="feedback-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="feedback-modal-header">
              <h2 id="feedback-title" className="feedback-title">
                {isHi ? 'पूर्वावलोकन प्रतिक्रिया (Demo Feedback)' : 'Preview Experience Feedback'}
              </h2>
              <button
                type="button"
                className="feedback-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label={isHi ? 'बंद करें' : 'Close'}
              >
                &times;
              </button>
            </div>

            {status === 'success' ? (
              <div className="feedback-success-pane">
                <div className="success-icon-badge" aria-hidden="true">✓</div>
                <h3>{isHi ? 'धन्यवाद!' : 'Thank you!'}</h3>
                <p>
                  {isHi
                    ? 'आपकी प्रतिक्रिया सफलतापूर्वक प्राप्त हो गई है। हम परीक्षण अनुभव को बेहतर बनाने के लिए इस पर काम करेंगे।'
                    : 'Your feedback has been recorded. Thank you for testing the HSR platform with us!'}
                </p>
                <div className="success-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      resetForm();
                      setIsOpen(false);
                    }}
                  >
                    {isHi ? 'बंद करें' : 'Close'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={resetForm}
                  >
                    {isHi ? 'एक और प्रतिक्रिया दें' : 'Submit Another'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="feedback-form">
                <p className="feedback-desc">
                  {isHi
                    ? 'यह HSR का प्रारंभिक पूर्वावलोकन संस्करण (v0.0.1) है। कृपया अपने सुझाव, कोई त्रुटि (बग) या अनुभव हमारे साथ साझा करें।'
                    : 'You are testing HSR preview v0.0.1. Please let us know if you encountered any bugs, confusing steps, or ideas for improvement.'}
                </p>

                {/* Star rating */}
                <div className="form-group">
                  <label className="form-label">{isHi ? 'आपका समग्र अनुभव:' : 'Your Overall Experience:'}</label>
                  <div className="star-rating-row" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className={`star-btn ${rating >= val ? 'active' : ''}`}
                        onClick={() => setRating(val)}
                        aria-label={`${val} ${val === 1 ? 'star' : 'stars'}`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="rating-text">
                      {rating === 5 ? (isHi ? 'उत्कृष्ट (5/5)' : 'Excellent (5/5)') :
                       rating === 4 ? (isHi ? 'अच्छा (4/5)' : 'Good (4/5)') :
                       rating === 3 ? (isHi ? 'ठीक (3/5)' : 'Fair (3/5)') :
                       rating === 2 ? (isHi ? 'सुधार चाहिए (2/5)' : 'Needs Work (2/5)') :
                                      (isHi ? 'कठिन (1/5)' : 'Poor (1/5)')}
                    </span>
                  </div>
                </div>

                {/* Category Pills */}
                <div className="form-group">
                  <label className="form-label">{isHi ? 'श्रेणी चुनें:' : 'Feedback Category:'}</label>
                  <div className="category-pills">
                    {[
                      { key: 'general', en: 'General', hi: 'सामान्य' },
                      { key: 'bug', en: 'Bug / Issue', hi: 'बग / त्रुटि' },
                      { key: 'ui_ux', en: 'UI / Design', hi: 'डिज़ाइन' },
                      { key: 'booking_flow', en: 'Booking Flow', hi: 'बुकिंग प्रक्रिया' },
                    ].map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={`pill-btn ${category === c.key ? 'selected' : ''}`}
                        onClick={() => setCategory(c.key as any)}
                      >
                        {isHi ? c.hi : c.en}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comment box */}
                <div className="form-group">
                  <label htmlFor="feedback-comment" className="form-label">
                    {isHi ? 'विस्तार से बताएं (अनिवार्य):' : 'Details / Comments (Required):'}
                  </label>
                  <textarea
                    id="feedback-comment"
                    className="form-textarea"
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={
                      isHi
                        ? 'उदा. मुझे स्लॉट चुनना आसान लगा, लेकिन कार मॉडल का नाम दिखना चाहिए...'
                        : 'e.g., Slot booking was fast and smooth, but truck category cylinder selection could be clearer...'
                    }
                    required
                  />
                </div>

                {/* Name & Contact (optional) */}
                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="feedback-name" className="form-label">
                      {isHi ? 'आपका नाम (वैकल्पिक):' : 'Your Name (Optional):'}
                    </label>
                    <input
                      id="feedback-name"
                      type="text"
                      className="form-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isHi ? 'उदा. राहुल' : 'e.g. Rahul'}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="feedback-contact" className="form-label">
                      {isHi ? 'फोन या ईमेल (वैकल्पिक):' : 'Phone or Email (Optional):'}
                    </label>
                    <input
                      id="feedback-contact"
                      type="text"
                      className="form-input"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder={isHi ? '9876543210' : '9876543210'}
                    />
                  </div>
                </div>

                {errorMessage && (
                  <div className="form-error-banner" role="alert">
                    {errorMessage}
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsOpen(false)}
                    disabled={status === 'submitting'}
                  >
                    {isHi ? 'रद्द करें' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={status === 'submitting'}
                  >
                    {status === 'submitting'
                      ? (isHi ? 'भेजा जा रहा है...' : 'Sending...')
                      : (isHi ? 'प्रतिक्रिया सबमिट करें' : 'Submit Feedback')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default FeedbackModal;
