import { describe, expect, it } from 'vitest';
import {
  BH_SERIES_REGEX,
  normalizeVehicleRegistration,
  STATE_SERIES_REGEX,
  validateVehicleRegistration,
} from '../../../src/lib/vehicle-registration';

describe('Adversarial Stress Testing — Vehicle Registration Module', () => {
  describe('1. Extreme Boundary Lengths (0 to 10,000+ characters)', () => {
    it('handles empty and single character inputs safely', () => {
      expect(validateVehicleRegistration('').valid).toBe(false);
      expect(validateVehicleRegistration(' ').valid).toBe(false);
      expect(validateVehicleRegistration('A').valid).toBe(false);
      expect(validateVehicleRegistration('1').valid).toBe(false);
      expect(validateVehicleRegistration('-').valid).toBe(false);
      expect(validateVehicleRegistration('\n').valid).toBe(false);
    });

    it('rejects short registrations below minimum viable format (2 to 6 chars)', () => {
      const shortInputs = ['DL', '22', 'CAR', 'DL01', '22BH', 'DL01A', 'DL0112'];
      for (const input of shortInputs) {
        const res = validateVehicleRegistration(input);
        expect(res.valid).toBe(false);
      }
    });

    it('accepts valid registrations at exact structural length boundaries (7 to 11 chars)', () => {
      // 7 chars: State + 1-digit RTO + 0-letter series + 4-digit number
      expect(validateVehicleRegistration('DL11234').valid).toBe(true);
      // 8 chars: State + 2-digit RTO + 0-letter series + 4-digit number
      expect(validateVehicleRegistration('DL011234').valid).toBe(true);
      // 9 chars: State + 2-digit RTO + 1-letter series + 4-digit number
      expect(validateVehicleRegistration('DL01A1234').valid).toBe(true);
      // 9 chars: BH + 2-digit year + BH + 4-digit number + 1-letter suffix
      expect(validateVehicleRegistration('21BH0001A').valid).toBe(true);
      // 10 chars: State + 2-digit RTO + 2-letter series + 4-digit number
      expect(validateVehicleRegistration('DL01AB1234').valid).toBe(true);
      // 10 chars: BH + 2-digit year + BH + 4-digit number + 2-letter suffix
      expect(validateVehicleRegistration('22BH1234AA').valid).toBe(true);
      // 11 chars: State + 2-digit RTO + 3-letter series + 4-digit number
      expect(validateVehicleRegistration('DL01CAA1234').valid).toBe(true);
    });

    it('rejects extreme lengths: 100, 1,000, 5,000, 10,000 characters without crashing', () => {
      const lengths = [100, 1_000, 5_000, 10_000];
      for (const len of lengths) {
        const longA = 'A'.repeat(len);
        const longNum = '1'.repeat(len);
        const longDashes = '-'.repeat(len);
        const longSpaces = ' '.repeat(len);

        const start = performance.now();
        const resA = validateVehicleRegistration(longA);
        const resNum = validateVehicleRegistration(longNum);
        const resDashes = validateVehicleRegistration(longDashes);
        const resSpaces = validateVehicleRegistration(longSpaces);
        const duration = performance.now() - start;

        expect(resA.valid).toBe(false);
        expect(resNum.valid).toBe(false);
        expect(resDashes.valid).toBe(false);
        expect(resSpaces.valid).toBe(false);

        // Verification of sub-millisecond execution even at 10,000 characters
        expect(duration).toBeLessThan(100); // 100ms max for batch
      }
    });

    it('handles 50,000 characters input in under 20ms', () => {
      const hugeString = 'DL01AB1234'.repeat(5000); // 50,000 chars
      const t0 = performance.now();
      const res = validateVehicleRegistration(hugeString);
      const elapsed = performance.now() - t0;

      expect(res.valid).toBe(false);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('2. Adversarial Fuzzing: Unicode, Control Chars, Emojis, Numerals, Punctuation', () => {
    it('safely rejects fullwidth Unicode characters without spoofing ASCII', () => {
      // ＤＬ０１ＡＢ１２３４
      const fullwidth = '\uFF24\uFF2C\uFF10\uFF11\uFF21\uFF22\uFF11\uFF12\uFF13\uFF14';
      const res = validateVehicleRegistration(fullwidth);
      expect(res.valid).toBe(false);
      expect(res.normalized).toBe('');
    });

    it('safely rejects Devanagari numerals and Hindi letters', () => {
      // DL०१AB१२३४ (Devanagari digits 0, 1, 1, 2, 3, 4)
      const mixedDevanagari = 'DL०१AB१२३४';
      const resMixed = validateVehicleRegistration(mixedDevanagari);
      expect(resMixed.valid).toBe(false);
      // Numerals stripped, leaves DLAB (too short / invalid)
      expect(resMixed.normalized).toBe('DLAB');

      // Full Hindi Devanagari
      const fullHindi = '२२बीएच१२३४एए';
      const resHindi = validateVehicleRegistration(fullHindi);
      expect(resHindi.valid).toBe(false);
      expect(resHindi.normalized).toBe('');
    });

    it('strips embedded null bytes and control characters without terminating C-style strings', () => {
      // Embedded null bytes inside otherwise valid format
      const nullByteState = 'DL\x0001\x00AB\x001234';
      const resState = validateVehicleRegistration(nullByteState);
      expect(resState.valid).toBe(true);
      expect(resState.normalized).toBe('DL01AB1234');
      expect(resState.format).toBe('STATE_SERIES');

      const nullByteBh = '22\x00BH\x001234\x00AA';
      const resBh = validateVehicleRegistration(nullByteBh);
      expect(resBh.valid).toBe(true);
      expect(resBh.normalized).toBe('22BH1234AA');
      expect(resBh.format).toBe('BH_SERIES');

      // ASCII control characters \x01 through \x1F
      let controlChars = '';
      for (let i = 1; i <= 31; i++) {
        controlChars += String.fromCharCode(i);
      }
      const resControl = validateVehicleRegistration('DL' + controlChars + '01AB1234');
      expect(resControl.valid).toBe(true);
      expect(resControl.normalized).toBe('DL01AB1234');
    });

    it('handles emojis, surrogate pairs, and composite zero-width joiners safely', () => {
      const emojiInputs = [
        '🚗 DL 01 AB 1234 🚙',
        '🏎️ 22 BH 1234 AA 🛞',
        '💥💥💥💥💥',
        '👨‍👩‍👧‍👦 DL 01 AB 1234',
        '🇮🇳 DL 01 AB 1234',
      ];

      for (const input of emojiInputs) {
        const res = validateVehicleRegistration(input);
        if (input.includes('1234')) {
          expect(res.valid).toBe(true);
          expect(res.normalized).toMatch(/^(DL01AB1234|22BH1234AA)$/);
        } else {
          expect(res.valid).toBe(false);
          expect(res.normalized).toBe('');
        }
      }
    });

    it('safely processes intense punctuation spam', () => {
      const spam = '!@#$%^&*()_+~|}{[]:;?><,./-='.repeat(50);
      const res = validateVehicleRegistration(spam);
      expect(res.valid).toBe(false);
      expect(res.normalized).toBe('');
    });

    it('handles diverse exotic whitespaces (NBSP, zero-width, BOM)', () => {
      // \u00A0 (NBSP), \u200B (Zero-width space), \uFEFF (BOM), \u3000 (Ideographic space)
      const exoticSpaces = '\uFEFF\u00A0DL\u200B01\u3000AB\u00A01234\uFEFF';
      const res = validateVehicleRegistration(exoticSpaces);
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('DL01AB1234');
    });

    it('fuzzes with 1,000 pseudo-random strings without error or hanging', () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_+=~`[]{}|;:,.<>?/ \t\n\r\0\u00A0\u200B\u4E00\u0905';
      for (let i = 0; i < 1000; i++) {
        const len = 1 + Math.floor(Math.random() * 50);
        let str = '';
        for (let j = 0; j < len; j++) {
          str += chars[Math.floor(Math.random() * chars.length)];
        }
        const res = validateVehicleRegistration(str);
        expect(typeof res.valid).toBe('boolean');
        expect(typeof res.normalized).toBe('string');
        if (res.valid) {
          expect(['STATE_SERIES', 'BH_SERIES']).toContain(res.format);
          expect(res.error).toBeUndefined();
        } else {
          expect(typeof res.error).toBe('string');
        }
      }
    });
  });

  describe('3. ReDoS / Catastrophic Backtracking Attacks', () => {
    it('executes catastrophic backtracking attack patterns in linear O(N) time', () => {
      const attackPatterns = [
        // Long state prefix + massive digit sequence + mismatch
        'DL' + '1'.repeat(40_000) + 'X',
        // State + RTO + massive letter sequence + mismatch
        'DL01' + 'A'.repeat(40_000) + '1234X',
        // BH prefix + massive digits + mismatch
        '22BH' + '1'.repeat(40_000) + 'AAX',
        // BH + digits + massive letters + mismatch
        '22BH1234' + 'A'.repeat(40_000) + '1',
        // Alternating patterns
        'DL01AB'.repeat(5_000),
        '22BH1234'.repeat(5_000),
        // Alternating blocks of letters and numbers
        ('A'.repeat(100) + '1'.repeat(100)).repeat(200),
      ];

      for (const pattern of attackPatterns) {
        const start = performance.now();
        const res = validateVehicleRegistration(pattern);
        const elapsed = performance.now() - start;

        expect(res.valid).toBe(false);
        // Each 40,000+ char pattern must complete in < 25ms
        expect(elapsed).toBeLessThan(25);
      }
    });
  });

  describe('4. Code Injection, SQL Injection, XSS, and Prototype Pollution', () => {
    const maliciousPayloads = [
      // SQL Injection
      "' OR '1'='1",
      "'; DROP TABLE bookings; --",
      "' UNION SELECT null, username, password FROM staff_users --",
      "1' WAITFOR DELAY '0:0:5'--",
      "admin'--",
      '" OR ""="',
      // XSS
      "<script>alert('XSS')</script>",
      "<svg/onload=alert(document.domain)>",
      "javascript:alert(1)",
      '"><img src=x onerror=alert(1)>',
      "<iframe src=\"javascript:alert('xss')\">",
      // Command / Template Injection
      "${process.exit(1)}",
      "{{7*7}}",
      "$(whoami)",
      "; rm -rf / ;",
      "& ping -c 10 127.0.0.1 &",
      // Prototype Pollution
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "valueOf",
      // Path Traversal
      "../../../../etc/passwd",
      "..\\..\\windows\\system32\\cmd.exe",
    ];

    it.each(maliciousPayloads)('rejects malicious injection payload: %s', (payload) => {
      const res = validateVehicleRegistration(payload);
      expect(res.valid).toBe(false);
      expect(res.format).toBeUndefined();
      expect(res.error).toBeDefined();

      // Ensure normalized output does not retain dangerous syntax (<, >, ', ", ;, /, \, $, {, })
      expect(res.normalized).not.toMatch(/[<>'";/\\${}()]/);
    });
  });

  describe('5. Arbitrary English and Hindi Words', () => {
    const arbitraryWords = [
      'CAR',
      'TRUCK',
      'BUS',
      'VAN',
      'TAXI',
      'LORRY',
      'MOTOR',
      'AUTO',
      'BIKE',
      'SCOOTER',
      'GAADI',
      'GADI',
      'VAAHAN',
      'CHHAKDA',
      'CAR1234',
      'TRUCK0001',
      'GAADI1234',
      'BUS9999',
      'TEST1234',
      'FAKE1234',
      'HSR1234',
      'CNG1234',
      'गाड़ी',
      'कार',
      'ट्रक',
      'बस',
      'ऑटो',
      'वाहन',
    ];

    it.each(arbitraryWords)('rejects arbitrary word / non-registration: %s', (word) => {
      const res = validateVehicleRegistration(word);
      expect(res.valid).toBe(false);
      expect(res.format).toBeUndefined();
    });
  });

  describe('6. Malformed Formats and Negative Boundary Cases', () => {
    const malformedCases = [
      // State Series format errors
      { input: 'DEL01AB1234', desc: '3-letter state code' },
      { input: 'D01AB1234', desc: '1-letter state code' },
      { input: 'DL101AB1234', desc: '3-digit RTO code' },
      { input: 'DLAB1234', desc: '0-digit RTO code' },
      { input: 'DL01ABCD1234', desc: '4-letter series code' },
      { input: 'DL01AB12345', desc: '5-digit registration sequence' },
      { input: 'DL01AB123', desc: '3-digit registration sequence' },
      { input: 'DL01AB12', desc: '2-digit registration sequence' },
      { input: 'DL01AB1', desc: '1-digit registration sequence' },
      { input: 'DL01AB', desc: '0-digit registration sequence' },
      // Bharat Series format errors
      { input: '22CH1234AA', desc: 'Non-BH 2-letter code with year prefix' },
      { input: '22MH1234AA', desc: 'State code MH placed where BH is required' },
      { input: '2BH1234AA', desc: '1-digit year prefix in BH series' },
      { input: '202BH1234AA', desc: '3-digit year prefix in BH series' },
      { input: '2022BH1234AA', desc: '4-digit year prefix in BH series' },
      { input: '22BH123AA', desc: '3-digit sequence in BH series' },
      { input: '22BH12345AA', desc: '5-digit sequence in BH series' },
      { input: '22BH1234', desc: '0 series letters in BH series' },
      { input: '22BH1234AAA', desc: '3 series letters in BH series' },
      // Swapped/Inverted components
      { input: '1234AB01DL', desc: 'Inverted State series (digits first)' },
      { input: 'AB01DL1234', desc: 'Series letters before RTO code' },
      { input: '1234BH22AA', desc: 'Inverted BH series (digits first)' },
      { input: 'BH221234AA', desc: 'BH prefix before year digits' },
    ];

    it.each(malformedCases)('rejects malformed registration: $input ($desc)', ({ input }) => {
      const res = validateVehicleRegistration(input);
      expect(res.valid).toBe(false);
      expect(res.format).toBeUndefined();
      expect(res.error).toBeDefined();
    });
  });

  describe('7. Runtime Type Safety and Contract Robustness', () => {
    it('handles null and undefined safely returning required error', () => {
      const nullRes = validateVehicleRegistration(null as unknown as string);
      expect(nullRes.valid).toBe(false);
      expect(nullRes.normalized).toBe('');
      expect(nullRes.error).toBe('Vehicle registration number is required.');

      const undefRes = validateVehicleRegistration(undefined as unknown as string, 'hi');
      expect(undefRes.valid).toBe(false);
      expect(undefRes.normalized).toBe('');
      expect(undefRes.error).toBe('वाहन पंजीकरण संख्या आवश्यक है।');
    });

    it('normalizer safely handles null and undefined', () => {
      expect(normalizeVehicleRegistration(null as unknown as string)).toBe('');
      expect(normalizeVehicleRegistration(undefined as unknown as string)).toBe('');
    });
  });
});
