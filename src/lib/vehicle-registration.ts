export type VehicleRegistrationFormat = 'STATE_SERIES' | 'BH_SERIES';

export interface VehicleRegistrationResult {
  valid: boolean;
  normalized: string;
  error?: string;
  format?: 'STATE_SERIES' | 'BH_SERIES';
}

export const STATE_SERIES_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
export const BH_SERIES_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

/**
 * Strips all whitespace, hyphens, and non-alphanumeric characters; converts to uppercase.
 * Example: "dl-01 ab 1234" -> "DL01AB1234", "22 bh 1234 aa" -> "22BH1234AA"
 */
export function normalizeVehicleRegistration(value: string): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Validates a vehicle registration number against Indian State/UT series and Bharat (BH) series.
 * Returns normalized value, validity status, format type, and localized error messages if invalid.
 */
export function validateVehicleRegistration(
  value: string,
  locale?: 'en' | 'hi'
): VehicleRegistrationResult {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error:
        locale === 'hi'
          ? 'वाहन पंजीकरण संख्या आवश्यक है।'
          : 'Vehicle registration number is required.',
    };
  }

  const normalized = normalizeVehicleRegistration(trimmed);

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
    error:
      locale === 'hi'
        ? 'कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)'
        : 'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)',
  };
}
