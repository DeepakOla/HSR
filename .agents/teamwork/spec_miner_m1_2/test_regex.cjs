const normalizeVehicleRegistration = (value) => {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const STATE_SERIES_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
const BH_SERIES_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

const ERROR_MESSAGES = {
  en: 'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)',
  hi: 'कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)',
};

function validateVehicleRegistration(value, locale = 'en') {
  const normalized = normalizeVehicleRegistration(value);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      error: ERROR_MESSAGES[locale] || ERROR_MESSAGES.en,
    };
  }

  if (BH_SERIES_REGEX.test(normalized)) {
    return {
      valid: true,
      normalized,
      format: 'BH_SERIES',
    };
  }

  if (STATE_SERIES_REGEX.test(normalized)) {
    return {
      valid: true,
      normalized,
      format: 'STATE_SERIES',
    };
  }

  return {
    valid: false,
    normalized,
    error: ERROR_MESSAGES[locale] || ERROR_MESSAGES.en,
  };
}

const testCases = [
  // Standard State Series
  { input: 'DL01AB1234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'dl-01 ab 1234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'HR26DQ5551', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'HR-26-DQ-5551', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'hr 26 dq 5551', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'UP14A1234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'up-14-a-1234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'MH021234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'mh 02 1234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'DL1A1234', expectedValid: true, expectedFormat: 'STATE_SERIES' }, // 1-digit RTO
  { input: 'DL11234', expectedValid: true, expectedFormat: 'STATE_SERIES' }, // 1-digit RTO, 0 series letters
  { input: 'DL01CAA1234', expectedValid: true, expectedFormat: 'STATE_SERIES' }, // 3 series letters
  { input: 'KA01C1234', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'GJ010001', expectedValid: true, expectedFormat: 'STATE_SERIES' },
  { input: 'RJ149999', expectedValid: true, expectedFormat: 'STATE_SERIES' },

  // Bharat Series
  { input: '22BH1234AA', expectedValid: true, expectedFormat: 'BH_SERIES' },
  { input: '22 bh 1234 aa', expectedValid: true, expectedFormat: 'BH_SERIES' },
  { input: '21BH0001A', expectedValid: true, expectedFormat: 'BH_SERIES' },
  { input: '23-BH-9999-Z', expectedValid: true, expectedFormat: 'BH_SERIES' },
  { input: '24 bh 5678 ab', expectedValid: true, expectedFormat: 'BH_SERIES' },
  { input: '21 bh 0001 a', expectedValid: true, expectedFormat: 'BH_SERIES' },

  // Invalid test cases
  { input: 'CAR', expectedValid: false },
  { input: 'HELLO', expectedValid: false },
  { input: 'TEST1234', expectedValid: false },
  { input: 'DL', expectedValid: false },
  { input: 'DL01', expectedValid: false },
  { input: 'DL01A', expectedValid: false },
  { input: '12345678', expectedValid: false },
  { input: 'DL01AB12345', expectedValid: false }, // 5-digit number
  { input: 'DL01ABCD1234', expectedValid: false }, // 4 letters in series
  { input: '22CH1234AA', expectedValid: false }, // not BH
  { input: '22BH123AA', expectedValid: false }, // 3 digits
  { input: '22BH12345AA', expectedValid: false }, // 5 digits
  { input: '22BH1234AAA', expectedValid: false }, // 3 letters
  { input: '2BH1234AA', expectedValid: false }, // 1 digit year
  { input: '2022BH1234AA', expectedValid: false }, // 4 digit year
  { input: '', expectedValid: false },
  { input: '   ', expectedValid: false },
  { input: '---', expectedValid: false },
  { input: 'DL01AB123@', expectedValid: false }, // non-alphanumeric trailing
  { input: '12AB1234', expectedValid: false }, // starts with number without BH
];

let failed = 0;
for (const tc of testCases) {
  const res = validateVehicleRegistration(tc.input);
  const passValid = res.valid === tc.expectedValid;
  const passFormat = tc.expectedValid ? res.format === tc.expectedFormat : true;
  if (!passValid || !passFormat) {
    console.error(`FAILED: "${tc.input}" -> expected valid=${tc.expectedValid}, got valid=${res.valid}, format=${res.format}`);
    failed++;
  } else {
    console.log(`PASS: "${tc.input}" -> normalized="${res.normalized}", valid=${res.valid}, format=${res.format || 'none'}`);
  }
}

// Test bilingual error messages
const resEn = validateVehicleRegistration('INVALID', 'en');
const resHi = validateVehicleRegistration('INVALID', 'hi');
console.log('EN Error:', resEn.error);
console.log('HI Error:', resHi.error);

if (failed === 0) {
  console.log('\nALL ' + testCases.length + ' TESTS PASSED!');
} else {
  console.log('\n' + failed + ' TESTS FAILED!');
  process.exit(1);
}
