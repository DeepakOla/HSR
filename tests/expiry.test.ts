import { describe, expect, it } from 'vitest';
import { calculateNextRetestDate, isValidIsoDate } from '../src/lib/expiry';

describe('calculateNextRetestDate', () => {
  it('adds exactly three years for standard date', () => {
    expect(calculateNextRetestDate('2025-04-10')).toBe('2028-04-10');
  });

  it('handles leap dates consistently', () => {
    expect(calculateNextRetestDate('2024-02-29')).toBe('2027-03-01');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real ISO calendar dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2025-04-10')).toBe(true);
  });

  it('rejects impossible dates and invalid formatting', () => {
    expect(isValidIsoDate('2025-02-29')).toBe(false);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('10-04-2025')).toBe(false);
  });
});

describe('calculateNextRetestDate input validation', () => {
  it('rejects impossible calendar dates', () => {
    expect(() => calculateNextRetestDate('2026-02-31')).toThrow();
  });
});
