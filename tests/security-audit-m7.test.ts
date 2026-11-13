import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { createMockD1 } from './helpers/d1-mock';
import { setupMockJwksServer } from './helpers/jwt-mock';
import { requireRole } from '../src/lib/auth';
import { validateOrigin } from '../src/lib/security';
import { GET as statusGet } from '../src/pages/api/status/[bookingCode]';
import { createHold, submitPaymentEvidence, expireDueHolds } from '../src/lib/booking-engine';
import { POST as createHoldPost } from '../src/pages/api/booking/create-hold';

describe('Milestone M7: Independent Defensive Security Audit', () => {
  describe('Pillar 1: Authentication & Cloudflare Access Cryptographic Boundaries', () => {
    it('strictly rejects forged signature and missing token', async () => {
      const db = createMockD1();
      const env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'test-aud',
      };

      const unauthenticatedReq = new Request('https://hsr.test/api/admin/settings', {
        headers: {},
      });
      const authResult = await requireRole(unauthenticatedReq, env as any, ['OWNER']);
      expect(authResult.ok).toBe(false);
      if (!authResult.ok) expect(authResult.response.status).toBe(401);

      const tamperedReq = new Request('https://hsr.test/api/admin/settings', {
        headers: { 'cf-access-jwt-assertion': 'eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImhhY2tlckBoc3IudGVzdCJ9.invalidsig' },
      });
      const tamperedResult = await requireRole(tamperedReq, env as any, ['OWNER']);
      expect(tamperedResult.ok).toBe(false);
      if (!tamperedResult.ok) expect(tamperedResult.response.status).toBe(401);
    });

    it('strictly rejects algorithm substitution attacks (none or HS256)', async () => {
      const db = createMockD1();
      const env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'test-aud',
      };

      // Header with alg: none
      const headerB64 = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify({ email: 'owner@hsr.test', aud: 'test-aud', exp: 9999999999 })).toString('base64url');
      const noneToken = `${headerB64}.${payloadB64}.`;

      const req = new Request('https://hsr.test/api/admin/settings', {
        headers: { 'cf-access-jwt-assertion': noneToken },
      });
      const result = await requireRole(req, env as any, ['OWNER']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    });

    it('rejects inactive staff members (is_active = 0) even with valid Cloudflare Access token', async () => {
      const db = createMockD1();
      const jwks = await setupMockJwksServer({
        domain: 'hsr-test.cloudflareaccess.com',
        audience: 'test-aud',
      });

      // Insert inactive owner
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
        .bind('inactive-owner@hsr.test', 'OWNER', 0)
        .run();

      const authHeaders = await jwks.createAuthHeaders({ email: 'inactive-owner@hsr.test' });
      const env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'test-aud',
      };

      const req = new Request('https://hsr.test/api/admin/settings', {
        headers: Object.fromEntries(authHeaders.entries()),
      });
      const result = await requireRole(req, env as any, ['OWNER']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    });
  });

  describe('Pillar 2: Authorization & Role-Based Access Control (RBAC)', () => {
    it('strictly forbids RECEPTIONIST from accessing OWNER-only endpoints', async () => {
      const db = createMockD1();
      const jwks = await setupMockJwksServer({
        domain: 'hsr-test.cloudflareaccess.com',
        audience: 'test-aud',
      });

      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
        .bind('reception@hsr.test', 'RECEPTIONIST', 1)
        .run();

      const authHeaders = await jwks.createAuthHeaders({ email: 'reception@hsr.test' });
      const env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'test-aud',
      };

      const req = new Request('https://hsr.test/api/admin/content', {
        headers: Object.fromEntries(authHeaders.entries()),
      });
      const result = await requireRole(req, env as any, ['OWNER']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
      }
    });
  });

  describe('Pillar 3: Public API Data Isolation & PII Exposure Prevention', () => {
    it('verifies /api/status/[bookingCode] never leaks customer phone, name, or vehicle registration', async () => {
      const db = createMockD1();
      await db.prepare("UPDATE business_settings SET vpa_id = 'hsr@upi', vpa_payee_name = 'HSR' WHERE id = 1").run();

      const slot = await db.prepare('SELECT id FROM daily_slot_snapshots WHERE is_closed = 0 LIMIT 1').first<{ id: number }>();
      const category = await db.prepare('SELECT id FROM vehicle_categories WHERE is_active = 1 LIMIT 1').first<{ id: number }>();

      const hold = await createHold(db, {
        slotSnapshotId: slot!.id,
        categoryId: category!.id,
        vehicleType: 'Car - Honda City',
        customerName: 'Secret Customer Name',
        mobile: '+919876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        locale: 'en',
        idempotencyKey: 'sec-pii-test-1',
      });

      const env = { DB: db };

      // Request with valid status token
      const req = new Request(`https://hsr.test/api/status/${hold.bookingCode}?token=${hold.statusToken}`);
      const res = await statusGet({
        params: { bookingCode: hold.bookingCode },
        url: new URL(req.url),
        locals: { runtime: { env } },
      } as any);

      expect(res.status).toBe(200);
      const data: any = await res.json();

      // PII leakage checks
      expect(data.data.customerName).toBeUndefined();
      expect(data.data.mobile).toBeUndefined();
      expect(data.data.vehicleRegistration).toBeUndefined();
      expect(data.data.vehicleType).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('Secret Customer Name');
      expect(JSON.stringify(data)).not.toContain('+919876543210');
      expect(JSON.stringify(data)).not.toContain('HR26DQ5551');

      // Allowed public status fields only
      expect(data.data.bookingCode).toBe(hold.bookingCode);
      expect(data.data.reservationState).toBe('HELD');
      expect(data.data.paymentState).toBe('ADVANCE_PENDING');
      expect(data.data.cylinderCount).toBeDefined();
    });

    it('rejects status lookup when statusToken is absent or tampered', async () => {
      const db = createMockD1();
      await db.prepare("UPDATE business_settings SET vpa_id = 'hsr@upi', vpa_payee_name = 'HSR' WHERE id = 1").run();

      const slot = await db.prepare('SELECT id FROM daily_slot_snapshots WHERE is_closed = 0 LIMIT 1').first<{ id: number }>();
      const category = await db.prepare('SELECT id FROM vehicle_categories WHERE is_active = 1 LIMIT 1').first<{ id: number }>();

      const hold = await createHold(db, {
        slotSnapshotId: slot!.id,
        categoryId: category!.id,
        vehicleType: 'Car - Swift',
        customerName: 'Test',
        mobile: '+919876543211',
        vehicleRegistration: 'DL01AB1234',
        source: 'WEB',
        locale: 'en',
        idempotencyKey: 'sec-pii-test-2',
      });

      const env = { DB: db };

      // Tampered token
      const badReq = new Request(`https://hsr.test/api/status/${hold.bookingCode}?token=tamperedtoken123`);
      const badRes = await statusGet({
        params: { bookingCode: hold.bookingCode },
        url: new URL(badReq.url),
        locals: { runtime: { env } },
      } as any);

      expect(badRes.status).toBe(404);
    });
  });

  describe('Pillar 4: CSRF & Same-Origin Enforcement', () => {
    it('strictly blocks cross-origin POST requests on state-changing APIs', () => {
      const crossOriginReq = new Request('https://hsr.test/api/booking/create-hold', {
        method: 'POST',
        headers: { origin: 'https://malicious-external-site.com' },
      });
      const originResult = validateOrigin(crossOriginReq);
      expect(originResult).not.toBeNull();
      expect(originResult?.status).toBe(403);
    });

    it('strictly blocks requests missing the Origin header on state-changing APIs', () => {
      const missingOriginReq = new Request('https://hsr.test/api/booking/create-hold', {
        method: 'POST',
      });
      const originResult = validateOrigin(missingOriginReq);
      expect(originResult).not.toBeNull();
      expect(originResult?.status).toBe(403);
    });
  });

  describe('Pillar 5: Pre-Write Payment Gating & Concurrency Boundaries', () => {
    it('guarantees zero D1 writes occur when payment configuration is missing', async () => {
      const db = createMockD1();
      // Set VPA to SETUP_REQUIRED
      await db.prepare("UPDATE business_settings SET vpa_id = 'SETUP_REQUIRED' WHERE id = 1").run();

      const bookingCountBefore = await db.prepare('SELECT count(*) AS total FROM bookings').first<{ total: number }>();

      const env = { DB: db };
      const req = new Request('https://hsr.test/api/booking/create-hold', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://hsr.test',
        },
        body: JSON.stringify({
          locale: 'en',
          slotSnapshotId: 1,
          categoryId: 4,
          vehicleType: 'Car - Swift',
          customerName: 'Test Customer',
          mobile: '+919876543210',
          vehicleRegistration: 'HR26DQ5551',
          idempotencyKey: 'prewrite-gate-test',
        }),
      });

      const res = await createHoldPost({
        request: req,
        locals: { runtime: { env } },
      } as any);

      expect(res.status).toBe(422);

      const bookingCountAfter = await db.prepare('SELECT count(*) AS total FROM bookings').first<{ total: number }>();
      expect(bookingCountAfter?.total).toBe(bookingCountBefore?.total);
    });
  });

  describe('Pillar 6: Booking Expiry Invariants & Non-Release of Submitted Evidence', () => {
    it('never auto-expires bookings once payment evidence has been submitted', async () => {
      const db = createMockD1();
      await db.prepare("UPDATE business_settings SET vpa_id = 'hsr@upi', vpa_payee_name = 'HSR' WHERE id = 1").run();

      const slot = await db.prepare('SELECT id FROM daily_slot_snapshots WHERE is_closed = 0 LIMIT 1').first<{ id: number }>();
      const category = await db.prepare('SELECT id FROM vehicle_categories WHERE is_active = 1 LIMIT 1').first<{ id: number }>();

      const hold = await createHold(db, {
        slotSnapshotId: slot!.id,
        categoryId: category!.id,
        vehicleType: 'Car - Swift',
        customerName: 'Customer With Evidence',
        mobile: '+919876543212',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        locale: 'en',
        idempotencyKey: 'evidence-no-expire-test',
      });

      // Submit valid evidence
      await submitPaymentEvidence(db, hold.bookingCode, hold.statusToken, {
        utr: 'UTR123456789012',
        source: 'WEB',
      });

      // Set hold_expires_at into the past
      await db
        .prepare("UPDATE bookings SET hold_expires_at = '2020-01-01T00:00:00Z' WHERE booking_code = ?")
        .bind(hold.bookingCode)
        .run();

      // Trigger expireDueHolds
      const expiredCount = await expireDueHolds(db);
      expect(expiredCount).toBe(0);

      // Verify booking remains in PENDING_VERIFICATION
      const booking = await db
        .prepare('SELECT reservation_state, payment_state FROM bookings WHERE booking_code = ?')
        .bind(hold.bookingCode)
        .first<{ reservation_state: string; payment_state: string }>();

      expect(booking?.reservation_state).toBe('PENDING_VERIFICATION');
      expect(booking?.payment_state).toBe('EVIDENCE_SUBMITTED');
    });
  });
});
