import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { POST as manualBookingPost } from '../src/pages/api/admin/manual-bookings';
import { POST as registerPost } from '../src/pages/api/admin/register';
import { createMockD1 } from './helpers/d1-mock';
import { setupMockJwksServer } from './helpers/jwt-mock';
import { createHold } from '../src/lib/booking-engine';

describe('Milestone M4: Administrative Navigation & Validation Parity', () => {
  describe('Footer Staff Link & Admin Navigation', () => {
    it('verifies footer staff login link text for English and Hindi in BaseLayout', async () => {
      const fs = await import('node:fs/promises');
      const baseLayoutSource = await fs.readFile('src/layouts/BaseLayout.astro', 'utf-8');

      expect(baseLayoutSource).toContain('/admin/login/');
      expect(baseLayoutSource).toContain('Staff / Admin Login');
      expect(baseLayoutSource).toContain('कर्मचारी / एडमिन लॉगिन');
    });

    it('verifies /admin/login.astro contains links to reception and owner portals with trailing slashes', async () => {
      const fs = await import('node:fs/promises');
      const loginSource = await fs.readFile('src/pages/admin/login.astro', 'utf-8');

      expect(loginSource).toContain('href="/admin/reception/"');
      expect(loginSource).toContain('href="/admin/owner/"');
    });
  });

  describe('Receptionist Manual Booking Registration Validation', () => {
    async function setupHarness() {
      const db = createMockD1();
      const jwks = await setupMockJwksServer({
        domain: 'hsr-test.cloudflareaccess.com',
        audience: 'test-aud',
      });

      // Insert active receptionist
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
        .bind('reception@hsr.test', 'RECEPTIONIST', 1)
        .run();

      const authHeaders = await jwks.createAuthHeaders({ email: 'reception@hsr.test' });

      // Get slot and category
      const slot = await db
        .prepare('SELECT id FROM daily_slot_snapshots WHERE is_closed = 0 LIMIT 1')
        .first<{ id: number }>();
      const category = await db
        .prepare('SELECT id FROM vehicle_categories WHERE is_active = 1 LIMIT 1')
        .first<{ id: number }>();

      const env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'test-aud',
      };

      return { db, jwks, authHeaders, slotId: slot!.id, categoryId: category!.id, env };
    }

    it('accepts valid State registration (DL01AB1234) and normalizes it', async () => {
      const { env, authHeaders, slotId, categoryId } = await setupHarness();

      const req = new Request('https://example.com/api/admin/manual-bookings', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          locale: 'en',
          slotSnapshotId: slotId,
          categoryId,
          vehicleType: 'Car - Swift',
          customerName: 'Aarav Sharma',
          mobile: '+919876543210',
          vehicleRegistration: 'dl-01-ab-1234',
          source: 'PHONE',
          paymentCollected: true,
          idempotencyKey: 'test-manual-dl-1',
        }),
      });

      const res = await manualBookingPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(201);
      const json: any = await res.json();
      expect(json.data.bookingCode).toBeDefined();

      // Verify in DB that normalized registration DL01AB1234 was stored
      const vehicle = await env.DB
        .prepare('SELECT registration_normalized FROM vehicles WHERE registration_normalized = ?')
        .bind('DL01AB1234')
        .first<{ registration_normalized: string }>();
      expect(vehicle?.registration_normalized).toBe('DL01AB1234');
    });

    it('accepts valid Bharat (BH) series registration (22BH1234AA)', async () => {
      const { env, authHeaders, slotId, categoryId } = await setupHarness();

      const req = new Request('https://example.com/api/admin/manual-bookings', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          locale: 'en',
          slotSnapshotId: slotId,
          categoryId,
          vehicleType: 'Car - Creta',
          customerName: 'Priya Verma',
          mobile: '+919876543211',
          vehicleRegistration: '22 bh 1234 aa',
          source: 'WALKIN',
          paymentCollected: false,
          idempotencyKey: 'test-manual-bh-1',
        }),
      });

      const res = await manualBookingPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(201);
    });

    it('rejects invalid vehicle registration with English error message when locale=en', async () => {
      const { env, authHeaders, slotId, categoryId } = await setupHarness();

      const req = new Request('https://example.com/api/admin/manual-bookings', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          locale: 'en',
          slotSnapshotId: slotId,
          categoryId,
          vehicleType: 'Car - WagonR',
          customerName: 'Invalid Reg Test',
          mobile: '+919876543212',
          vehicleRegistration: 'INVALID-CAR',
          source: 'PHONE',
          paymentCollected: false,
          idempotencyKey: 'test-manual-invalid-en',
        }),
      });

      const res = await manualBookingPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.error.code).toBe('INVALID_VEHICLE_REGISTRATION');
      expect(json.error.message).toContain('valid Indian vehicle registration');
    });

    it('rejects invalid vehicle registration with Hindi error message when locale=hi', async () => {
      const { env, authHeaders, slotId, categoryId } = await setupHarness();

      const req = new Request('https://example.com/api/admin/manual-bookings', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          locale: 'hi',
          slotSnapshotId: slotId,
          categoryId,
          vehicleType: 'Car - WagonR',
          customerName: 'अमान्य वाहन',
          mobile: '+919876543213',
          vehicleRegistration: '12345',
          source: 'WHATSAPP',
          paymentCollected: false,
          idempotencyKey: 'test-manual-invalid-hi',
        }),
      });

      const res = await manualBookingPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.error.code).toBe('INVALID_VEHICLE_REGISTRATION');
      expect(json.error.message).toContain('मान्य भारतीय वाहन पंजीकरण');
    });
  });

  describe('Cylinder Register Registration Validation', () => {
    async function setupRegisterHarness() {
      const db = createMockD1();
      const jwks = await setupMockJwksServer({
        domain: 'hsr-test.cloudflareaccess.com',
        audience: 'test-aud',
      });

      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
        .bind('staff@hsr.test', 'RECEPTIONIST', 1)
        .run();

      const authHeaders = await jwks.createAuthHeaders({ email: 'staff@hsr.test' });

      const slot = await db.prepare('SELECT id, service_date FROM daily_slot_snapshots WHERE is_closed = 0 LIMIT 1').first<{ id: number; service_date: string }>();
      const category = await db.prepare('SELECT id FROM vehicle_categories WHERE is_active = 1 LIMIT 1').first<{ id: number }>();

      const hold = await createHold(db, {
        slotSnapshotId: slot!.id,
        categoryId: category!.id,
        vehicleType: 'Car - Creta',
        customerName: 'Test Customer',
        mobile: '+919876543214',
        vehicleRegistration: 'HR26DQ5551',
        locale: 'en',
        source: 'WALKIN',
        reservationState: 'CONFIRMED',
        paymentState: 'PAID_AT_COUNTER',
        idempotencyKey: 'test-reg-hold-1',
      });
      await db.prepare("UPDATE bookings SET reservation_state = 'COMPLETED' WHERE booking_code = ?").bind(hold.bookingCode).run();

      const env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'test-aud',
      };

      return { db, env, authHeaders, bookingCode: hold.bookingCode };
    }

    it('rejects invalid vehicle registration format upfront with INVALID_VEHICLE_REGISTRATION', async () => {
      const { env, authHeaders, bookingCode } = await setupRegisterHarness();

      const req = new Request('https://example.com/api/admin/register', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          bookingCode,
          vehicleRegistration: 'NOT-A-REGISTRATION',
          cylinderSerial: 'CYL-1234',
          actualPeriodicTestDate: '2026-11-13',
          testResult: 'PASS',
        }),
      });

      const res = await registerPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.error.code).toBe('INVALID_VEHICLE_REGISTRATION');
    });

    it('rejects valid format that does not match the booking with VEHICLE_MISMATCH', async () => {
      const { env, authHeaders, bookingCode } = await setupRegisterHarness();

      const req = new Request('https://example.com/api/admin/register', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          bookingCode,
          vehicleRegistration: 'DL01AB1234', // Valid format, but booking has HR26DQ5551
          cylinderSerial: 'CYL-1234',
          actualPeriodicTestDate: '2026-11-13',
          testResult: 'PASS',
        }),
      });

      const res = await registerPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.error.code).toBe('VEHICLE_MISMATCH');
    });

    it('accepts valid registration matching the booking (with unnormalized input format)', async () => {
      const { env, authHeaders, bookingCode } = await setupRegisterHarness();

      const req = new Request('https://example.com/api/admin/register', {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({
          bookingCode,
          vehicleRegistration: 'hr-26-dq-5551', // Valid format with hyphens and lowercase
          cylinderSerial: 'CYL-9999',
          actualPeriodicTestDate: '2026-11-13',
          testResult: 'PASS',
        }),
      });

      const res = await registerPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(201);
      const json: any = await res.json();
      expect(json.data.nextRetestDueDate).toBeDefined();
    });
  });
});
