function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export interface SnapshotScheduleVersion {
  configVersion: number;
  effectiveFrom: string;
}

export interface SnapshotScheduleRange extends SnapshotScheduleVersion {
  startDate: string;
  endDate: string;
}

/**
 * Splits the rolling booking horizon into non-overlapping schedule-version ranges.
 * A future schedule outside the horizon must not stop the currently active
 * schedule from filling dates before its effective date.
 */
export function buildSnapshotScheduleRanges(
  today: string,
  horizonEnd: string,
  versions: SnapshotScheduleVersion[]
): SnapshotScheduleRange[] {
  const sorted = [...versions].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom) || a.configVersion - b.configVersion
  );
  const ranges: SnapshotScheduleRange[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const version = sorted[index];
    const nextVersion = sorted[index + 1];
    const startDate = version.effectiveFrom > today ? version.effectiveFrom : today;
    const endBeforeNext = nextVersion
      ? addDays(nextVersion.effectiveFrom, -1)
      : horizonEnd;
    const endDate = endBeforeNext < horizonEnd ? endBeforeNext : horizonEnd;

    if (startDate <= endDate && version.effectiveFrom <= horizonEnd) {
      ranges.push({ ...version, startDate, endDate });
    }
  }

  return ranges;
}

/**
 * Maintains a 45-day availability horizon for every schedule version.
 * The persisted effective dates ensure future changes do not project backwards.
 */
