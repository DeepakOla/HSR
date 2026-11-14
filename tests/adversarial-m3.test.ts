import { describe, it, expect } from 'vitest';
import {
  calculateServicePrice,
  calculateBookingPrice,
  FIXED_GST_RATE_BPS,
} from '../src/lib/pricing';
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

describe('Adversarial M3 Suite: 5-Row Pricing Breakdown Mathematical Invariants', () => {
  const BASE_PRICE_PER_CYLINDER_PAISE = 250000; // ₹2,500
  const DEFAULT_FLAT_ADVANCE_PAISE = 50000; // Flat ₹500
  const GST_PER_CYLINDER_PAISE = 45000; // 18% of ₹2,500 = ₹450
  const TOTAL_PER_CYLINDER_PAISE = 295000; // ₹2,950

  describe('Invariant 1: Conservation of Total Price across all 1–6 cylinders', () => {
    it.each([1, 2, 3, 4, 5, 6])(
      'guarantees advancePaise + balancePaise === totalPricePaise for %i cylinder(s) with flat ₹500 advance',
      (cylinders) => {
        const basePaise = BASE_PRICE_PER_CYLINDER_PAISE * cylinders;
        const breakdown = calculateBookingPrice(basePaise, DEFAULT_FLAT_ADVANCE_PAISE);

        // Core conservation invariant
        expect(breakdown.advancePaise + breakdown.balancePaise).toBe(breakdown.totalPricePaise);

        // Base price exactness
        expect(breakdown.basePricePaise).toBe(BASE_PRICE_PER_CYLINDER_PAISE * cylinders);

        // GST exactness (18%)
        expect(breakdown.gstRateBps).toBe(FIXED_GST_RATE_BPS);
        expect(breakdown.gstAmountPaise).toBe(GST_PER_CYLINDER_PAISE * cylinders);

        // Total exactness
        expect(breakdown.totalPricePaise).toBe(TOTAL_PER_CYLINDER_PAISE * cylinders);

        // Balance exactness
        expect(breakdown.balancePaise).toBe((TOTAL_PER_CYLINDER_PAISE * cylinders) - DEFAULT_FLAT_ADVANCE_PAISE);

        // Bounds checks
        expect(breakdown.basePricePaise).toBeGreaterThan(0);
        expect(breakdown.gstAmountPaise).toBeGreaterThan(0);
        expect(breakdown.totalPricePaise).toBeGreaterThan(breakdown.basePricePaise);
        expect(breakdown.advancePaise).toBeGreaterThan(0);
        expect(breakdown.balancePaise).toBeGreaterThan(0);
      }
    );
  });

  describe('Invariant 2: Strict Monotonicity with Flat Advance across 1–6 cylinders', () => {
    it('strictly increases Base, GST, Total, and Balance as cylinder count increases from 1 to 6', () => {
      let prevTotal = 0;
      let prevBalance = 0;
      let prevBase = 0;

      for (let c = 1; c <= 6; c++) {
        const base = BASE_PRICE_PER_CYLINDER_PAISE * c;
        const b = calculateBookingPrice(base, DEFAULT_FLAT_ADVANCE_PAISE);

        expect(b.basePricePaise).toBeGreaterThan(prevBase);
        expect(b.totalPricePaise).toBeGreaterThan(prevTotal);
        expect(b.balancePaise).toBeGreaterThan(prevBalance);
        expect(b.advancePaise).toBe(DEFAULT_FLAT_ADVANCE_PAISE); // advance stays constant flat ₹500

        prevBase = b.basePricePaise;
        prevTotal = b.totalPricePaise;
        prevBalance = b.balancePaise;
      }
    });
  });

  describe('Invariant 3: Conservation across Varied / Boundary Advance Amounts', () => {
    const testCases = [
      { cyl: 1, base: 250000, total: 295000 },
      { cyl: 4, base: 1000000, total: 1180000 },
      { cyl: 6, base: 1500000, total: 1770000 },
    ];

    it.each(testCases)(
      'preserves advance + balance === total when advance is 0 (full balance) for $cyl cyl',
      ({ base, total }) => {
        const b = calculateBookingPrice(base, 0);
        expect(b.advancePaise).toBe(0);
        expect(b.balancePaise).toBe(total);
        expect(b.advancePaise + b.balancePaise).toBe(total);
      }
    );

    it.each(testCases)(
      'preserves advance + balance === total when advance is 1 paisa for $cyl cyl',
      ({ base, total }) => {
        const b = calculateBookingPrice(base, 1);
        expect(b.advancePaise).toBe(1);
        expect(b.balancePaise).toBe(total - 1);
        expect(b.advancePaise + b.balancePaise).toBe(total);
      }
    );

    it.each(testCases)(
      'preserves advance + balance === total when advance is full total price (zero balance) for $cyl cyl',
      ({ base, total }) => {
        const b = calculateBookingPrice(base, total);
        expect(b.advancePaise).toBe(total);
        expect(b.balancePaise).toBe(0);
        expect(b.advancePaise + b.balancePaise).toBe(total);
      }
    );

    it.each(testCases)(
      'preserves advance + balance === total when advance is custom owner amount (₹1,000 / 100000 paise) for $cyl cyl',
      ({ base, total }) => {
        const b = calculateBookingPrice(base, 100000);
        expect(b.advancePaise).toBe(100000);
        expect(b.balancePaise).toBe(total - 100000);
        expect(b.advancePaise + b.balancePaise).toBe(total);
      }
    );
  });

  describe('Invariant 4: Fail-Closed Boundary Rejection on Invalid Pricing Inputs', () => {
    it('rejects advance amount exceeding total price with RangeError', () => {
      // 1 cylinder total is 295000 paise
      expect(() => calculateBookingPrice(250000, 295001)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, 500000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, 10000000)).toThrow(RangeError);
    });

    it('rejects negative advance amounts with RangeError', () => {
      expect(() => calculateBookingPrice(250000, -1)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, -50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, -Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    });

    it('rejects non-integer / floating-point advance amounts with RangeError', () => {
      expect(() => calculateBookingPrice(250000, 50000.5)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, 0.1)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, NaN)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, Infinity)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, -Infinity)).toThrow(RangeError);
    });

    it('rejects negative or fractional base prices with RangeError', () => {
      expect(() => calculateBookingPrice(-1, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(-250000, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000.75, 50000)).toThrow(RangeError);
      expect(() => calculateServicePrice(-100)).toThrow(RangeError);
      expect(() => calculateServicePrice(1234.56)).toThrow(RangeError);
    });
  });

  describe('Invariant 5: Currency Formatting & INR Presentation', () => {
    it('formats null and undefined gracefully as dash', () => {
      expect(inr(null)).toBe('—');
    });

    it('formats zero paise correctly', () => {
      expect(inr(0)).toMatch(/₹\s?0/);
    });

    it('formats standard breakdown numbers without decimal noise', () => {
      expect(inr(50000)).toMatch(/₹\s?500/);
      expect(inr(250000)).toMatch(/₹\s?2,500/);
      expect(inr(45000)).toMatch(/₹\s?450/);
      expect(inr(295000)).toMatch(/₹\s?2,950/);
      expect(inr(1180000)).toMatch(/₹\s?11,800/);
      expect(inr(1770000)).toMatch(/₹\s?17,700/);
    });
  });
});

describe('Adversarial M3 Suite: Public Cylinder Boundaries & Fleet Routing', () => {
  describe('Public Cylinder Options Structural Invariants', () => {
    it('contains exactly 7 options with counts 1..6 and null for "more"', () => {
      expect(PUBLIC_CYLINDER_OPTIONS).toHaveLength(7);

      const counts = PUBLIC_CYLINDER_OPTIONS.map((o) => o.count);
      expect(counts).toEqual([1, 2, 3, 4, 5, 6, null]);

      const values = PUBLIC_CYLINDER_OPTIONS.map((o) => o.value);
      expect(values).toEqual(['1', '2', '3', '4', '5', '6', 'more']);
    });

    it('enforces that boundary 0 is NOT a public option', () => {
      const zeroOpt = PUBLIC_CYLINDER_OPTIONS.find((o) => o.value === '0' || o.count === 0);
      expect(zeroOpt).toBeUndefined();
    });

    it('enforces that cylinder count 7 is NOT a direct numerical option (routed to "more")', () => {
      const sevenOpt = PUBLIC_CYLINDER_OPTIONS.find((o) => o.value === '7' || o.count === 7);
      expect(sevenOpt).toBeUndefined();
    });

    it('guarantees every option has non-empty English and Hindi labels', () => {
      for (const opt of PUBLIC_CYLINDER_OPTIONS) {
        expect(opt.labelEn).toBeDefined();
        expect(opt.labelHi).toBeDefined();
        expect(opt.labelEn.trim().length).toBeGreaterThan(0);
        expect(opt.labelHi.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('Cylinder Selection State Transitions (chooseCylinderCount simulation)', () => {
    // Pure simulation of BookingWizard chooseCylinderCount state machine
    interface WizardCylinderState {
      cylinderCount: number;
      moreThan6Selected: boolean;
      selectedHour: string;
      selectedSlotId: number | null;
      canProceedToTime: boolean;
    }

    function simulateChooseCylinder(
      currentState: WizardCylinderState,
      selectedValue: string
    ): WizardCylinderState {
      if (selectedValue === 'more') {
        return {
          cylinderCount: currentState.cylinderCount,
          moreThan6Selected: true,
          selectedHour: '',
          selectedSlotId: null,
          canProceedToTime: false, // Suppressed when > 6
        };
      }
      const count = Number(selectedValue);
      return {
        cylinderCount: count,
        moreThan6Selected: false,
        selectedHour: '',
        selectedSlotId: null,
        canProceedToTime: count >= 1 && count <= 6,
      };
    }

    it('suppresses Continue button and enables Fleet Contact Card when "more" is selected', () => {
      const initial: WizardCylinderState = {
        cylinderCount: 1,
        moreThan6Selected: false,
        selectedHour: '06',
        selectedSlotId: 101,
        canProceedToTime: true,
      };

      const next = simulateChooseCylinder(initial, 'more');
      expect(next.moreThan6Selected).toBe(true);
      expect(next.canProceedToTime).toBe(false); // MUST block progression
      expect(next.selectedSlotId).toBeNull(); // Resets selected slot
      expect(next.selectedHour).toBe(''); // Resets hour
      expect(next.cylinderCount).toBe(1); // Retains underlying count safely
    });

    it('restores self-service flow when switching from "more" back to valid 1–6 count', () => {
      const inFleetMode: WizardCylinderState = {
        cylinderCount: 1,
        moreThan6Selected: true,
        selectedHour: '',
        selectedSlotId: null,
        canProceedToTime: false,
      };

      const restored = simulateChooseCylinder(inFleetMode, '4');
      expect(restored.moreThan6Selected).toBe(false);
      expect(restored.cylinderCount).toBe(4);
      expect(restored.canProceedToTime).toBe(true);
    });

    it('handles all 1–6 options smoothly enabling self-service progression', () => {
      for (let c = 1; c <= 6; c++) {
        const state = simulateChooseCylinder(
          { cylinderCount: 1, moreThan6Selected: false, selectedHour: '', selectedSlotId: null, canProceedToTime: true },
          String(c)
        );
        expect(state.moreThan6Selected).toBe(false);
        expect(state.cylinderCount).toBe(c);
        expect(state.canProceedToTime).toBe(true);
      }
    });

    it('Fleet Contact details match verified constants for phone and WhatsApp', () => {
      expect(DEFAULT_CONTACT_PHONE).toBe('+919910055355');
      expect(DEFAULT_CONTACT_WHATSAPP).toBe('+919910055355');
      expect(DEFAULT_WHATSAPP_URL).toBe('https://wa.me/919910055355');
    });
  });
});

describe('Adversarial M3 Suite: Vehicle Option Logic & Truck 4-Cylinder Preselection', () => {
  describe('VEHICLE_OPTIONS Invariants', () => {
    it('contains exactly 8 vehicle categories in correct operational sequence', () => {
      const expected = ['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other'];
      expect(VEHICLE_OPTIONS.map((v) => v.value)).toEqual(expected);
    });

    it('all 8 vehicle categories have bilingual labels with Hindi script', () => {
      for (const opt of VEHICLE_OPTIONS) {
        expect(opt.labelEn).toMatch(/^[A-Za-z0-9\s()/-]+$/);
        // Ensure Hindi label contains Devanagari Unicode characters (\u0900-\u097F)
        expect(/[\u0900-\u097F]/.test(opt.labelHi)).toBe(true);
      }
    });
  });

  describe('Truck Auto-Preselection & Reset State Machine Simulation', () => {
    interface WizardVehicleState {
      vehicleClass: string;
      cylinderCount: number;
      moreThan6Selected: boolean;
      selectedHour: string;
      selectedSlotId: number | null;
    }

    function simulateSetVehicle(
      currentState: WizardVehicleState,
      newVehicle: string
    ): WizardVehicleState {
      let count = currentState.cylinderCount;
      if (newVehicle === 'Truck') {
        count = 4; // Preselect 4 for Truck
      } else if (currentState.vehicleClass === 'Truck' && currentState.cylinderCount === 4) {
        count = 1; // Reset to 1 only if leaving Truck and count is still 4
      }
      return {
        vehicleClass: newVehicle,
        cylinderCount: count,
        moreThan6Selected: false,
        selectedHour: '',
        selectedSlotId: null,
      };
    }

    it('auto-preselects 4 cylinders when Truck is chosen from default Car (1 cylinder)', () => {
      const initial: WizardVehicleState = {
        vehicleClass: 'Car',
        cylinderCount: 1,
        moreThan6Selected: false,
        selectedHour: '06',
        selectedSlotId: 10,
      };

      const updated = simulateSetVehicle(initial, 'Truck');
      expect(updated.vehicleClass).toBe('Truck');
      expect(updated.cylinderCount).toBe(4);
      expect(updated.selectedHour).toBe('');
      expect(updated.selectedSlotId).toBeNull();
    });

    it('resets cylinder count back to 1 when leaving Truck if count remained at default 4', () => {
      const truckState: WizardVehicleState = {
        vehicleClass: 'Truck',
        cylinderCount: 4,
        moreThan6Selected: false,
        selectedHour: '',
        selectedSlotId: null,
      };

      const carState = simulateSetVehicle(truckState, 'Car');
      expect(carState.vehicleClass).toBe('Car');
      expect(carState.cylinderCount).toBe(1);
    });

    it('preserves user custom choice (e.g. 6 cylinders) when leaving Truck for Bus', () => {
      // Scenario: User picked Truck, changed cylinders to 6, then went back and picked Bus
      const customizedTruckState: WizardVehicleState = {
        vehicleClass: 'Truck',
        cylinderCount: 6, // User explicitly customized to 6
        moreThan6Selected: false,
        selectedHour: '',
        selectedSlotId: null,
      };

      const busState = simulateSetVehicle(customizedTruckState, 'Bus');
      expect(busState.vehicleClass).toBe('Bus');
      expect(busState.cylinderCount).toBe(6); // MUST NOT overwrite explicit 6 with 1!
    });

    it('does not alter cylinder count when switching between non-Truck vehicles (Car -> Taxi -> Van)', () => {
      let state: WizardVehicleState = {
        vehicleClass: 'Car',
        cylinderCount: 2,
        moreThan6Selected: false,
        selectedHour: '',
        selectedSlotId: null,
      };

      state = simulateSetVehicle(state, 'Taxi');
      expect(state.vehicleClass).toBe('Taxi');
      expect(state.cylinderCount).toBe(2);

      state = simulateSetVehicle(state, 'Van');
      expect(state.vehicleClass).toBe('Van');
      expect(state.cylinderCount).toBe(2);
    });
  });

  describe('buildVehicleDescription Defensive Formatting', () => {
    it('handles standard class and model', () => {
      expect(buildVehicleDescription('Car', 'Swift')).toBe('Car - Swift');
      expect(buildVehicleDescription('Truck', 'BharatBenz 2823R')).toBe('Truck - BharatBenz 2823R');
      expect(buildVehicleDescription('Van', 'Maruti Eeco')).toBe('Van - Maruti Eeco');
    });

    it('returns bare class when model is empty or only whitespace', () => {
      expect(buildVehicleDescription('Car', '')).toBe('Car');
      expect(buildVehicleDescription('Car', '   ')).toBe('Car');
      expect(buildVehicleDescription('Truck', '\t\n ')).toBe('Truck');
    });

    it('handles "Other" vehicle category without redundant prefix', () => {
      expect(buildVehicleDescription('Other', 'CNG Forklift')).toBe('CNG Forklift');
      expect(buildVehicleDescription('Other', '')).toBe('Other');
      expect(buildVehicleDescription('Other', '   ')).toBe('Other');
    });

    it('falls back to "Car" when vehicleClass is empty or whitespace', () => {
      expect(buildVehicleDescription('', 'WagonR')).toBe('Car - WagonR');
      expect(buildVehicleDescription('   ', 'WagonR')).toBe('Car - WagonR');
      expect(buildVehicleDescription('', '')).toBe('Car');
    });

    it('preserves special punctuation in model without corruption', () => {
      expect(buildVehicleDescription('Truck', 'Tata 407 (Gold SFC 29 WB)')).toBe(
        'Truck - Tata 407 (Gold SFC 29 WB)'
      );
      expect(buildVehicleDescription('Car', 'i20 N-Line / Magna')).toBe('Car - i20 N-Line / Magna');
    });
  });
});

describe('Adversarial M3 Suite: Date Utility Boundaries, Leap Years & Time Math', () => {
  describe('todayInIndia Format & Boundaries', () => {
    it('returns ISO date string conforming strictly to YYYY-MM-DD in Asia/Kolkata timezone', () => {
      const today = todayInIndia();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [year, month, day] = today.split('-').map(Number);
      expect(year).toBeGreaterThanOrEqual(2026);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    });
  });

  describe('addDays Edge Cases: Leap Years, Month Endings & Year Rollover', () => {
    it('handles leap year February (2024 & 2028: 29 days)', () => {
      expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    });

    it('handles non-leap year February (2025, 2026, 2027: 28 days)', () => {
      expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
      expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    });

    it('handles century leap year rules (2000 leap vs 2100 non-leap)', () => {
      expect(addDays('2000-02-28', 1)).toBe('2000-02-29'); // 2000 is divisible by 400
      expect(addDays('2100-02-28', 1)).toBe('2100-03-01'); // 2100 is not divisible by 400
    });

    it('handles standard 30-day and 31-day month boundaries', () => {
      expect(addDays('2026-04-30', 1)).toBe('2026-05-01'); // April has 30 days
      expect(addDays('2026-05-31', 1)).toBe('2026-06-01'); // May has 31 days
      expect(addDays('2026-06-30', 1)).toBe('2026-07-01'); // June has 30 days
      expect(addDays('2026-07-31', 1)).toBe('2026-08-01'); // July has 31 days
      expect(addDays('2026-08-31', 1)).toBe('2026-09-01'); // August has 31 days
      expect(addDays('2026-09-30', 1)).toBe('2026-10-01'); // September has 30 days
    });

    it('handles year-end rollover boundary', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-12-31', 365)).toBe('2027-12-31');
    });

    it('handles negative offsets and zero offset', () => {
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
      expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // Leap year backwards
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
      expect(addDays('2026-08-15', 0)).toBe('2026-08-15');
    });

    it('enforces exact 60-day horizon invariant (today + 59 days = 60 inclusive days)', () => {
      const today = '2026-05-01';
      const lastDay = addDays(today, 59);
      // From 2026-05-01: May has 31 days (31 days in May). 59 - 30 remaining days in May = 29 days into June
      expect(lastDay).toBe('2026-06-29');

      // Verify that difference in timestamps corresponds to exactly 59 days
      const d1 = new Date(today + 'T00:00:00Z').getTime();
      const d2 = new Date(lastDay + 'T00:00:00Z').getTime();
      expect((d2 - d1) / (1000 * 60 * 60 * 24)).toBe(59);
    });
  });

  describe('formatHourOption: Full 24-Hour Matrix & Adversarial Inputs', () => {
    it('accurately formats midnight and noon boundaries in English and Hindi', () => {
      expect(formatHourOption('00', 'en')).toBe('12 AM');
      expect(formatHourOption('00', 'hi')).toBe('सुबह 12 बजे (12 AM)');

      expect(formatHourOption('12', 'en')).toBe('12 PM');
      expect(formatHourOption('12', 'hi')).toBe('दोपहर 12 बजे (12 PM)');
    });

    it('correctly maps morning (सुबह), afternoon (दोपहर), and evening (शाम) periods in Hindi', () => {
      // 00..11 -> सुबह
      expect(formatHourOption('06', 'hi')).toBe('सुबह 6 बजे (6 AM)');
      expect(formatHourOption('11', 'hi')).toBe('सुबह 11 बजे (11 AM)');

      // 12..15 -> दोपहर
      expect(formatHourOption('13', 'hi')).toBe('दोपहर 1 बजे (1 PM)');
      expect(formatHourOption('15', 'hi')).toBe('दोपहर 3 बजे (3 PM)');

      // 16..23 -> शाम
      expect(formatHourOption('16', 'hi')).toBe('शाम 4 बजे (4 PM)');
      expect(formatHourOption('19', 'hi')).toBe('शाम 7 बजे (7 PM)');
      expect(formatHourOption('23', 'hi')).toBe('शाम 11 बजे (11 PM)');
    });

    it('gracefully returns invalid or unparseable input unmodified without crashing', () => {
      expect(formatHourOption('not-an-hour', 'en')).toBe('not-an-hour');
      expect(formatHourOption('', 'hi')).toBe('');
      expect(formatHourOption('NaN', 'en')).toBe('NaN');
    });
  });

  describe('calculateDurationMinutes Matrix', () => {
    it('calculates 0 minutes for identical start and end timestamps', () => {
      expect(calculateDurationMinutes('06:00', '06:00')).toBe(0);
      expect(calculateDurationMinutes('12:30', '12:30')).toBe(0);
    });

    it('calculates duration for multi-cylinder runs (20 min per cylinder)', () => {
      expect(calculateDurationMinutes('06:00', '06:20')).toBe(20); // 1 cyl
      expect(calculateDurationMinutes('06:00', '06:40')).toBe(40); // 2 cyl
      expect(calculateDurationMinutes('06:00', '07:00')).toBe(60); // 3 cyl
      expect(calculateDurationMinutes('06:00', '07:20')).toBe(80); // 4 cyl
      expect(calculateDurationMinutes('06:00', '07:40')).toBe(100); // 5 cyl
      expect(calculateDurationMinutes('06:00', '08:00')).toBe(120); // 6 cyl
    });

    it('calculates duration across noon transition and 15-minute intervals', () => {
      expect(calculateDurationMinutes('11:40', '12:20')).toBe(40);
      expect(calculateDurationMinutes('11:45', '12:45')).toBe(60);
      expect(calculateDurationMinutes('09:15', '10:00')).toBe(45);
    });

    it('calculates full operating day duration (06:00 to 20:00 = 14 hours = 840 minutes)', () => {
      expect(calculateDurationMinutes('06:00', '20:00')).toBe(840);
    });
  });

  describe('monthTitle Localization Matrix', () => {
    it('formats all 12 calendar months in English and Hindi', () => {
      const monthsEn = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      for (let m = 0; m < 12; m++) {
        const d = new Date(Date.UTC(2026, m, 1));
        const enTitle = monthTitle(d, 'en');
        const hiTitle = monthTitle(d, 'hi');

        expect(enTitle).toContain(monthsEn[m]);
        expect(enTitle).toContain('2026');
        expect(hiTitle).toContain('2026');
        // Hindi month string should contain Devanagari text
        expect(/[\u0900-\u097F]/.test(hiTitle)).toBe(true);
      }
    });
  });
});

describe('Adversarial M3 Suite: Vehicle Registration Validation Boundary Stress', () => {
  it('accepts valid State Series and Bharat Series with varied whitespace and delimiters', () => {
    const validInputs = [
      { raw: 'dl01ab1234', expected: 'DL01AB1234' },
      { raw: '  hr 26 dq 5551  ', expected: 'HR26DQ5551' },
      { raw: 'MH-12-CD-9999', expected: 'MH12CD9999' },
      { raw: 'UP.32.AB.1234', expected: 'UP32AB1234' },
      { raw: '22bh1234aa', expected: '22BH1234AA' },
      { raw: '23 BH 5555 AB', expected: '23BH5555AB' },
      { raw: '21-BH-9999-Z', expected: '21BH9999Z' },
    ];

    for (const { raw, expected } of validInputs) {
      const res = validateVehicleRegistration(raw, 'en');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe(expected);
      expect(res.error).toBeUndefined();
    }
  });

  it('rejects adversarial malformed registrations and injection attempts', () => {
    const invalidInputs = [
      '',
      '    ',
      '1234',
      'DL1',
      'DL01AB12345', // 5 digits at end instead of 4
      'NOT-A-REG',   // letters only
      "' OR '1'='1", // SQL injection string
      '<script>alert(1)</script>', // XSS payload
      'DROP TABLE bookings;', // SQL payload
      '22BH12345AA', // 5 digits in BH series instead of 4
      '22BH123AA',   // 3 digits in BH series instead of 4
      '22BH1234AAA', // 3 series letters in BH series instead of 1-2
      '22BH1234',    // missing series letters in BH series
      'DL01',        // missing 4 digits
      'ABCDEFGHIJK', // letters only
    ];

    for (const raw of invalidInputs) {
      const res = validateVehicleRegistration(raw, 'en');
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    }
  });
});
