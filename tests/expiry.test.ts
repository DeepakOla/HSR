import { describe, expect, it } from 'vitest';
import { calculateNextRetestDate, calculateRemainingValidity, isValidIsoDate } from '../src/lib/expiry';

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

describe('calculateRemainingValidity', () => {
  it('calculates valid future retest dates accurately', () => {
    const res = calculateRemainingValidity('2028-06-15', '2026-11-14', 'en');
    expect(res.status).toBe('VALID');
    expect(res.daysRemaining).toBeGreaterThan(60);
    expect(res.timeRemainingFormatted).toContain('year');
  });

  it('detects expiring soon status within 60 days', () => {
    const res = calculateRemainingValidity('2026-12-01', '2026-11-14', 'en');
    expect(res.status).toBe('EXPIRING_SOON');
    expect(res.daysRemaining).toBe(17);
    expect(res.timeRemainingFormatted).toBe('17 days remaining');
  });

  it('detects overdue testing status accurately', () => {
    const res = calculateRemainingValidity('2026-10-14', '2026-11-14', 'en');
    expect(res.status).toBe('OVERDUE');
    expect(res.daysRemaining).toBeLessThan(0);
    expect(res.statusLabel).toBe('Testing Overdue');
    expect(res.timeRemainingFormatted).toContain('Overdue');
  });
});
