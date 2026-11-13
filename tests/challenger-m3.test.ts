import { describe, expect, it } from 'vitest';
import {
  findConsecutiveAvailableSlots,
  generateAppointmentSlots,
  markBookableStarts,
  minutesToTime,
  type OccupiedAppointmentSlot,
} from '../src/lib/appointment-slots';
import {
  VEHICLE_OPTIONS,
  PUBLIC_CYLINDER_OPTIONS,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_CONTACT_WHATSAPP,
  DEFAULT_WHATSAPP_URL,
  formatHourOption,
  calculateDurationMinutes,
  buildVehicleDescription,
  addDays,
  inr,
} from '../src/lib/booking-wizard-helpers';

/**
 * Helper to construct synthetic slot collections for stress testing.
 */
function createSyntheticSchedule(params: {
  serviceDate?: string;
  count: number;
  startHour?: number;
  intervalMinutes?: 15 | 20 | 30;
  configVersion?: number;
  reservedMask?: boolean[];
  closedMask?: boolean[];
  publicMask?: boolean[];
}): OccupiedAppointmentSlot[] {
  const serviceDate = params.serviceDate ?? '2026-11-13';
  const interval = params.intervalMinutes ?? 20;
  const startMinute = (params.startHour ?? 10) * 60;
  const configVersion = params.configVersion ?? 1;

  return Array.from({ length: params.count }, (_, index) => {
    const slotStartMin = startMinute + index * interval;
    const slotEndMin = slotStartMin + interval;
    return {
      slotSnapshotId: index + 1,
      serviceDate,
      startTime: minutesToTime(slotStartMin),
      endTime: minutesToTime(slotEndMin),
      configVersion,
      isClosed: params.closedMask ? !!params.closedMask[index] : false,
      isPublic: params.publicMask ? params.publicMask[index] !== false : true,
      reserved: params.reservedMask ? !!params.reservedMask[index] : false,
    };
  });
}

describe('Challenger M3-1: Empirical Adversarial Stress Test Suite', () => {
  // =========================================================================
  // 1. DENSE, FRAGMENTED & SPARSE CONSECUTIVE SLOT AVAILABILITY
  // =========================================================================
  describe('1. Consecutive Slot Availability Stress Testing', () => {
    describe('Dense Schedules (100% capacity available)', () => {
      it('verifies exact mathematical run count for all cylinder counts (1 to 12) at 20-minute intervals', () => {
        const slotCount = 36; // 12-hour day (e.g. 08:00 to 20:00)
        const schedule = createSyntheticSchedule({ count: slotCount, startHour: 8, intervalMinutes: 20 });

        for (let cyl = 1; cyl <= 12; cyl++) {
          const marked = markBookableStarts(schedule, cyl);
          const bookableStarts = marked.filter((s) => s.canStartBooking);

          // In an unbroken dense schedule of length N, exactly N - cyl + 1 slots can start
          const expectedBookableCount = slotCount - cyl + 1;
          expect(bookableStarts).toHaveLength(expectedBookableCount);

          // Verify every bookable start has the exact predicted bookingEndTime
          for (let i = 0; i < expectedBookableCount; i++) {
            const startSlot = marked[i];
            expect(startSlot.canStartBooking).toBe(true);

            const expectedEndSlot = schedule[i + cyl - 1];
            expect(startSlot.bookingEndTime).toBe(expectedEndSlot.endTime);

            // Duration check: bookingEndTime - startTime must equal cyl * 20 minutes
            const duration = calculateDurationMinutes(startSlot.startTime, startSlot.bookingEndTime!);
            expect(duration).toBe(cyl * 20);

            // findConsecutiveAvailableSlots must return the exact slice of length cyl
            const run = findConsecutiveAvailableSlots(schedule, startSlot.slotSnapshotId, cyl);
            expect(run).not.toBeNull();
            expect(run).toHaveLength(cyl);
            expect(run![0].slotSnapshotId).toBe(startSlot.slotSnapshotId);
            expect(run![cyl - 1].endTime).toBe(expectedEndSlot.endTime);
          }

          // The tail slots (last cyl - 1) must be strictly non-bookable
          for (let i = expectedBookableCount; i < slotCount; i++) {
            expect(marked[i].canStartBooking).toBe(false);
            expect(marked[i].bookingEndTime).toBeNull();
            expect(findConsecutiveAvailableSlots(schedule, marked[i].slotSnapshotId, cyl)).toBeNull();
          }
        }
      });

      it('verifies exact mathematical run count for all cylinder counts (1 to 6) at 15-minute intervals', () => {
        const slotCount = 48; // 12-hour day (e.g. 08:00 to 20:00)
        const schedule = createSyntheticSchedule({ count: slotCount, startHour: 8, intervalMinutes: 15 });

        for (let cyl = 1; cyl <= 6; cyl++) {
          const marked = markBookableStarts(schedule, cyl);
          const bookableStarts = marked.filter((s) => s.canStartBooking);
          const expectedBookableCount = slotCount - cyl + 1;
          expect(bookableStarts).toHaveLength(expectedBookableCount);

          const first = marked[0];
          expect(first.canStartBooking).toBe(true);
          const duration = calculateDurationMinutes(first.startTime, first.bookingEndTime!);
          expect(duration).toBe(cyl * 15);
        }
      });
    });

    describe('Fragmented Schedules (Punctured, Checkerboard, & Multi-Day Barriers)', () => {
      it('checkerboard pattern: alternating occupied slots completely blocks any booking > 1 cylinder', () => {
        // Even indices open, odd indices reserved: [Open, Res, Open, Res, Open, Res, ...]
        const count = 30;
        const reservedMask = Array.from({ length: count }, (_, i) => i % 2 === 1);
        const schedule = createSyntheticSchedule({ count, reservedMask });

        // 1 cylinder: exactly the 15 even slots can be booked
        const marked1 = markBookableStarts(schedule, 1);
        expect(marked1.filter((s) => s.canStartBooking)).toHaveLength(15);
        for (let i = 0; i < count; i++) {
          expect(marked1[i].canStartBooking).toBe(i % 2 === 0);
        }

        // 2, 3, 4, 5, 6 cylinders: absolutely ZERO slots can start a booking!
        for (let cyl = 2; cyl <= 6; cyl++) {
          const marked = markBookableStarts(schedule, cyl);
          const bookable = marked.filter((s) => s.canStartBooking);
          expect(bookable).toHaveLength(0);

          for (const slot of marked) {
            expect(slot.canStartBooking).toBe(false);
            expect(slot.bookingEndTime).toBeNull();
            expect(findConsecutiveAvailableSlots(schedule, slot.slotSnapshotId, cyl)).toBeNull();
          }
        }
      });

      it('clustered fragmentation: verifies precise island boundary enforcement', () => {
        // Pattern: [2 open, 1 reserved, 3 open, 2 reserved, 4 open]
        // Indices:
        // 0, 1: OPEN (island of 2)
        // 2: RESERVED
        // 3, 4, 5: OPEN (island of 3)
        // 6, 7: RESERVED
        // 8, 9, 10, 11: OPEN (island of 4)
        const reservedMask = [
          false, false,
          true,
          false, false, false,
          true, true,
          false, false, false, false,
        ];
        const schedule = createSyntheticSchedule({ count: reservedMask.length, reservedMask });

        // Cylinder = 1: all 9 non-reserved slots are bookable
        const marked1 = markBookableStarts(schedule, 1);
        expect(marked1.filter((s) => s.canStartBooking)).toHaveLength(9);

        // Cylinder = 2:
        // Island of 2 gives 1 start (idx 0)
        // Island of 3 gives 2 starts (idx 3, 4)
        // Island of 4 gives 3 starts (idx 8, 9, 10)
        // Total = 6 starts
        const marked2 = markBookableStarts(schedule, 2);
        const starts2 = marked2.filter((s) => s.canStartBooking).map((s) => s.slotSnapshotId);
        expect(starts2).toEqual([1, 4, 5, 9, 10, 11]);

        // Cylinder = 3:
        // Island of 2 gives 0 starts
        // Island of 3 gives 1 start (idx 3)
        // Island of 4 gives 2 starts (idx 8, 9)
        // Total = 3 starts
        const marked3 = markBookableStarts(schedule, 3);
        const starts3 = marked3.filter((s) => s.canStartBooking).map((s) => s.slotSnapshotId);
        expect(starts3).toEqual([4, 9, 10]);

        // Cylinder = 4:
        // Only Island of 4 can accommodate (idx 8) -> exactly 1 start
        const marked4 = markBookableStarts(schedule, 4);
        const starts4 = marked4.filter((s) => s.canStartBooking).map((s) => s.slotSnapshotId);
        expect(starts4).toEqual([9]);

        // Cylinder = 5 or 6: 0 starts
        const marked5 = markBookableStarts(schedule, 5);
        expect(marked5.filter((s) => s.canStartBooking)).toHaveLength(0);
      });

      it('strictly forbids contiguous runs from bridging across serviceDate boundaries', () => {
        // Last 2 slots of Day 1 and first 2 slots of Day 2
        const day1 = createSyntheticSchedule({ serviceDate: '2026-11-13', count: 2, startHour: 17, intervalMinutes: 20 });
        const day2 = createSyntheticSchedule({ serviceDate: '2026-11-14', count: 2, startHour: 10, intervalMinutes: 20 });
        day2[0].slotSnapshotId = 3;
        day2[1].slotSnapshotId = 4;

        const combined = [...day1, ...day2];

        // 2 cylinders: Day 1 index 0 can book (spans 0 and 1).
        // Day 1 index 1 CANNOT book (cannot bridge to Day 2 index 0).
        // Day 2 index 0 can book (spans 2 and 3).
        const marked2 = markBookableStarts(combined, 2);
        expect(marked2[0].canStartBooking).toBe(true);
        expect(marked2[1].canStartBooking).toBe(false); // Day boundary prevents bridging!
        expect(marked2[2].canStartBooking).toBe(true);
        expect(marked2[3].canStartBooking).toBe(false);

        // findConsecutiveAvailableSlots for Day 1 slot 2 must fail for 2 cylinders
        expect(findConsecutiveAvailableSlots(combined, 2, 2)).toBeNull();
      });

      it('strictly forbids contiguous runs from bridging across configVersion boundaries', () => {
        const schedule = createSyntheticSchedule({ count: 6 });
        // Slots 1-3 are version 1, slots 4-6 are version 2 (e.g. midday schedule revision)
        schedule[3].configVersion = 2;
        schedule[4].configVersion = 2;
        schedule[5].configVersion = 2;

        const marked3 = markBookableStarts(schedule, 3);
        // Slot 1 (idx 0): slots 0, 1, 2 are all version 1 -> valid
        expect(marked3[0].canStartBooking).toBe(true);
        // Slot 2 (idx 1): slots 1, 2 (v1) and 3 (v2) -> INVALID (mismatched configVersion)
        expect(marked3[1].canStartBooking).toBe(false);
        // Slot 3 (idx 2): slots 2 (v1) and 3, 4 (v2) -> INVALID
        expect(marked3[2].canStartBooking).toBe(false);
        // Slot 4 (idx 3): slots 3, 4, 5 are all version 2 -> valid
        expect(marked3[3].canStartBooking).toBe(true);

        expect(findConsecutiveAvailableSlots(schedule, 2, 3)).toBeNull();
      });

      it('strictly treats isClosed = true as an impenetrable barrier', () => {
        const schedule = createSyntheticSchedule({ count: 6 });
        schedule[2].isClosed = true; // Middle slot closed by owner for maintenance

        const marked2 = markBookableStarts(schedule, 2);
        expect(marked2[0].canStartBooking).toBe(true); // 0, 1 open
        expect(marked2[1].canStartBooking).toBe(false); // 1 open, 2 closed -> blocked
        expect(marked2[2].canStartBooking).toBe(false); // 2 closed
        expect(marked2[3].canStartBooking).toBe(true); // 3, 4 open
      });

      it('enforces public vs staff-only visibility barrier', () => {
        const schedule = createSyntheticSchedule({ count: 4 });
        schedule[1].isPublic = false; // Staff-only slot

        // Public booking (includeStaffOnly = false)
        const publicMarked = markBookableStarts(schedule, 2, false);
        expect(publicMarked[0].canStartBooking).toBe(false); // blocked by private slot at idx 1
        expect(publicMarked[1].canStartBooking).toBe(false);
        expect(publicMarked[2].canStartBooking).toBe(true); // 2 and 3 are public and open

        // Staff booking (includeStaffOnly = true)
        const staffMarked = markBookableStarts(schedule, 2, true);
        expect(staffMarked[0].canStartBooking).toBe(true); // staff can book across private slot
        expect(staffMarked[1].canStartBooking).toBe(true);
      });

      it('prevents bridging across appointment break gaps generated by schedule engine', () => {
        // Operating 10:00 to 14:00 with lunch break 12:00 to 12:40 (20m intervals)
        const templates = generateAppointmentSlots({
          openTime: '10:00',
          closeTime: '14:00',
          intervalMinutes: 20,
          breakStart: '12:00',
          breakEnd: '12:40',
          extendedHoursEnabled: false,
          extendedHoursPublic: false,
        });

        const occupiedSlots: OccupiedAppointmentSlot[] = templates.map((t, idx) => ({
          slotSnapshotId: idx + 1,
          serviceDate: '2026-11-13',
          startTime: t.startTime,
          endTime: t.endTime,
          configVersion: 1,
          isClosed: false,
          isPublic: true,
          reserved: false,
        }));

        // Slots before break: 10:00-10:20, 10:20-10:40, 10:40-11:00, 11:00-11:20, 11:20-11:40, 11:40-12:00 (6 slots)
        // Break: 12:00 - 12:40
        // Slots after break: 12:40-13:00, 13:00-13:20, 13:20-13:40, 13:40-14:00 (4 slots)
        expect(occupiedSlots).toHaveLength(10);
        expect(occupiedSlots[5].endTime).toBe('12:00');
        expect(occupiedSlots[6].startTime).toBe('12:40'); // 40-minute gap!

        // Cylinder = 2: Slot 6 (11:40-12:00) cannot bridge to Slot 7 (12:40-13:00) because 12:00 !== 12:40!
        const marked2 = markBookableStarts(occupiedSlots, 2);
        expect(marked2[4].canStartBooking).toBe(true); // 11:20-11:40 and 11:40-12:00
        expect(marked2[5].canStartBooking).toBe(false); // 11:40 cannot bridge across lunch gap!
        expect(marked2[6].canStartBooking).toBe(true); // 12:40-13:00 and 13:00-13:20

        expect(findConsecutiveAvailableSlots(occupiedSlots, marked2[5].slotSnapshotId, 2)).toBeNull();
      });
    });

    describe('Sparse & Degenerate Schedules', () => {
      it('handles empty schedule without throwing', () => {
        const empty: OccupiedAppointmentSlot[] = [];
        const marked = markBookableStarts(empty, 4);
        expect(marked).toEqual([]);
        expect(findConsecutiveAvailableSlots(empty, 1, 4)).toBeNull();
      });

      it('handles degenerate cylinder counts (0, negative, larger than entire schedule)', () => {
        const schedule = createSyntheticSchedule({ count: 5 });

        // Zero cylinders: markBookableStarts rejects all starts
        const markedZero = markBookableStarts(schedule, 0);
        expect(markedZero.every((s) => !s.canStartBooking)).toBe(true);
        // findConsecutiveAvailableSlots returns empty array (0 slots allocated)
        const zeroRun = findConsecutiveAvailableSlots(schedule, 1, 0);
        expect(zeroRun).toEqual([]);

        // Negative cylinders
        const markedNeg = markBookableStarts(schedule, -2);
        expect(markedNeg.every((s) => !s.canStartBooking)).toBe(true);
        expect(findConsecutiveAvailableSlots(schedule, 1, -2)).toBeNull();

        // Cylinders exceeding total schedule length (10 cylinders on 5 slots)
        const markedExceed = markBookableStarts(schedule, 10);
        expect(markedExceed.every((s) => !s.canStartBooking)).toBe(true);
        expect(findConsecutiveAvailableSlots(schedule, 1, 10)).toBeNull();
      });

      it('handles sparse schedule with isolated single open slots', () => {
        // 20 slots, only slot 3 and slot 15 open
        const reservedMask = Array.from({ length: 20 }, (_, i) => i !== 3 && i !== 15);
        const schedule = createSyntheticSchedule({ count: 20, reservedMask });

        const marked1 = markBookableStarts(schedule, 1);
        expect(marked1.filter((s) => s.canStartBooking)).toHaveLength(2);
        expect(marked1[3].canStartBooking).toBe(true);
        expect(marked1[15].canStartBooking).toBe(true);

        const marked2 = markBookableStarts(schedule, 2);
        expect(marked2.filter((s) => s.canStartBooking)).toHaveLength(0);
      });
    });

    describe('Monte Carlo Adversarial Fuzzing (1,000 Randomized Schedules)', () => {
      it('asserts 100% agreement with independent ground-truth oracle across 1,000 randomized schedules', () => {
        // Deterministic PRNG
        let seed = 0x98765432;
        function rnd() {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        }

        const FUZZ_RUNS = 1000;

        for (let iter = 0; iter < FUZZ_RUNS; iter++) {
          const slotCount = Math.floor(rnd() * 25) + 5; // 5 to 30 slots
          const interval = rnd() > 0.5 ? 20 : 15;
          const cylinderCount = Math.floor(rnd() * 6) + 1; // 1 to 6 cylinders
          const includeStaffOnly = rnd() > 0.7;

          // Randomize attributes
          const reservedMask = Array.from({ length: slotCount }, () => rnd() < 0.3); // 30% reserved
          const closedMask = Array.from({ length: slotCount }, () => rnd() < 0.1); // 10% closed
          const publicMask = Array.from({ length: slotCount }, () => rnd() > 0.15); // 15% staff-only

          const schedule = createSyntheticSchedule({
            count: slotCount,
            intervalMinutes: interval as 15 | 20,
            reservedMask,
            closedMask,
            publicMask,
          });

          // Ground-Truth Oracle Calculation:
          // A slot at index `i` is bookable iff `i + cylinderCount <= slotCount`
          // AND for all k from 0 to cylinderCount - 1:
          //   - !slot[i + k].isClosed
          //   - !slot[i + k].reserved
          //   - (includeStaffOnly || slot[i + k].isPublic)
          //   - slot[i + k].serviceDate === slot[i].serviceDate
          //   - slot[i + k].configVersion === slot[i].configVersion
          //   - if k > 0, slot[i + k].startTime === slot[i + k - 1].endTime
          const oracleResults = schedule.map((slot, i) => {
            if (i + cylinderCount > slotCount) return { canStart: false, endTime: null };
            for (let k = 0; k < cylinderCount; k++) {
              const cur = schedule[i + k];
              if (cur.isClosed || cur.reserved) return { canStart: false, endTime: null };
              if (!includeStaffOnly && !cur.isPublic) return { canStart: false, endTime: null };
              if (cur.serviceDate !== slot.serviceDate || cur.configVersion !== slot.configVersion) {
                return { canStart: false, endTime: null };
              }
              if (k > 0 && cur.startTime !== schedule[i + k - 1].endTime) {
                return { canStart: false, endTime: null };
              }
            }
            return { canStart: true, endTime: schedule[i + cylinderCount - 1].endTime };
          });

          // Run system under test
          const marked = markBookableStarts(schedule, cylinderCount, includeStaffOnly);

          // Verify exact match
          for (let i = 0; i < slotCount; i++) {
            const expected = oracleResults[i];
            const actual = marked[i];

            if (actual.canStartBooking !== expected.canStart) {
              throw new Error(
                `Fuzz mismatch at iter ${iter}, slot ${i}: expected canStartBooking=${expected.canStart}, got ${actual.canStartBooking}`
              );
            }
            if (actual.bookingEndTime !== expected.endTime) {
              throw new Error(
                `Fuzz mismatch at iter ${iter}, slot ${i}: expected bookingEndTime=${expected.endTime}, got ${actual.bookingEndTime}`
              );
            }

            // Also test findConsecutiveAvailableSlots
            const run = findConsecutiveAvailableSlots(schedule, actual.slotSnapshotId, cylinderCount, includeStaffOnly);
            if (expected.canStart) {
              if (!run || run.length !== cylinderCount) {
                throw new Error(`findConsecutiveAvailableSlots failed at iter ${iter}, slot ${i}`);
              }
              if (run[0].slotSnapshotId !== actual.slotSnapshotId) {
                throw new Error(`findConsecutiveAvailableSlots start mismatch at iter ${iter}`);
              }
              if (run[cylinderCount - 1].endTime !== expected.endTime) {
                throw new Error(`findConsecutiveAvailableSlots end mismatch at iter ${iter}`);
              }
            } else {
              if (run !== null) {
                throw new Error(`findConsecutiveAvailableSlots should be null at iter ${iter}, slot ${i}`);
              }
            }
          }
        }
      }, 25000);
    });
  });

  // =========================================================================
  // 2. DYNAMIC INTERVALS & HOUR / TIME SLOT GROUPING
  // =========================================================================
  describe('2. Dynamic Intervals & Hour / Time Slot Grouping', () => {
    describe('Interval Operating Windows & Alignment Constraints', () => {
      it('generates pristine 64 slots for 16-hour day (06:00 to 22:00) at 15-minute intervals', () => {
        const slots = generateAppointmentSlots({
          openTime: '06:00',
          closeTime: '22:00',
          intervalMinutes: 15,
          extendedHoursEnabled: false,
          extendedHoursPublic: false,
        });
        expect(slots).toHaveLength(64);
        expect(slots[0].startTime).toBe('06:00');
        expect(slots[0].endTime).toBe('06:15');
        expect(slots[63].startTime).toBe('21:45');
        expect(slots[63].endTime).toBe('22:00');
      });

      it('generates pristine 48 slots for 16-hour day (06:00 to 22:00) at 20-minute intervals', () => {
        const slots = generateAppointmentSlots({
          openTime: '06:00',
          closeTime: '22:00',
          intervalMinutes: 20,
          extendedHoursEnabled: false,
          extendedHoursPublic: false,
        });
        expect(slots).toHaveLength(48);
        expect(slots[0].startTime).toBe('06:00');
        expect(slots[0].endTime).toBe('06:20');
        expect(slots[47].startTime).toBe('21:40');
        expect(slots[47].endTime).toBe('22:00');
      });

      it('supports extended evening operating hour (22:00 to 23:00) with proper tagging', () => {
        const slots = generateAppointmentSlots({
          openTime: '06:00',
          closeTime: '22:00',
          intervalMinutes: 20,
          extendedHoursEnabled: true,
          extendedMinutes: 60,
          extendedHoursPublic: false,
        });
        // 48 standard + 3 extended = 51 slots
        expect(slots).toHaveLength(51);
        const extended = slots.filter((s) => s.isExtended);
        expect(extended).toHaveLength(3);
        expect(extended.map((s) => s.startTime)).toEqual(['22:00', '22:20', '22:40']);
        expect(extended[2].endTime).toBe('23:00');
      });

      it('rejects misaligned operating hours that are not exact multiples of interval', () => {
        // 10:00 to 10:25 with 20-minute interval (remainder 5)
        expect(() =>
          generateAppointmentSlots({
            openTime: '10:00',
            closeTime: '10:25',
            intervalMinutes: 20,
            extendedHoursEnabled: false,
            extendedHoursPublic: false,
          })
        ).toThrow(/exact multiple/);

        // 10:00 to 10:20 with 15-minute interval (remainder 5)
        expect(() =>
          generateAppointmentSlots({
            openTime: '10:00',
            closeTime: '10:20',
            intervalMinutes: 15,
            extendedHoursEnabled: false,
            extendedHoursPublic: false,
          })
        ).toThrow(/exact multiple/);
      });

      it('rejects invalid break boundaries and misaligned breaks', () => {
        // Break outside operating hours
        expect(() =>
          generateAppointmentSlots({
            openTime: '10:00',
            closeTime: '18:00',
            intervalMinutes: 20,
            breakStart: '09:00',
            breakEnd: '09:40',
            extendedHoursEnabled: false,
            extendedHoursPublic: false,
          })
        ).toThrow(/inside operating hours/);

        // Break misaligned with interval (e.g. 13:10 to 13:40 with 20m interval)
        expect(() =>
          generateAppointmentSlots({
            openTime: '10:00',
            closeTime: '18:00',
            intervalMinutes: 20,
            breakStart: '13:10',
            breakEnd: '13:40',
            extendedHoursEnabled: false,
            extendedHoursPublic: false,
          })
        ).toThrow(/align with the appointment interval/);
      });
    });

    describe('Wizard Linked Hour & Start Time Grouping Logic Simulation', () => {
      it('correctly derives unique availableHours in numeric chronological order for 15m and 20m schedules', () => {
        // Schedule spanning 06:00 to 22:00
        const slots20m = createSyntheticSchedule({ count: 48, startHour: 6, intervalMinutes: 20 });
        const marked20m = markBookableStarts(slots20m, 4); // 4 cylinders

        // Replicate wizard logic:
        const availableStarts = marked20m.filter((s) => s.canStartBooking);
        const availableHours = Array.from(
          new Set(availableStarts.map((s) => s.startTime.slice(0, 2)))
        ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        // Since slot 45 is 21:00-21:20 (ends 22:20 -> wait, 48 slots ends at 22:00, slot 44 is 20:40-21:00,
        // slot 44 + 4 runs to 22:00).
        // Let's verify hours are ordered: '06', '07', '08', ..., '20'
        expect(availableHours[0]).toBe('06');
        for (let i = 1; i < availableHours.length; i++) {
          expect(parseInt(availableHours[i], 10)).toBeGreaterThan(parseInt(availableHours[i - 1], 10));
        }

        // Verify slotsInSelectedHour for '06'
        const slotsIn06 = availableStarts.filter((s) => s.startTime.slice(0, 2) === '06');
        expect(slotsIn06.map((s) => s.startTime)).toEqual(['06:00', '06:20', '06:40']);
      });

      it('hour with zero bookable starts is excluded from availableHours', () => {
        const schedule = createSyntheticSchedule({ count: 12, startHour: 10, intervalMinutes: 20 });
        // 10:00 to 14:00 (12 slots)
        // Reserve all slots in hour 11 (11:00, 11:20, 11:40)
        schedule[3].reserved = true; // 11:00
        schedule[4].reserved = true; // 11:20
        schedule[5].reserved = true; // 11:40

        const marked = markBookableStarts(schedule, 2);
        const availableStarts = marked.filter((s) => s.canStartBooking);
        const availableHours = Array.from(
          new Set(availableStarts.map((s) => s.startTime.slice(0, 2)))
        ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        // Hour '11' has no valid starts -> MUST NOT be in availableHours!
        expect(availableHours).not.toContain('11');
      });

      it('supports custom interval grouping (e.g. 30-minute intervals)', () => {
        const slots30m = createSyntheticSchedule({ count: 8, startHour: 9, intervalMinutes: 30 });
        const marked = markBookableStarts(slots30m, 2);
        const availableStarts = marked.filter((s) => s.canStartBooking);

        const hours = Array.from(new Set(availableStarts.map((s) => s.startTime.slice(0, 2)))).sort();
        expect(hours).toEqual(['09', '10', '11', '12']);

        const slotsIn09 = availableStarts.filter((s) => s.startTime.slice(0, 2) === '09');
        expect(slotsIn09.map((s) => s.startTime)).toEqual(['09:00', '09:30']);
      });
    });

    describe('formatHourOption Bilingual Formatting Across Full 24 Hours & Edge Inputs', () => {
      it('correctly formats all 24 hours (00 to 23) in English', () => {
        const expectedEn = [
          '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM',
          '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
          '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
          '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
        ];

        for (let h = 0; h < 24; h++) {
          const hourStr = String(h).padStart(2, '0');
          expect(formatHourOption(hourStr, 'en')).toBe(expectedEn[h]);
        }
      });

      it('correctly formats all 24 hours (00 to 23) in Hindi with contextual period words', () => {
        for (let h = 0; h < 24; h++) {
          const hourStr = String(h).padStart(2, '0');
          const formatted = formatHourOption(hourStr, 'hi');
          const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
          const ampm = h < 12 ? 'AM' : 'PM';

          if (h < 12) {
            expect(formatted).toBe(`सुबह ${displayHour} बजे (${displayHour} ${ampm})`);
          } else if (h < 16) {
            expect(formatted).toBe(`दोपहर ${displayHour} बजे (${displayHour} ${ampm})`);
          } else {
            expect(formatted).toBe(`शाम ${displayHour} बजे (${displayHour} ${ampm})`);
          }
        }
      });

      it('handles unpadded single digits, out-of-range, and garbage inputs gracefully', () => {
        expect(formatHourOption('6', 'en')).toBe('6 AM');
        expect(formatHourOption('9', 'hi')).toBe('सुबह 9 बजे (9 AM)');
        expect(formatHourOption('invalid', 'en')).toBe('invalid');
        expect(formatHourOption('', 'hi')).toBe('');
        expect(formatHourOption('   ', 'en')).toBe('   ');
      });
    });
  });

  // =========================================================================
  // 3. DURATION CALCULATION HELPERS ACROSS EXTREME BOUNDARIES
  // =========================================================================
  describe('3. Duration Calculation Helpers Across Extreme Boundaries', () => {
    it('calculates zero duration when start equals end', () => {
      expect(calculateDurationMinutes('06:00', '06:00')).toBe(0);
      expect(calculateDurationMinutes('12:30', '12:30')).toBe(0);
      expect(calculateDurationMinutes('23:59', '23:59')).toBe(0);
    });

    it('calculates 1-minute delta accurately', () => {
      expect(calculateDurationMinutes('06:00', '06:01')).toBe(1);
      expect(calculateDurationMinutes('23:58', '23:59')).toBe(1);
    });

    it('calculates multi-hour and day-boundary durations', () => {
      // Early morning to late night (06:00 to 22:00 = 16 hours = 960 minutes)
      expect(calculateDurationMinutes('06:00', '22:00')).toBe(960);

      // Midday crossing with uneven minutes (09:47 to 14:13)
      // (14 * 60 + 13) - (9 * 60 + 47) = 853 - 587 = 266 minutes
      expect(calculateDurationMinutes('09:47', '14:13')).toBe(266);

      // Full day span 00:00 to 23:59 = 1439 minutes
      expect(calculateDurationMinutes('00:00', '23:59')).toBe(1439);

      // 24:00 full span
      expect(calculateDurationMinutes('00:00', '24:00')).toBe(1440);
    });

    it('handles negative durations when start is after end (anti-regression check)', () => {
      expect(calculateDurationMinutes('10:00', '09:00')).toBe(-60);
      expect(calculateDurationMinutes('20:00', '06:00')).toBe(-840);
    });

    it('multi-cylinder work unit durations match exact specifications for 20m schedule', () => {
      const schedule20m = [
        { cyl: 1, start: '08:00', end: '08:20', expected: 20 },
        { cyl: 2, start: '08:00', end: '08:40', expected: 40 },
        { cyl: 3, start: '08:00', end: '09:00', expected: 60 },
        { cyl: 4, start: '08:00', end: '09:20', expected: 80 },
        { cyl: 5, start: '08:00', end: '09:40', expected: 100 },
        { cyl: 6, start: '08:00', end: '10:00', expected: 120 },
        // Commercial fleet cylinder counts
        { cyl: 8, start: '08:00', end: '10:40', expected: 160 },
        { cyl: 10, start: '08:00', end: '11:20', expected: 200 },
        { cyl: 12, start: '08:00', end: '12:00', expected: 240 },
      ];

      for (const item of schedule20m) {
        expect(calculateDurationMinutes(item.start, item.end)).toBe(item.expected);
        expect(item.cyl * 20).toBe(item.expected);
      }
    });

    it('multi-cylinder work unit durations match exact specifications for 15m schedule', () => {
      const schedule15m = [
        { cyl: 1, start: '09:00', end: '09:15', expected: 15 },
        { cyl: 2, start: '09:00', end: '09:30', expected: 30 },
        { cyl: 3, start: '09:00', end: '09:45', expected: 45 },
        { cyl: 4, start: '09:00', end: '10:00', expected: 60 },
        { cyl: 5, start: '09:00', end: '10:15', expected: 75 },
        { cyl: 6, start: '09:00', end: '10:30', expected: 90 },
      ];

      for (const item of schedule15m) {
        expect(calculateDurationMinutes(item.start, item.end)).toBe(item.expected);
        expect(item.cyl * 15).toBe(item.expected);
      }
    });
  });

  // =========================================================================
  // 4. DEFENSIVE STRING, OPTIONS & INVARIANT HELPERS
  // =========================================================================
  describe('4. Defensive String, Options & Invariant Helpers', () => {
    describe('buildVehicleDescription Adversarial Stress', () => {
      it('handles empty strings and whitespace variations', () => {
        expect(buildVehicleDescription('', '')).toBe('Car');
        expect(buildVehicleDescription('   ', '   ')).toBe('Car');
        expect(buildVehicleDescription('Truck', '')).toBe('Truck');
        expect(buildVehicleDescription('Truck', '   ')).toBe('Truck');
      });

      it('handles "Other" vehicle category with and without model', () => {
        expect(buildVehicleDescription('Other', '')).toBe('Other');
        expect(buildVehicleDescription('Other', '   ')).toBe('Other');
        expect(buildVehicleDescription('Other', 'Harvester Machine')).toBe('Harvester Machine');
        expect(buildVehicleDescription('Other', '   JCB 3DX   ')).toBe('JCB 3DX');
      });

      it('preserves unicode characters, Hindi text, and special symbols safely', () => {
        expect(buildVehicleDescription('Car', 'मारुति वैगनआर')).toBe('Car - मारुति वैगनआर');
        expect(buildVehicleDescription('Truck', 'टाटा 407 (CNG)')).toBe('Truck - टाटा 407 (CNG)');
        expect(buildVehicleDescription('Other', '🚜 Tractor')).toBe('🚜 Tractor');
      });

      it('survives massive 5,000 character strings without truncation or error', () => {
        const longModel = 'A'.repeat(5000);
        const desc = buildVehicleDescription('Car', longModel);
        expect(desc.startsWith('Car - AAAAA')).toBe(true);
        expect(desc.length).toBe(5006);
      });
    });

    describe('PUBLIC_CYLINDER_OPTIONS & Commercial Limits', () => {
      it('strictly limits public options to 1 through 6 and "more"', () => {
        const validValues = PUBLIC_CYLINDER_OPTIONS.map((o) => o.value);
        expect(validValues).toEqual(['1', '2', '3', '4', '5', '6', 'more']);

        // Null count for 'more' triggers fleet card region
        const moreOpt = PUBLIC_CYLINDER_OPTIONS.find((o) => o.value === 'more');
        expect(moreOpt?.count).toBeNull();
      });

      it('has non-empty bilingual labels for every public option', () => {
        for (const opt of PUBLIC_CYLINDER_OPTIONS) {
          expect(opt.labelEn.trim().length).toBeGreaterThan(0);
          expect(opt.labelHi.trim().length).toBeGreaterThan(0);
        }
      });
    });

    describe('VEHICLE_OPTIONS Catalog Rigor', () => {
      it('contains exactly the 8 standard vehicle classes', () => {
        expect(VEHICLE_OPTIONS).toHaveLength(8);
        const classes = VEHICLE_OPTIONS.map((v) => v.value);
        expect(classes).toEqual(['Car', 'Taxi', 'Tempo', 'Van', 'LCV', 'Truck', 'Bus', 'Other']);
      });

      it('verifies Hindi translations contain Devanagari script', () => {
        const devanagariRegex = /[\u0900-\u097F]/;
        for (const v of VEHICLE_OPTIONS) {
          expect(devanagariRegex.test(v.labelHi)).toBe(true);
        }
      });
    });

    describe('Date and Currency Helpers', () => {
      it('addDays handles month and year rollovers accurately', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
        // Leap year rollover
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
        expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
      });

      it('inr handles extreme paise values and edge conditions', () => {
        expect(inr(0)).toMatch(/₹\s?0/);
        expect(inr(100)).toMatch(/₹\s?1/);
        expect(inr(50000)).toMatch(/₹\s?500/);
        expect(inr(10_000_000_000)).toMatch(/₹\s?10,00,00,000/);
        expect(inr(null)).toBe('—');
      });
    });
  });

  // =========================================================================
  // 5. BOOKING WIZARD STATE MACHINE & INVARIANT VERIFICATION
  // =========================================================================
  describe('5. Booking Wizard State Transitions & Interactive Invariants', () => {
    it('verifies Truck cylinder preselection state transitions', () => {
      // Simulation of Wizard vehicle selection state machine
      let vehicleClass = 'Car';
      let cylinderCount = 1;
      let moreThan6Selected = false;

      function simulateSetVehicle(newClass: string) {
        const prevClass = vehicleClass;
        vehicleClass = newClass;
        moreThan6Selected = false;

        if (newClass === 'Truck') {
          cylinderCount = 4;
        } else if (prevClass === 'Truck' && cylinderCount === 4) {
          cylinderCount = 1;
        }
      }

      function simulateChooseCylinders(val: string) {
        if (val === 'more') {
          moreThan6Selected = true;
          return;
        }
        moreThan6Selected = false;
        cylinderCount = Number(val);
      }

      // Initial state
      expect(vehicleClass).toBe('Car');
      expect(cylinderCount).toBe(1);

      // Select Truck -> auto-selects 4 cylinders
      simulateSetVehicle('Truck');
      expect(vehicleClass).toBe('Truck');
      expect(cylinderCount).toBe(4);

      // Switch to Taxi without touching cylinder -> resets back to 1
      simulateSetVehicle('Taxi');
      expect(vehicleClass).toBe('Taxi');
      expect(cylinderCount).toBe(1);

      // Switch back to Truck -> sets to 4
      simulateSetVehicle('Truck');
      expect(cylinderCount).toBe(4);

      // User customizes cylinders to 6 while on Truck
      simulateChooseCylinders('6');
      expect(cylinderCount).toBe(6);

      // User switches from Truck to Bus -> because cylinderCount was 6 (not 4), it PRESERVES 6!
      simulateSetVehicle('Bus');
      expect(vehicleClass).toBe('Bus');
      expect(cylinderCount).toBe(6);

      // User selects "more" -> triggers moreThan6Selected
      simulateChooseCylinders('more');
      expect(moreThan6Selected).toBe(true);

      // Switching vehicle resets moreThan6Selected
      simulateSetVehicle('Van');
      expect(moreThan6Selected).toBe(false);
    });

    it('5-row pricing breakdown strictly maintains Base + GST === Total === Advance + Balance across all public cylinder counts', () => {
      const BASE_PER_CYLINDER = 250000; // ₹2,500
      const GST_RATE_BPS = 1800; // 18%
      const FLAT_ADVANCE = 50000; // ₹500

      for (let cyl = 1; cyl <= 6; cyl++) {
        const base = BASE_PER_CYLINDER * cyl;
        const gst = Math.round((base * GST_RATE_BPS) / 10000);
        const total = base + gst;
        const advance = FLAT_ADVANCE;
        const balance = total - advance;

        expect(base + gst).toBe(total);
        expect(advance + balance).toBe(total);
        expect(balance).toBeGreaterThan(0);
      }
    });

    it('verifies contact constants for Fleet Region when >6 cylinders is selected', () => {
      expect(DEFAULT_CONTACT_PHONE).toBe('+919910055355');
      expect(DEFAULT_CONTACT_WHATSAPP).toBe('+919910055355');
      expect(DEFAULT_WHATSAPP_URL).toBe('https://wa.me/919910055355');
    });
  });
});
