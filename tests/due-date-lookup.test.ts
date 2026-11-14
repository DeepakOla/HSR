import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { GET as dueDateLookupGet } from '../src/pages/api/public/due-date-lookup';
import { createMockD1 } from './helpers/d1-mock';

describe('Public CNG Due-Date & Expiry Lookup API', () => {
  it('returns 400 if no query parameters provided', async () => {
    const db = createMockD1();
    const req = new Request('http://localhost:4321/api/public/due-date-lookup/');
    const res = await dueDateLookupGet({ request: req, url: new URL(req.url), locals: { runtime: { env: { DB: db } } } } as any);

    expect(res.status).toBe(400);
  });

  it('performs manual date calculation when lastTestDate is provided', async () => {
    const db = createMockD1();
    const req = new Request('http://localhost:4321/api/public/due-date-lookup/?lastTestDate=2024-05-10');
    const res = await dueDateLookupGet({ request: req, url: new URL(req.url), locals: { runtime: { env: { DB: db } } } } as any);

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.found).toBe(true);
    expect(json.data.records[0].nextDueDate).toBe('2027-05-10');
    expect(json.data.records[0].status).toBe('VALID');
  });

  it('queries database for vehicle registration and returns record with zero PII leakage', async () => {
    const db = createMockD1();

    // Seed vehicle and cylinder register
    await db
      .prepare('INSERT INTO vehicles (id, registration_normalized, registration_display) VALUES (?, ?, ?)')
      .bind(101, 'HR26DQ1234', 'HR 26 DQ 1234')
      .run();

    await db
      .prepare(`INSERT INTO cylinder_register (
        id, vehicle_id, cylinder_serial, manufacturer, actual_periodic_test_date, next_retest_due_date, test_result, certificate_reference
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(201, 101, 'CYL-99881', 'EKC', '2025-06-15', '2028-06-15', 'PASS', 'HSR-CERT-2025-001')
      .run();

    const req = new Request('http://localhost:4321/api/public/due-date-lookup/?regNumber=HR26DQ1234');
    const res = await dueDateLookupGet({ request: req, url: new URL(req.url), locals: { runtime: { env: { DB: db } } } } as any);

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.found).toBe(true);
    expect(json.data.records.length).toBe(1);

    const record = json.data.records[0];
    expect(record.registration).toBe('HR 26 DQ 1234');
    expect(record.lastTestDate).toBe('2025-06-15');
    expect(record.nextDueDate).toBe('2028-06-15');
    expect(record.status).toBe('VALID');

    // CRITICAL SECURITY INVARIANT: Zero PII Leakage
    const rawJson = JSON.stringify(json);
    expect(rawJson).not.toContain('customer');
    expect(rawJson).not.toContain('mobile_e164');
    expect(rawJson).not.toContain('email');
    expect(rawJson).not.toContain('address');
  });

  it('returns graceful not found response when vehicle is not in database', async () => {
    const db = createMockD1();
    const req = new Request('http://localhost:4321/api/public/due-date-lookup/?regNumber=DL01AB9999');
    const res = await dueDateLookupGet({ request: req, url: new URL(req.url), locals: { runtime: { env: { DB: db } } } } as any);

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.found).toBe(false);
    expect(json.data.registration).toBe('DL01AB9999');
    expect(json.data.message).toContain('DL01AB9999');
  });
});
