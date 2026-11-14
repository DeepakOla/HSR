import { describe, expect, it } from 'vitest';
import { buildSnapshotScheduleRanges } from '../src/lib/schedule-ranges';

describe('buildSnapshotScheduleRanges', () => {
  it('keeps the current schedule filling the horizon when the next version starts later', () => {
    expect(buildSnapshotScheduleRanges('2026-11-12', '2026-12-27', [
      { configVersion: 1, effectiveFrom: '2026-10-01' },
      { configVersion: 2, effectiveFrom: '2027-03-10' },
    ])).toEqual([
      {
        configVersion: 1,
        effectiveFrom: '2026-10-01',
        startDate: '2026-11-12',
        endDate: '2026-12-27',
      },
    ]);
  });

  it('splits the horizon at the next schedule effective date', () => {
    expect(buildSnapshotScheduleRanges('2026-11-12', '2026-12-27', [
      { configVersion: 1, effectiveFrom: '2026-10-01' },
      { configVersion: 2, effectiveFrom: '2026-12-10' },
    ])).toEqual([
      {
        configVersion: 1,
        effectiveFrom: '2026-10-01',
        startDate: '2026-11-12',
        endDate: '2026-12-09',
      },
      {
        configVersion: 2,
        effectiveFrom: '2026-12-10',
        startDate: '2026-12-10',
        endDate: '2026-12-27',
      },
    ]);
  });

  it('uses the highest version when versions share the same effective date', () => {
    expect(buildSnapshotScheduleRanges('2026-11-12', '2026-12-27', [
      { configVersion: 1, effectiveFrom: '2026-10-01' },
      { configVersion: 2, effectiveFrom: '2026-12-10' },
      { configVersion: 3, effectiveFrom: '2026-12-10' },
    ])).toEqual([
      {
        configVersion: 1,
        effectiveFrom: '2026-10-01',
        startDate: '2026-11-12',
        endDate: '2026-12-09',
      },
      {
        configVersion: 3,
        effectiveFrom: '2026-12-10',
        startDate: '2026-12-10',
        endDate: '2026-12-27',
      },
    ]);
  });
});
