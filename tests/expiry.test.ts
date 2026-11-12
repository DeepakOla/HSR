import { describe, expect, it } from 'vitest';
import { calculateNextRetestDate } from '../src/lib/expiry';

describe('calculateNextRetestDate', () => {
  it('adds exactly three years for standard date', () => {
    expect(calculateNextRetestDate('2025-04-10')).toBe('2028-04-10');
  });

  it('handles leap dates consistently', () => {
    expect(calculateNextRetestDate('2024-02-29')).toBe('2027-03-01');
  });
});
