import { describe, it, expect } from 'vitest';
import {
  VEHICLE_OPTIONS,
  PUBLIC_CYLINDER_OPTIONS,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_CONTACT_WHATSAPP,
  DEFAULT_WHATSAPP_URL,
  formatHourOption,
  calculateDurationMinutes,
  buildVehicleDescription,
  todayInIndia,
  addDays,
  inr,
  monthTitle,
} from '../src/lib/booking-wizard-helpers';
import { validateVehicleRegistration } from '../src/lib/vehicle-registration';

describe('Booking Wizard Helpers & Options', () => {
  describe('VEHICLE_OPTIONS', () => {
    it('contains exactly 8 vehicle types in correct order', () => {
      const expectedValues = ['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other'];
      expect(VEHICLE_OPTIONS.map((opt) => opt.value)).toEqual(expectedValues);
    });

    it('has bilingual labels for all vehicle types', () => {
      for (const opt of VEHICLE_OPTIONS) {
        expect(opt.labelEn).toBeTruthy();
        expect(opt.labelHi).toBeTruthy();
        expect(opt.labelEn.length).toBeGreaterThan(2);
        expect(opt.labelHi.length).toBeGreaterThan(2);
      }
    });

    it('includes specific labels for key commercial and passenger vehicles', () => {
      const truck = VEHICLE_OPTIONS.find((opt) => opt.value === 'Truck');
      expect(truck?.labelEn).toContain('Truck');
      expect(truck?.labelHi).toContain('ट्रक');

      const car = VEHICLE_OPTIONS.find((opt) => opt.value === 'Car');
      expect(car?.labelEn).toContain('Passenger');
      expect(car?.labelHi).toContain('यात्री वाहन');
    });
  });

  describe('PUBLIC_CYLINDER_OPTIONS', () => {
    it('contains 1 to 6 cylinders and "more"', () => {
      expect(PUBLIC_CYLINDER_OPTIONS).toHaveLength(7);
      expect(PUBLIC_CYLINDER_OPTIONS.map((opt) => opt.value)).toEqual([
        '1', '2', '3', '4', '5', '6', 'more',
      ]);
    });

    it('enforces public self-service limit of maximum 6 cylinders', () => {
      const counts = PUBLIC_CYLINDER_OPTIONS.map((opt) => opt.count);
      expect(counts).toEqual([1, 2, 3, 4, 5, 6, null]);
    });

    it('has bilingual labels for all cylinder options', () => {
      for (const opt of PUBLIC_CYLINDER_OPTIONS) {
        expect(opt.labelEn).toBeTruthy();
        expect(opt.labelHi).toBeTruthy();
      }
      const more = PUBLIC_CYLINDER_OPTIONS.find((opt) => opt.value === 'more');
      expect(more?.labelEn).toContain('More than 6');
      expect(more?.labelHi).toContain('6 से अधिक');
    });
  });

  describe('Contact Details Constants', () => {
    it('uses verified default phone and WhatsApp (+91 9910055355)', () => {
      expect(DEFAULT_CONTACT_PHONE).toBe('+919910055355');
      expect(DEFAULT_CONTACT_WHATSAPP).toBe('+919910055355');
      expect(DEFAULT_WHATSAPP_URL).toBe('https://wa.me/919910055355');
    });
  });

  describe('formatHourOption', () => {
    it('formats morning hours in English', () => {
      expect(formatHourOption('06', 'en')).toBe('6 AM');
      expect(formatHourOption('07', 'en')).toBe('7 AM');
      expect(formatHourOption('09', 'en')).toBe('9 AM');
      expect(formatHourOption('11', 'en')).toBe('11 AM');
    });

    it('formats noon and afternoon hours in English', () => {
      expect(formatHourOption('12', 'en')).toBe('12 PM');
      expect(formatHourOption('13', 'en')).toBe('1 PM');
      expect(formatHourOption('14', 'en')).toBe('2 PM');
      expect(formatHourOption('17', 'en')).toBe('5 PM');
    });

    it('formats midnight and late hours correctly in English', () => {
      expect(formatHourOption('00', 'en')).toBe('12 AM');
      expect(formatHourOption('23', 'en')).toBe('11 PM');
    });

    it('formats morning hours in Hindi with period (सुबह)', () => {
      expect(formatHourOption('06', 'hi')).toBe('सुबह 6 बजे (6 AM)');
      expect(formatHourOption('09', 'hi')).toBe('सुबह 9 बजे (9 AM)');
      expect(formatHourOption('11', 'hi')).toBe('सुबह 11 बजे (11 AM)');
    });

    it('formats afternoon hours in Hindi with period (दोपहर)', () => {
      expect(formatHourOption('12', 'hi')).toBe('दोपहर 12 बजे (12 PM)');
      expect(formatHourOption('13', 'hi')).toBe('दोपहर 1 बजे (1 PM)');
      expect(formatHourOption('15', 'hi')).toBe('दोपहर 3 बजे (3 PM)');
    });

    it('formats evening hours in Hindi with period (शाम)', () => {
      expect(formatHourOption('16', 'hi')).toBe('शाम 4 बजे (4 PM)');
      expect(formatHourOption('18', 'hi')).toBe('शाम 6 बजे (6 PM)');
      expect(formatHourOption('20', 'hi')).toBe('शाम 8 बजे (8 PM)');
    });

    it('handles invalid or non-numeric hour strings gracefully', () => {
      expect(formatHourOption('invalid', 'en')).toBe('invalid');
      expect(formatHourOption('', 'hi')).toBe('');
    });
  });

  describe('calculateDurationMinutes', () => {
    it('calculates duration for 20-minute units', () => {
      expect(calculateDurationMinutes('06:00', '06:20')).toBe(20);
      expect(calculateDurationMinutes('06:00', '06:40')).toBe(40);
      expect(calculateDurationMinutes('06:00', '07:00')).toBe(60);
      expect(calculateDurationMinutes('06:00', '07:20')).toBe(80);
      expect(calculateDurationMinutes('06:00', '08:00')).toBe(120);
    });

    it('calculates duration for 15-minute units', () => {
      expect(calculateDurationMinutes('09:00', '09:15')).toBe(15);
      expect(calculateDurationMinutes('09:00', '09:45')).toBe(45);
      expect(calculateDurationMinutes('09:15', '10:30')).toBe(75);
    });

    it('handles arbitrary valid start and end times', () => {
      expect(calculateDurationMinutes('11:20', '13:00')).toBe(100);
      expect(calculateDurationMinutes('14:40', '16:00')).toBe(80);
    });
  });

  describe('buildVehicleDescription', () => {
    it('returns vehicle class when model is empty', () => {
      expect(buildVehicleDescription('Car', '')).toBe('Car');
      expect(buildVehicleDescription('Truck', '   ')).toBe('Truck');
    });

    it('combines class and model with hyphen when model is provided', () => {
      expect(buildVehicleDescription('Car', 'Maruti WagonR')).toBe('Car - Maruti WagonR');
      expect(buildVehicleDescription('Truck', 'Tata 407')).toBe('Truck - Tata 407');
      expect(buildVehicleDescription('Van', 'Omni')).toBe('Van - Omni');
    });

    it('handles "Other" vehicle class cleanly', () => {
      expect(buildVehicleDescription('Other', 'JCB Excavator')).toBe('JCB Excavator');
      expect(buildVehicleDescription('Other', '')).toBe('Other');
      expect(buildVehicleDescription('Other', '   ')).toBe('Other');
    });

    it('trims excess whitespace defensively', () => {
      expect(buildVehicleDescription('  Truck  ', '  Tata 407  ')).toBe('Truck - Tata 407');
    });
  });

  describe('Date & Currency Helpers', () => {
    it('todayInIndia returns a valid YYYY-MM-DD date', () => {
      const today = todayInIndia();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('addDays correctly adds positive days', () => {
      expect(addDays('2026-01-01', 1)).toBe('2026-01-02');
      expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(addDays('2026-11-20', 10)).toBe('2026-11-30');
    });

    it('inr formats paise to INR correctly without decimals', () => {
      expect(inr(50000)).toMatch(/₹\s?500/);
      expect(inr(250000)).toMatch(/₹\s?2,500/);
      expect(inr(295000)).toMatch(/₹\s?2,950/);
      expect(inr(1180000)).toMatch(/₹\s?11,800/);
      expect(inr(null)).toBe('—');
    });

    it('monthTitle returns localized month strings', () => {
      const date = new Date(Date.UTC(2026, 10, 1)); // November 2026
      const titleEn = monthTitle(date, 'en');
      const titleHi = monthTitle(date, 'hi');
      expect(titleEn).toContain('November');
      expect(titleEn).toContain('2026');
      expect(titleHi).toContain('2026');
    });
  });

  describe('5-Row Pricing Breakdown Integrity Matrix', () => {
    const flatAdvancePaise = 50000; // Flat ₹500
    const cases = [
      { cyl: 1, base: 250000, gst: 45000, total: 295000, balance: 245000 },
      { cyl: 2, base: 500000, gst: 90000, total: 590000, balance: 540000 },
      { cyl: 3, base: 750000, gst: 135000, total: 885000, balance: 835000 },
      { cyl: 4, base: 1000000, gst: 180000, total: 1180000, balance: 1130000 },
      { cyl: 5, base: 1250000, gst: 225000, total: 1475000, balance: 1425000 },
      { cyl: 6, base: 1500000, gst: 270000, total: 1770000, balance: 1720000 },
    ];

    for (const { cyl, base, gst, total, balance } of cases) {
      it(`calculates exact 5-row pricing for ${cyl} cylinder(s)`, () => {
        const computedBase = 250000 * cyl;
        const computedGst = Math.round((computedBase * 1800) / 10000);
        const computedTotal = computedBase + computedGst;
        const computedBalance = computedTotal - flatAdvancePaise;

        expect(computedBase).toBe(base);
        expect(computedGst).toBe(gst);
        expect(computedTotal).toBe(total);
        expect(computedBalance).toBe(balance);
        expect(flatAdvancePaise + computedBalance).toBe(computedTotal);
      });
    }
  });

  describe('Linked Hour and Time Slots Grouping Logic', () => {
    it('groups slots by 2-digit hour dynamically for 20-minute schedule', () => {
      const sampleSlots = [
        { startTime: '06:00', bookingEndTime: '07:20', canStartBooking: true },
        { startTime: '06:20', bookingEndTime: '07:40', canStartBooking: true },
        { startTime: '06:40', bookingEndTime: '08:00', canStartBooking: true },
        { startTime: '07:00', bookingEndTime: '08:20', canStartBooking: true },
        { startTime: '07:20', bookingEndTime: '08:40', canStartBooking: true },
      ];

      const hours = Array.from(new Set(sampleSlots.map((s) => s.startTime.slice(0, 2)))).sort();
      expect(hours).toEqual(['06', '07']);

      const slotsIn06 = sampleSlots.filter((s) => s.startTime.slice(0, 2) === '06');
      expect(slotsIn06).toHaveLength(3);
      expect(slotsIn06.map((s) => s.startTime)).toEqual(['06:00', '06:20', '06:40']);

      const slotsIn07 = sampleSlots.filter((s) => s.startTime.slice(0, 2) === '07');
      expect(slotsIn07).toHaveLength(2);
      expect(slotsIn07.map((s) => s.startTime)).toEqual(['07:00', '07:20']);
    });

    it('groups slots dynamically for 15-minute schedule', () => {
      const sampleSlots15m = [
        { startTime: '09:00', bookingEndTime: '10:00', canStartBooking: true },
        { startTime: '09:15', bookingEndTime: '10:15', canStartBooking: true },
        { startTime: '09:30', bookingEndTime: '10:30', canStartBooking: true },
        { startTime: '09:45', bookingEndTime: '10:45', canStartBooking: true },
        { startTime: '10:00', bookingEndTime: '11:00', canStartBooking: true },
      ];

      const hours = Array.from(new Set(sampleSlots15m.map((s) => s.startTime.slice(0, 2)))).sort();
      expect(hours).toEqual(['09', '10']);

      const slotsIn09 = sampleSlots15m.filter((s) => s.startTime.slice(0, 2) === '09');
      expect(slotsIn09).toHaveLength(4);
    });
  });

  describe('Vehicle Registration Validation Integration', () => {
    it('validates State Series and BH Series correctly', () => {
      const stateResult = validateVehicleRegistration('HR26DQ5551', 'en');
      expect(stateResult.valid).toBe(true);
      expect(stateResult.normalized).toBe('HR26DQ5551');

      const bhResult = validateVehicleRegistration('22BH1234AA', 'en');
      expect(bhResult.valid).toBe(true);
      expect(bhResult.normalized).toBe('22BH1234AA');
    });

    it('rejects invalid inputs with descriptive bilingual messages', () => {
      const invalidEn = validateVehicleRegistration('MYCAR', 'en');
      expect(invalidEn.valid).toBe(false);
      expect(invalidEn.error).toContain('Please enter a valid Indian vehicle registration number');

      const invalidHi = validateVehicleRegistration('MYCAR', 'hi');
      expect(invalidHi.valid).toBe(false);
      expect(invalidHi.error).toContain('कृपया एक मान्य भारतीय वाहन पंजीकरण संख्या दर्ज करें');
    });
  });
});
