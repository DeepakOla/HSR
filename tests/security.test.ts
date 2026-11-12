import { describe, expect, it } from 'vitest';
import { validateOrigin } from '../src/lib/security';
import { jsonResponse } from '../src/lib/utils';
import { createHoldSchema } from '../src/lib/schemas';

describe('same-origin write protection', () => {
  it('accepts a same-origin request', () => {
    const request = new Request('https://hsr.example/api/booking/create-hold', {
      method: 'POST',
      headers: { origin: 'https://hsr.example' },
    });
    expect(validateOrigin(request)).toBeNull();
  });

  it('rejects a cross-origin request', () => {
    const request = new Request('https://hsr.example/api/booking/create-hold', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    });
    expect(validateOrigin(request)?.status).toBe(403);
  });

  it('rejects requests without an Origin header', () => {
    const request = new Request('https://hsr.example/api/booking/create-hold', { method: 'POST' });
    expect(validateOrigin(request)?.status).toBe(403);
  });
});

describe('private API responses', () => {
  it('marks JSON payloads as non-cacheable', () => {
    const response = jsonResponse({ bookingCode: 'HSR-TEST' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('public booking channel restrictions', () => {
  const validBooking = {
    locale: 'en',
    slotSnapshotId: 1,
    categoryId: 1,
    vehicleType: 'Truck - Tata 407',
    customerName: 'Test Customer',
    mobile: '9876543210',
    vehicleRegistration: 'HR55AB1234',
    idempotencyKey: 'test-request-0001',
  };

  it('defaults a public booking to WEB', () => {
    const parsed = createHoldSchema.safeParse(validBooking);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.source).toBe('WEB');
  });

  it('rejects a caller trying to create a PHONE booking through the public API', () => {
    expect(createHoldSchema.safeParse({ ...validBooking, source: 'PHONE' }).success).toBe(false);
  });
});
