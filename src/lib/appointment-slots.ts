export interface AppointmentSlotTemplate {
  startTime: string;
  endTime: string;
  labelEn: string;
  labelHi: string;
  capacity: 1;
  intervalMinutes: 15 | 20;
  isExtended: boolean;
  sortOrder: number;
}

export interface OccupiedAppointmentSlot {
  slotSnapshotId: number;
  serviceDate: string;
  startTime: string;
  endTime: string;
  configVersion: number;
  isClosed: boolean;
  isPublic: boolean;
  reserved: boolean;
}

export interface BookableAppointmentSlot extends OccupiedAppointmentSlot {
  canStartBooking: boolean;
  bookingEndTime: string | null;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function generateAppointmentSlots(input: {
  openTime: string;
  closeTime: string;
  intervalMinutes: 15 | 20;
  breakStart?: string | null;
  breakEnd?: string | null;
  extendedHoursEnabled: boolean;
  extendedHoursPublic: boolean;
  extendedMinutes?: number;
}): AppointmentSlotTemplate[] {
  const open = timeToMinutes(input.openTime);
  const close = timeToMinutes(input.closeTime);
  const interval = input.intervalMinutes;
  if (close <= open || (close - open) % interval !== 0) throw new Error('Operating hours must be an exact multiple of the selected appointment interval');

  const breakStart = input.breakStart ? timeToMinutes(input.breakStart) : null;
  const breakEnd = input.breakEnd ? timeToMinutes(input.breakEnd) : null;
  if ((breakStart === null) !== (breakEnd === null)) throw new Error('Both break start and break end are required');
  if (breakStart !== null && breakEnd !== null) {
    if (breakStart < open || breakEnd > close || breakEnd <= breakStart) throw new Error('Break must be inside operating hours');
    if ((breakStart - open) % interval !== 0 || (breakEnd - open) % interval !== 0) throw new Error('Break times must align with the appointment interval');
  }

  const slots: AppointmentSlotTemplate[] = [];
  let sortOrder = 1;
  const addRange = (start: number, end: number, isExtended: boolean) => {
    for (let cursor = start; cursor + interval <= end; cursor += interval) {
      const next = cursor + interval;
      if (!isExtended && breakStart !== null && breakEnd !== null && cursor < breakEnd && next > breakStart) continue;
      const startTime = minutesToTime(cursor);
      const endTime = minutesToTime(next);
      const label = `${startTime} - ${endTime}`;
      slots.push({ startTime, endTime, labelEn: label, labelHi: label, capacity: 1, intervalMinutes: interval, isExtended, sortOrder: sortOrder++ });
    }
  };
  addRange(open, close, false);
  if (input.extendedHoursEnabled) {
    const extension = input.extendedMinutes ?? 60;
    if (extension <= 0 || extension % interval !== 0 || close + extension > 24 * 60) throw new Error('Extra operating time must be a positive multiple of the appointment interval');
    addRange(close, close + extension, true);
  }
  if (!slots.length) throw new Error('The selected operating hours produce no appointment slots');
  return slots;
}

export function markBookableStarts<T extends OccupiedAppointmentSlot>(
  input: T[],
  cylinderCount: number,
  includeStaffOnly = false,
): Array<T & { canStartBooking: boolean; bookingEndTime: string | null }> {
  const sorted = [...input].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.startTime.localeCompare(b.startTime));
  return sorted.map((slot, index) => {
    const run = sorted.slice(index, index + cylinderCount);
    const valid = cylinderCount >= 1 && run.length === cylinderCount && run.every((candidate, offset) => {
      if (candidate.serviceDate !== slot.serviceDate || candidate.configVersion !== slot.configVersion || candidate.isClosed || candidate.reserved) return false;
      if (!includeStaffOnly && !candidate.isPublic) return false;
      return offset === 0 || run[offset - 1].endTime === candidate.startTime;
    });
    return { ...slot, canStartBooking: valid, bookingEndTime: valid ? run[run.length - 1].endTime : null };
  });
}

export function findConsecutiveAvailableSlots<T extends OccupiedAppointmentSlot>(
  input: T[],
  startSlotId: number,
  cylinderCount: number,
  includeStaffOnly = false,
): T[] | null {
  const sorted = [...input].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.startTime.localeCompare(b.startTime));
  const startIndex = sorted.findIndex((slot) => slot.slotSnapshotId === startSlotId);
  if (startIndex < 0) return null;
  const run = sorted.slice(startIndex, startIndex + cylinderCount);
  if (run.length !== cylinderCount) return null;
  const valid = run.every((slot, offset) => {
    if (slot.serviceDate !== run[0].serviceDate || slot.configVersion !== run[0].configVersion || slot.isClosed || slot.reserved) return false;
    if (!includeStaffOnly && !slot.isPublic) return false;
    return offset === 0 || run[offset - 1].endTime === slot.startTime;
  });
  return valid ? run : null;
}
