const { normalizeVehicleRegistration, validateVehicleRegistration } = (() => {
  const normalize = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
  const stateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
  const bhRegex = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
  const messages = {
    en: 'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)',
    hi: 'कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)',
  };

  const validate = (value, locale = 'en') => {
    const normalized = normalize(value);
    if (!normalized) {
      return { valid: false, normalized: '', error: messages[locale] || messages.en };
    }
    if (bhRegex.test(normalized)) {
      return { valid: true, normalized, format: 'BH_SERIES' };
    }
    if (stateRegex.test(normalized)) {
      return { valid: true, normalized, format: 'STATE_SERIES' };
    }
    return { valid: false, normalized, error: messages[locale] || messages.en };
  };

  return { normalizeVehicleRegistration: normalize, validateVehicleRegistration: validate };
})();

// Boundary analysis
const boundaries = [
  // 7 chars (Min length state series: 2 state + 1 RTO + 0 series + 4 digits)
  { input: 'DL11234', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 7 },
  { input: 'MH20001', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 7 },
  // 8 chars (2 state + 2 RTO + 0 series + 4 digits OR 2 state + 1 RTO + 1 series + 4 digits)
  { input: 'DL011234', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 8 },
  { input: 'DL1A1234', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 8 },
  // 9 chars (2 state + 2 RTO + 1 series + 4 digits OR 2 state + 1 RTO + 2 series + 4 digits OR BH 2+2+4+1)
  { input: 'DL01A1234', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 9 },
  { input: '21BH0001A', expectedValid: true, expectedFormat: 'BH_SERIES', len: 9 },
  // 10 chars (2 state + 2 RTO + 2 series + 4 digits OR BH 2+2+4+2)
  { input: 'DL01AB1234', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 10 },
  { input: 'HR26DQ5551', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 10 },
  { input: '22BH1234AA', expectedValid: true, expectedFormat: 'BH_SERIES', len: 10 },
  // 11 chars (Max length state series: 2 state + 2 RTO + 3 series + 4 digits)
  { input: 'DL01CAA1234', expectedValid: true, expectedFormat: 'STATE_SERIES', len: 11 },
  // Invalid lengths
  { input: 'DL1123', expectedValid: false, len: 6 }, // 6 chars (too short)
  { input: 'DL01ABCD1234', expectedValid: false, len: 12 }, // 12 chars (too long)
];

for (const b of boundaries) {
  const res = validateVehicleRegistration(b.input);
  if (res.valid !== b.expectedValid || (b.expectedValid && res.format !== b.expectedFormat)) {
    console.error(`Boundary FAILED: ${b.input}`, res);
    process.exit(1);
  }
}
console.log('ALL BOUNDARY TESTS PASSED!');
