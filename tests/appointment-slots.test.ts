import { describe, expect, it } from 'vitest';
import { findConsecutiveAvailableSlots, generateAppointmentSlots, markBookableStarts, minutesToTime } from '../src/lib/appointment-slots';

const base = {
  serviceDate: '2026-11-13', configVersion: 1, isClosed: false, isPublic: true,
};
const occupied = (count: number, reservedIndexes: number[] = []) => Array.from({ length: count }, (_, index) => ({
  ...base, slotSnapshotId: index + 1,
  startTime: minutesToTime(600 + index * 20),
  endTime: minutesToTime(620 + index * 20),
  reserved: reservedIndexes.includes(index),
}));

describe('appointment slot generation', () => {
  it('creates 24 standard 20-minute units for an eight-hour day', () => {
    const slots = generateAppointmentSlots({ openTime: '10:00', closeTime: '18:00', intervalMinutes: 20, extendedHoursEnabled: false, extendedHoursPublic: false });
    expect(slots).toHaveLength(24);
    expect(slots[0].startTime).toBe('10:00');
    expect(slots[23].endTime).toBe('18:00');
  });

  it('creates three additional units for the optional ninth hour', () => {
    const slots = generateAppointmentSlots({ openTime: '10:00', closeTime: '18:00', intervalMinutes: 20, extendedHoursEnabled: true, extendedHoursPublic: false });
    expect(slots).toHaveLength(27);
    expect(slots.slice(-3).map((slot) => slot.startTime)).toEqual(['18:00', '18:20', '18:40']);
    expect(slots.slice(-3).every((slot) => slot.isExtended)).toBe(true);
  });

  it('supports the configurable 15-minute interval', () => {
    const slots = generateAppointmentSlots({ openTime: '10:00', closeTime: '18:00', intervalMinutes: 15, extendedHoursEnabled: false, extendedHoursPublic: false });
    expect(slots).toHaveLength(32);
  });

  it('does not create appointment units inside the break', () => {
    const slots = generateAppointmentSlots({ openTime: '10:00', closeTime: '18:00', intervalMinutes: 20, breakStart: '13:00', breakEnd: '13:40', extendedHoursEnabled: false, extendedHoursPublic: false });
    expect(slots).toHaveLength(22);
    expect(slots.some((slot) => slot.startTime === '13:00')).toBe(false);
  });
});

describe('multi-cylinder contiguous reservations', () => {
  it('requires one consecutive 20-minute unit per CNG cylinder', () => {
    const slots = occupied(8);
    const marked = markBookableStarts(slots, 6);
    expect(marked[0].canStartBooking).toBe(true);
    expect(marked[0].bookingEndTime).toBe('12:00');
    expect(marked[3].canStartBooking).toBe(false);
  });

  it('does not allow a booking to jump across an already reserved unit', () => {
    const slots = occupied(8, [2]);
    const marked = markBookableStarts(slots, 4);
    expect(marked[0].canStartBooking).toBe(false);
    expect(marked[3].canStartBooking).toBe(true);
  });

  it('allocates the exact consecutive run chosen by the customer', () => {
    const slots = occupied(8);
    expect(findConsecutiveAvailableSlots(slots, 2, 3)?.map((slot) => slot.slotSnapshotId)).toEqual([2, 3, 4]);
  });
});
