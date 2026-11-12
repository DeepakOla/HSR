import { describe, expect, it } from 'vitest';
import { validateOrigin } from '../src/lib/security';
import { jsonResponse } from '../src/lib/utils';

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
