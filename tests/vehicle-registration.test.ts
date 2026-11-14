import { describe, expect, it } from 'vitest';
import {
  BH_SERIES_REGEX,
  normalizeVehicleRegistration,
  STATE_SERIES_REGEX,
  validateVehicleRegistration,
} from '../src/lib/vehicle-registration';

describe('vehicle registration module', () => {
  describe('normalizeVehicleRegistration', () => {
    it('converts lowercase characters to uppercase', () => {
      expect(normalizeVehicleRegistration('dl01ab1234')).toBe('DL01AB1234');
      expect(normalizeVehicleRegistration('22bh1234aa')).toBe('22BH1234AA');
      expect(normalizeVehicleRegistration('hr26dq5551')).toBe('HR26DQ5551');
    });

    it('strips whitespace (spaces, tabs, newlines)', () => {
      expect(normalizeVehicleRegistration('  dl 01 ab 1234  ')).toBe('DL01AB1234');
      expect(normalizeVehicleRegistration('\tdl\t01\nab\t1234\n')).toBe('DL01AB1234');
      expect(normalizeVehicleRegistration(' 22   bh   1234   aa ')).toBe('22BH1234AA');
    });

    it('strips hyphens and dashes', () => {
      expect(normalizeVehicleRegistration('DL-01-AB-1234')).toBe('DL01AB1234');
      expect(normalizeVehicleRegistration('HR-26-DQ-5551')).toBe('HR26DQ5551');
      expect(normalizeVehicleRegistration('22-BH-1234-AA')).toBe('22BH1234AA');
      expect(normalizeVehicleRegistration('--dl--01--ab--1234--')).toBe('DL01AB1234');
    });

    it('strips punctuation and non-alphanumeric characters', () => {
      expect(normalizeVehicleRegistration('DL.01/AB:1234')).toBe('DL01AB1234');
      expect(normalizeVehicleRegistration('DL@01#AB$1234%')).toBe('DL01AB1234');
      expect(normalizeVehicleRegistration('22/BH/1234/AA')).toBe('22BH1234AA');
    });

    it('handles edge cases (empty, whitespace, hyphens, null/undefined)', () => {
      expect(normalizeVehicleRegistration('')).toBe('');
      expect(normalizeVehicleRegistration('   ')).toBe('');
      expect(normalizeVehicleRegistration('---')).toBe('');
      expect(normalizeVehicleRegistration('@#$')).toBe('');
      expect(normalizeVehicleRegistration(null as unknown as string)).toBe('');
      expect(normalizeVehicleRegistration(undefined as unknown as string)).toBe('');
    });
  });

  describe('validateVehicleRegistration — State Series', () => {
    const validStateExamples = [
      { input: 'DL01AB1234', state: 'Delhi' },
      { input: 'DL1A1234', state: 'Delhi 1-digit RTO' },
      { input: 'DL01CAA1234', state: 'Delhi 3-letter series' },
      { input: 'DL011234', state: 'Delhi 0-letter series' },
      { input: 'DL11234', state: 'Delhi 1-digit RTO 0-letter series' },
      { input: 'HR26DQ5551', state: 'Haryana Gurgaon' },
      { input: 'HR51AA9999', state: 'Haryana Faridabad max number' },
      { input: 'UP14A1234', state: 'Uttar Pradesh Ghaziabad 1-letter series' },
      { input: 'UP16CD0001', state: 'Uttar Pradesh Noida min number' },
      { input: 'MH021234', state: 'Maharashtra Mumbai 0-letter series' },
      { input: 'MH12AB0123', state: 'Maharashtra Pune' },
      { input: 'MH1AA1234', state: 'Maharashtra 1-digit RTO' },
      { input: 'KA01MJ4321', state: 'Karnataka Bangalore' },
      { input: 'GJ010001', state: 'Gujarat Ahmedabad 0-letter series with leading zeroes' },
      { input: 'RJ149999', state: 'Rajasthan Jaipur' },
      { input: 'PB02AA1111', state: 'Punjab Amritsar' },
      { input: 'TN01AB1234', state: 'Tamil Nadu Chennai' },
      { input: 'KL07AB1234', state: 'Kerala Ernakulam' },
      { input: 'WB01AB1234', state: 'West Bengal Kolkata' },
      { input: 'BR01AB1234', state: 'Bihar Patna' },
      { input: 'TG01AB1234', state: 'Telangana' },
      { input: 'AP01AB1234', state: 'Andhra Pradesh' },
      { input: 'MP01AB1234', state: 'Madhya Pradesh' },
      { input: 'OD01AB1234', state: 'Odisha' },
      { input: 'AS01AB1234', state: 'Assam' },
      { input: 'CH01AB1234', state: 'Chandigarh' },
      { input: 'JK01AB1234', state: 'Jammu and Kashmir' },
      { input: 'LA01AB1234', state: 'Ladakh' },
    ];

    it.each(validStateExamples)('validates State Series registration: $input ($state)', ({ input }) => {
      const result = validateVehicleRegistration(input);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('STATE_SERIES');
      expect(result.normalized).toBe(input);
      expect(result.error).toBeUndefined();
    });

    it('supports 1-digit and 2-digit RTO codes', () => {
      expect(validateVehicleRegistration('DL1A1234')).toEqual({
        valid: true,
        normalized: 'DL1A1234',
        format: 'STATE_SERIES',
      });
      expect(validateVehicleRegistration('DL01AB1234')).toEqual({
        valid: true,
        normalized: 'DL01AB1234',
        format: 'STATE_SERIES',
      });
    });

    it('supports 0, 1, 2, and 3 series letters', () => {
      expect(validateVehicleRegistration('DL011234')).toEqual({
        valid: true,
        normalized: 'DL011234',
        format: 'STATE_SERIES',
      });
      expect(validateVehicleRegistration('DL01A1234')).toEqual({
        valid: true,
        normalized: 'DL01A1234',
        format: 'STATE_SERIES',
      });
      expect(validateVehicleRegistration('DL01AB1234')).toEqual({
        valid: true,
        normalized: 'DL01AB1234',
        format: 'STATE_SERIES',
      });
      expect(validateVehicleRegistration('DL01CAA1234')).toEqual({
        valid: true,
        normalized: 'DL01CAA1234',
        format: 'STATE_SERIES',
      });
    });

    it('supports zero-padded 4-digit numbers (0001 to 9999)', () => {
      expect(validateVehicleRegistration('GJ010001').valid).toBe(true);
      expect(validateVehicleRegistration('HR26A0010').valid).toBe(true);
      expect(validateVehicleRegistration('UP16AB0100').valid).toBe(true);
      expect(validateVehicleRegistration('RJ149999').valid).toBe(true);
    });
  });

  describe('validateVehicleRegistration — Bharat (BH) Series', () => {
    const validBhExamples = [
      { input: '21BH0001A', desc: 'Year 21, 1 series letter, min number' },
      { input: '22BH1234AA', desc: 'Year 22, 2 series letters' },
      { input: '23BH9999Z', desc: 'Year 23, 1 series letter, max number' },
      { input: '24BH5678AB', desc: 'Year 24, 2 series letters' },
      { input: '25BH1111A', desc: 'Year 25, 1 series letter' },
      { input: '26BH9999ZZ', desc: 'Year 26, 2 series letters, max letter code' },
      { input: '29BH0001A', desc: 'Year 29, future year' },
    ];

    it.each(validBhExamples)('validates Bharat Series registration: $input ($desc)', ({ input }) => {
      const result = validateVehicleRegistration(input);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('BH_SERIES');
      expect(result.normalized).toBe(input);
      expect(result.error).toBeUndefined();
    });

    it('supports 1 or 2 series alphabet letters at suffix', () => {
      const oneLetter = validateVehicleRegistration('22BH1234A');
      expect(oneLetter.valid).toBe(true);
      expect(oneLetter.format).toBe('BH_SERIES');

      const twoLetters = validateVehicleRegistration('22BH1234AA');
      expect(twoLetters.valid).toBe(true);
      expect(twoLetters.format).toBe('BH_SERIES');
    });
  });

  describe('validateVehicleRegistration — Normalization during Validation', () => {
    it('normalizes unformatted inputs with spaces, hyphens, and lowercase', () => {
      const resState = validateVehicleRegistration('  dl-01 ab 1234 ');
      expect(resState.valid).toBe(true);
      expect(resState.normalized).toBe('DL01AB1234');
      expect(resState.format).toBe('STATE_SERIES');

      const resBh = validateVehicleRegistration(' 22 bh 1234 aa ');
      expect(resBh.valid).toBe(true);
      expect(resBh.normalized).toBe('22BH1234AA');
      expect(resBh.format).toBe('BH_SERIES');

      const resHyphenated = validateVehicleRegistration('HR-26-DQ-5551');
      expect(resHyphenated.valid).toBe(true);
      expect(resHyphenated.normalized).toBe('HR26DQ5551');
      expect(resHyphenated.format).toBe('STATE_SERIES');

      const resPunctuation = validateVehicleRegistration('23/BH/9999/Z');
      expect(resPunctuation.valid).toBe(true);
      expect(resPunctuation.normalized).toBe('23BH9999Z');
      expect(resPunctuation.format).toBe('BH_SERIES');
    });
  });

  describe('validateVehicleRegistration — Invalid Registrations', () => {
    const invalidCases = [
      { input: 'CAR', reason: 'arbitrary word (too short)' },
      { input: 'HELLO', reason: 'arbitrary word' },
      { input: 'TEST1234', reason: 'word with digits' },
      { input: 'DL', reason: 'state code only' },
      { input: 'DL01', reason: 'state and RTO only' },
      { input: 'DL01A', reason: 'missing 4-digit number' },
      { input: '12345678', reason: 'digits only' },
      { input: 'DLAB1234', reason: 'missing RTO digits' },
      { input: '01AB1234', reason: 'missing state letters' },
      { input: 'DL01AB123', reason: 'only 3 digits in state series' },
      { input: 'DL01AB12345', reason: '5 digits in state series' },
      { input: 'DL01ABCD1234', reason: '4 series letters in state series' },
      { input: 'DL101AB1234', reason: '3 RTO digits in state series' },
      { input: '22CH1234AA', reason: 'non-BH series with year prefix' },
      { input: '2BH1234AA', reason: '1-digit year in BH series' },
      { input: '2022BH1234AA', reason: '4-digit year in BH series' },
      { input: '22BH123AA', reason: '3 digits in BH series' },
      { input: '22BH12345AA', reason: '5 digits in BH series' },
      { input: '22BH1234', reason: '0 series letters in BH series' },
      { input: '22BH1234AAA', reason: '3 series letters in BH series' },
    ];

    it.each(invalidCases)('rejects invalid registration: $input ($reason)', ({ input }) => {
      const result = validateVehicleRegistration(input);
      expect(result.valid).toBe(false);
      expect(result.format).toBeUndefined();
      expect(result.normalized).toBe(normalizeVehicleRegistration(input));
      expect(result.error).toBe(
        'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)'
      );
    });
  });

  describe('validateVehicleRegistration — Bilingual Error Messaging', () => {
    it('returns English required error for empty or whitespace inputs by default', () => {
      const emptyRes = validateVehicleRegistration('');
      expect(emptyRes.valid).toBe(false);
      expect(emptyRes.normalized).toBe('');
      expect(emptyRes.error).toBe('Vehicle registration number is required.');

      const whitespaceRes = validateVehicleRegistration('   ');
      expect(whitespaceRes.valid).toBe(false);
      expect(whitespaceRes.normalized).toBe('');
      expect(whitespaceRes.error).toBe('Vehicle registration number is required.');
    });

    it('returns English invalid error for malformed inputs by default or with locale="en"', () => {
      const defaultRes = validateVehicleRegistration('INVALID');
      expect(defaultRes.valid).toBe(false);
      expect(defaultRes.error).toBe(
        'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)'
      );

      const enRes = validateVehicleRegistration('INVALID', 'en');
      expect(enRes.valid).toBe(false);
      expect(enRes.error).toBe(
        'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)'
      );
    });

    it('returns Hindi required error for empty or whitespace inputs with locale="hi"', () => {
      const emptyRes = validateVehicleRegistration('', 'hi');
      expect(emptyRes.valid).toBe(false);
      expect(emptyRes.normalized).toBe('');
      expect(emptyRes.error).toBe('वाहन पंजीकरण संख्या आवश्यक है।');

      const whitespaceRes = validateVehicleRegistration('   ', 'hi');
      expect(whitespaceRes.valid).toBe(false);
      expect(whitespaceRes.normalized).toBe('');
      expect(whitespaceRes.error).toBe('वाहन पंजीकरण संख्या आवश्यक है।');
    });

    it('returns Hindi invalid error for malformed inputs with locale="hi"', () => {
      const hiRes = validateVehicleRegistration('INVALID', 'hi');
      expect(hiRes.valid).toBe(false);
      expect(hiRes.error).toBe(
        'कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)'
      );
    });
  });

  describe('validateVehicleRegistration — Edge Cases and Null Safety', () => {
    it('handles hyphens-only or symbols-only safely', () => {
      const hyphensRes = validateVehicleRegistration('---');
      expect(hyphensRes.valid).toBe(false);
      expect(hyphensRes.normalized).toBe('');
      expect(hyphensRes.error).toBe(
        'Please enter a valid Indian vehicle registration number (e.g., DL01AB1234 or 22BH1234AA)'
      );

      const symbolsRes = validateVehicleRegistration('!@#$%', 'hi');
      expect(symbolsRes.valid).toBe(false);
      expect(symbolsRes.normalized).toBe('');
      expect(symbolsRes.error).toBe(
        'कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें (उदा. DL01AB1234 या 22BH1234AA)'
      );
    });

    it('handles null and undefined safely without throwing', () => {
      const nullRes = validateVehicleRegistration(null as unknown as string);
      expect(nullRes.valid).toBe(false);
      expect(nullRes.normalized).toBe('');
      expect(nullRes.error).toBe('Vehicle registration number is required.');

      const undefRes = validateVehicleRegistration(undefined as unknown as string, 'hi');
      expect(undefRes.valid).toBe(false);
      expect(undefRes.normalized).toBe('');
      expect(undefRes.error).toBe('वाहन पंजीकरण संख्या आवश्यक है।');
    });
  });

  describe('exported regular expressions', () => {
    it('exports STATE_SERIES_REGEX matching standard state series', () => {
      expect(STATE_SERIES_REGEX).toBeInstanceOf(RegExp);
      expect(STATE_SERIES_REGEX.test('DL01AB1234')).toBe(true);
      expect(STATE_SERIES_REGEX.test('22BH1234AA')).toBe(false);
    });

    it('exports BH_SERIES_REGEX matching Bharat series', () => {
      expect(BH_SERIES_REGEX).toBeInstanceOf(RegExp);
      expect(BH_SERIES_REGEX.test('22BH1234AA')).toBe(true);
      expect(BH_SERIES_REGEX.test('DL01AB1234')).toBe(false);
    });
  });
});
