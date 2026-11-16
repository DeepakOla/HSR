import React, { useState, useEffect } from 'react';
import RetestDueModal from './RetestDueModal';
import type { Locale } from '../../lib/constants';

interface RetestDueLauncherProps {
  locale: Locale;
  className?: string;
  style?: React.CSSProperties;
  buttonText?: string;
  bookUrl?: string;
}

export default function RetestDueLauncher({
  locale,
  className,
  style,
  buttonText,
  bookUrl = '#booking-section',
}: RetestDueLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hindi = locale === 'hi';
  const defaultText = buttonText || (hindi ? '3-वर्षीय रीटेस्ट तारीख जाँचें' : 'Check 3-Year Retest Due Date');

  useEffect(() => {
    // If URL has ?action=check-due-date, auto open modal
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'check-due-date') {
        setIsOpen(true);
      }
    }
  }, []);

  return (
    <>
      <button
        type="button"
        id="check-due-date-btn"
        onClick={() => setIsOpen(true)}
        className={className}
        style={
          style || {
            background: 'rgba(255, 255, 255, 0.12)',
            border: '1.5px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.95rem',
            padding: '0.85rem 1.75rem',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
          }
        }
      >
        <span>📅</span> {defaultText}
      </button>

      <RetestDueModal
        locale={locale}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        bookUrl={bookUrl}
      />
    </>
  );
}
