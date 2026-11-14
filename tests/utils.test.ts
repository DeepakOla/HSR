import { describe, expect, it } from 'vitest';
import { normalizePhoneIndian, normalizeUtr, normalizeVehicleRegistration } from '../src/lib/utils';

describe('input normalization', () => {
  it('normalizes Indian numbers to E.164', () => {
    expect(normalizePhoneIndian('98765 43210')).toBe('+919876543210');
  });

  it('throws on invalid phone', () => {
    expect(() => normalizePhoneIndian('123')).toThrow();
  });

  it('normalizes registration and utr', () => {
    expect(normalizeVehicleRegistration('hr 36 ab 1234')).toBe('HR36AB1234');
    expect(normalizeVehicleRegistration('dl-01-ab-1234')).toBe('DL01AB1234');
    expect(normalizeVehicleRegistration('HR-26-DQ-5551')).toBe('HR26DQ5551');
    expect(normalizeVehicleRegistration('22-bh-1234-aa')).toBe('22BH1234AA');
    expect(normalizeVehicleRegistration('  DL - 01 / AB - 1234  ')).toBe('DL01AB1234');
    expect(normalizeUtr('  abcd 1234  ')).toBe('ABCD1234');
  });
});
