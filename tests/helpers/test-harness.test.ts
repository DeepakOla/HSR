import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getStaffContext, requireRole } from '../../src/lib/auth';
import { SYNTHETIC_DATA, createSyntheticHoldInput } from '../fixtures/synthetic-data';
import { MockD1Database, createMockD1 } from './d1-mock';
import {
  createMockSignedJwt,
  fromBase64Url,
  generateMockKeyPair,
  getDefaultMockKeyPair,
  setupMockJwksServer,
  toBase64Url,
  type MockJwksServer,
} from './jwt-mock';

describe('Test Infrastructure Harness Verification', () => {
  describe('D1 Mock (d1-mock.ts)', () => {
    let db: MockD1Database;

    beforeEach(() => {
      db = createMockD1();
    });

    afterEach(() => {
      db.close();
    });

    it('initializes in-memory database and executes migrations cleanly', async () => {
      // business_settings should be seeded from 0001_init.sql
      const settings = await db
        .prepare('SELECT * FROM business_settings WHERE id = 1')
        .first<{ id: number; vpa_id: string }>();
      expect(settings).not.toBeNull();
      expect(settings?.id).toBe(1);

      // vehicle_categories should contain seeded categories
      const categories = await db
        .prepare('SELECT COUNT(*) as count FROM vehicle_categories')
        .first<{ count: number }>();
      expect(categories?.count).toBeGreaterThanOrEqual(12);

      // daily_slot_snapshots should contain seeded snapshots for horizon
      const snapshots = await db
        .prepare('SELECT COUNT(*) as count FROM daily_slot_snapshots')
        .first<{ count: number }>();
      expect(snapshots?.count).toBeGreaterThan(0);
    });

    it('supports prepare, bind, first, all, run, and raw methods', async () => {
      // test run() with INSERT
      const insertResult = await db
        .prepare('INSERT INTO customers (name, mobile_e164) VALUES (?, ?)')
        .bind('Test Customer', '+919999999999')
        .run();
      expect(insertResult.success).toBe(true);
      expect(insertResult.meta.changes).toBe(1);
      expect(insertResult.meta.last_row_id).toBeGreaterThan(0);

      // test first() with single column and full row
      const customer = await db
        .prepare('SELECT * FROM customers WHERE mobile_e164 = ?')
        .bind('+919999999999')
        .first<{ id: number; name: string }>();
      expect(customer?.name).toBe('Test Customer');

      const customerName = await db
        .prepare('SELECT name FROM customers WHERE mobile_e164 = ?')
        .bind('+919999999999')
        .first<string>('name');
      expect(customerName).toBe('Test Customer');

      // test all()
      const allCustomers = await db
        .prepare('SELECT * FROM customers WHERE mobile_e164 = ?')
        .bind('+919999999999')
        .all<{ name: string }>();
      expect(allCustomers.success).toBe(true);
      expect(allCustomers.results).toHaveLength(1);
      expect(allCustomers.results?.[0].name).toBe('Test Customer');

      // test raw()
      const rawRows = await db
        .prepare('SELECT name, mobile_e164 FROM customers WHERE mobile_e164 = ?')
        .bind('+919999999999')
        .raw<string>();
      expect(rawRows).toHaveLength(1);
      expect(rawRows[0]).toEqual(['Test Customer', '+919999999999']);
    });

    it('normalizes booleans to 1/0 and undefined to null in bind parameters', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
        .bind('test-bool@hsr.internal', 'OWNER', true)
        .run();

      const user = await db
        .prepare('SELECT is_active FROM staff_users WHERE email = ?')
        .bind('test-bool@hsr.internal')
        .first<{ is_active: number }>();
      expect(user?.is_active).toBe(1);

      // Test undefined normalization
      await db
        .prepare('INSERT INTO customers (name, mobile_e164) VALUES (?, ?)')
        .bind('Undefined Mobile', undefined)
        .run()
        .catch(() => {
          // NOT NULL constraint on mobile_e164 should fail if undefined was bound as null
        });

      const failedCust = await db
        .prepare('SELECT * FROM customers WHERE name = ?')
        .bind('Undefined Mobile')
        .first();
      expect(failedCust).toBeNull();
    });

    it('enforces foreign key constraints strictly', async () => {
      // Attempting to insert a booking with a non-existent customer_id should abort
      await expect(
        db
          .prepare(
            `INSERT INTO bookings (
              booking_code, status_token_hash, source, reservation_state, payment_state,
              hold_expires_at, service_date, slot_snapshot_id, customer_id, vehicle_id,
              category_id, vehicle_type_snapshot, category_name_en_snapshot, category_name_hi_snapshot,
              cylinder_count_snapshot, base_price_paise_snapshot, gst_rate_bps_snapshot,
              gst_amount_paise_snapshot, total_price_paise_snapshot, advance_paise_snapshot,
              balance_paise_snapshot, slot_label_en_snapshot, slot_label_hi_snapshot,
              slot_start_snapshot, slot_end_snapshot, slot_capacity_snapshot,
              daily_capacity_snapshot, config_version_snapshot
            ) VALUES (
              'BK-TEST-FK', 'hash', 'WEB', 'HELD', 'ADVANCE_PENDING',
              '2026-11-13T10:00:00Z', '2026-11-13', 1, 999999, 999999,
              1, 'Car', '1 Cylinder', '1 सिलेंडर',
              1, 250000, 1800, 45000, 295000, 50000, 245000,
              '10:00', '10:00', '10:00', '10:20', 1, 24, 1
            )`
          )
          .run()
      ).rejects.toThrow();
    });

    it('executes atomic batch() and rolls back all statements on failure', async () => {
      const initialCount = (
        await db.prepare('SELECT COUNT(*) as c FROM customers').first<{ c: number }>()
      )?.c;

      // Batch with valid first insert and invalid second insert (duplicate mobile_e164 violating UNIQUE constraint)
      await expect(
        db.batch([
          db
            .prepare('INSERT INTO customers (name, mobile_e164) VALUES (?, ?)')
            .bind('Batch Customer 1', '+918888888881'),
          db
            .prepare('INSERT INTO customers (name, mobile_e164) VALUES (?, ?)')
            .bind('Batch Customer 2', '+918888888881'), // Duplicate phone fails UNIQUE constraint
        ])
      ).rejects.toThrow();

      // Ensure transaction rolled back completely
      const countAfter = (
        await db.prepare('SELECT COUNT(*) as c FROM customers').first<{ c: number }>()
      )?.c;
      expect(countAfter).toBe(initialCount);

      const rollbackCustomer = await db
        .prepare('SELECT * FROM customers WHERE mobile_e164 = ?')
        .bind('+918888888881')
        .first();
      expect(rollbackCustomer).toBeNull();
    });

    it('enforces bookings_capacity_guard trigger constraints', async () => {
      // 1. Create a customer and vehicle
      await db
        .prepare('INSERT INTO customers (name, mobile_e164) VALUES (?, ?)')
        .bind('Trigger Customer', '+917777777771')
        .run();
      const customerId = (
        await db
          .prepare('SELECT id FROM customers WHERE mobile_e164 = ?')
          .bind('+917777777771')
          .first<{ id: number }>()
      )?.id;

      await db
        .prepare(
          'INSERT INTO vehicles (registration_normalized, registration_display, vehicle_type) VALUES (?, ?, ?)'
        )
        .bind('DL01TR1234', 'DL 01 TR 1234', 'Car')
        .run();
      const vehicleId = (
        await db
          .prepare('SELECT id FROM vehicles WHERE registration_normalized = ?')
          .bind('DL01TR1234')
          .first<{ id: number }>()
      )?.id;

      const slot = await db
        .prepare(
          'SELECT id, service_date, start_time, end_time FROM daily_slot_snapshots WHERE is_closed = 0 AND is_public = 1 LIMIT 1'
        )
        .first<{ id: number; service_date: string; start_time: string; end_time: string }>();
      expect(slot).not.toBeNull();

      // Trigger Test 1: CYLINDER_COUNT_OUT_OF_RANGE (> 20)
      await expect(
        db
          .prepare(
            `INSERT INTO bookings (
              booking_code, status_token_hash, source, reservation_state, payment_state,
              hold_expires_at, service_date, slot_snapshot_id, customer_id, vehicle_id,
              category_id, vehicle_type_snapshot, category_name_en_snapshot, category_name_hi_snapshot,
              cylinder_count_snapshot, base_price_paise_snapshot, gst_rate_bps_snapshot,
              gst_amount_paise_snapshot, total_price_paise_snapshot, advance_paise_snapshot,
              balance_paise_snapshot, slot_label_en_snapshot, slot_label_hi_snapshot,
              slot_start_snapshot, slot_end_snapshot, slot_capacity_snapshot,
              daily_capacity_snapshot, config_version_snapshot
            ) VALUES (
              'BK-RANGE-FAIL', 'hash', 'WEB', 'HELD', 'ADVANCE_PENDING',
              '2026-11-13T10:00:00Z', ?, ?, ?, ?,
              1, 'Car', '1 Cylinder', '1 सिलेंडर',
              25, 250000, 1800, 45000, 295000, 50000, 245000,
              '10:00', '10:00', ?, ?, 1, 24, 1
            )`
          )
          .bind(slot?.service_date, slot?.id, customerId, vehicleId, slot?.start_time, slot?.end_time)
          .run()
      ).rejects.toThrow(/CYLINDER_COUNT_OUT_OF_RANGE/);

      // Trigger Test 2: Closed slot snapshot (SLOT_CLOSED_OR_PRIVATE)
      await db
        .prepare('UPDATE daily_slot_snapshots SET is_closed = 1 WHERE id = ?')
        .bind(slot?.id)
        .run();

      await expect(
        db
          .prepare(
            `INSERT INTO bookings (
              booking_code, status_token_hash, source, reservation_state, payment_state,
              hold_expires_at, service_date, slot_snapshot_id, customer_id, vehicle_id,
              category_id, vehicle_type_snapshot, category_name_en_snapshot, category_name_hi_snapshot,
              cylinder_count_snapshot, base_price_paise_snapshot, gst_rate_bps_snapshot,
              gst_amount_paise_snapshot, total_price_paise_snapshot, advance_paise_snapshot,
              balance_paise_snapshot, slot_label_en_snapshot, slot_label_hi_snapshot,
              slot_start_snapshot, slot_end_snapshot, slot_capacity_snapshot,
              daily_capacity_snapshot, config_version_snapshot
            ) VALUES (
              'BK-CLOSED-FAIL', 'hash', 'WEB', 'HELD', 'ADVANCE_PENDING',
              '2026-11-13T10:00:00Z', ?, ?, ?, ?,
              1, 'Car', '1 Cylinder', '1 सिलेंडर',
              1, 250000, 1800, 45000, 295000, 50000, 245000,
              '10:00', '10:00', ?, ?, 1, 24, 1
            )`
          )
          .bind(slot?.service_date, slot?.id, customerId, vehicleId, slot?.start_time, slot?.end_time)
          .run()
      ).rejects.toThrow(/SLOT_CLOSED_OR_PRIVATE/);
    });
  });

  describe('JWT Mock & Cloudflare Access Auth (jwt-mock.ts)', () => {
    let jwksServer: MockJwksServer;
    let db: MockD1Database;
    const testDomain = 'hsr-test.cloudflareaccess.com';
    const testAudience = 'hsr-test-audience-tag';

    const testEnv: Env = {
      DB: null as unknown as D1Database,
      ACCESS_TEAM_DOMAIN: testDomain,
      ACCESS_AUDIENCE: testAudience,
    };

    beforeEach(async () => {
      db = createMockD1();
      testEnv.DB = db;
      jwksServer = await setupMockJwksServer({
        domain: testDomain,
        audience: testAudience,
      });
    });

    afterEach(() => {
      jwksServer.uninstall();
      db.close();
    });

    it('correctly encodes and decodes base64url', () => {
      const original = 'Hello, HSR Green Energy! 12345';
      const encoded = toBase64Url(original);
      const decoded = fromBase64Url(encoded);
      expect(decoded).toBe(original);
    });

    it('generates genuine RSA keypair and produces verifiable signatures', async () => {
      const kp = await getDefaultMockKeyPair();
      expect(kp.kid).toBeTruthy();
      expect(kp.publicJwk.kty).toBe('RSA');
      expect(kp.publicJwk.alg).toBe('RS256');
    });

    it('successfully verifies a valid signed JWT assertion using getStaffContext', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).not.toBeNull();
      expect(context?.email).toBe('owner@hsr-test.internal');
      expect(context?.role).toBe('OWNER');
    });

    it('supports audience as array of strings in claims', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
        audience: ['other-app-tag', testAudience],
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).not.toBeNull();
      expect(context?.email).toBe('owner@hsr-test.internal');
    });

    it('normalizes email to lowercase during verification', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner.upper@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'Owner.Upper@HSR-TEST.Internal',
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).not.toBeNull();
      expect(context?.email).toBe('owner.upper@hsr-test.internal');
    });

    it('rejects expired token (exp in past)', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
        expiresInSeconds: -10, // expired 10 seconds ago
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).toBeNull();

      const roleResult = await requireRole(request, testEnv, ['OWNER']);
      expect(roleResult.ok).toBe(false);
      if (!roleResult.ok) {
        expect(roleResult.response.status).toBe(401);
      }
    });

    it('rejects token with not-before in the future (nbf > now)', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
        nbfOffsetSeconds: 300, // valid in 5 minutes
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).toBeNull();
    });

    it('rejects token with excessive future drift (iat > now + 60)', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
        iatOffsetSeconds: 120, // 2 minutes future drift
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).toBeNull();
    });

    it('rejects token with wrong algorithm or unsupported header', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
        algorithm: 'HS256',
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).toBeNull();
    });

    it('rejects token with mismatched audience', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
        audience: 'wrong-audience-tag',
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).toBeNull();
    });

    it('rejects token with tampered signature', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const token = await jwksServer.createToken({
        email: 'owner@hsr-test.internal',
      });
      const parts = token.split('.');
      // Tamper signature byte
      const tamperedSignature = parts[2].slice(0, -4) + 'AAAA';
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': tamperedToken,
        },
      });

      const context = await getStaffContext(request, testEnv);
      expect(context).toBeNull();
    });

    it('rejects token when JWKS endpoint returns HTTP 500 error', async () => {
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      // Create server returning 500
      const errorServer = await setupMockJwksServer({
        domain: 'hsr-error.cloudflareaccess.com',
        status: 500,
      });

      const envWithErrorDomain: Env = {
        DB: db,
        ACCESS_TEAM_DOMAIN: 'hsr-error.cloudflareaccess.com',
        ACCESS_AUDIENCE: testAudience,
      };

      const token = await errorServer.createToken({
        issuer: 'https://hsr-error.cloudflareaccess.com',
        email: 'owner@hsr-test.internal',
      });

      const request = new Request('https://hsrgreenenergy.com/api/admin/schedule', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const context = await getStaffContext(request, envWithErrorDomain);
      expect(context).toBeNull();

      errorServer.uninstall();
    });

    it('verifies staff context and enforces OWNER role correctly with requireRole', async () => {
      // 1. Seed active owner in staff_users table
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('owner@hsr-test.internal', 'OWNER')
        .run();

      const request = await jwksServer.createAuthRequest(
        'https://hsrgreenenergy.com/api/admin/schedule',
        {},
        { email: 'owner@hsr-test.internal' }
      );

      // Verify getStaffContext
      const staffContext = await getStaffContext(request, testEnv);
      expect(staffContext).toEqual({
        email: 'owner@hsr-test.internal',
        role: 'OWNER',
      });

      // Verify requireRole
      const roleResult = await requireRole(request, testEnv, ['OWNER']);
      expect(roleResult.ok).toBe(true);
      if (roleResult.ok) {
        expect(roleResult.staff.role).toBe('OWNER');
      }
    });

    it('enforces role restriction: RECEPTIONIST forbidden on OWNER-only endpoints', async () => {
      // Seed receptionist
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1)')
        .bind('receptionist@hsr-test.internal', 'RECEPTIONIST')
        .run();

      const request = await jwksServer.createAuthRequest(
        'https://hsrgreenenergy.com/api/admin/schedule',
        {},
        { email: 'receptionist@hsr-test.internal' }
      );

      // RECEPTIONIST accessing OWNER-only API
      const roleResult = await requireRole(request, testEnv, ['OWNER']);
      expect(roleResult.ok).toBe(false);
      if (!roleResult.ok) {
        expect(roleResult.response.status).toBe(403);
      }
    });

    it('rejects inactive staff user even with valid JWT assertion', async () => {
      // Seed inactive owner
      await db
        .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 0)')
        .bind('inactive@hsr-test.internal', 'OWNER')
        .run();

      const request = await jwksServer.createAuthRequest(
        'https://hsrgreenenergy.com/api/admin/schedule',
        {},
        { email: 'inactive@hsr-test.internal' }
      );

      const staffContext = await getStaffContext(request, testEnv);
      expect(staffContext).toBeNull();

      const roleResult = await requireRole(request, testEnv, ['OWNER']);
      expect(roleResult.ok).toBe(false);
      if (!roleResult.ok) {
        expect(roleResult.response.status).toBe(401);
      }
    });
  });

  describe('Synthetic Fixtures (synthetic-data.ts)', () => {
    it('provides valid synthetic customer profiles conforming to contracts', () => {
      const { standard, hindi, formattedSpaced } = SYNTHETIC_DATA.customers;
      expect(standard.mobile).toBe('9876543210');
      expect(standard.expectedE164).toBe('+919876543210');
      expect(hindi.expectedE164).toBe('+919123456789');
      expect(formattedSpaced.expectedE164).toBe('+919876543210');
    });

    it('provides standardized synthetic vehicles covering State and Bharat series', () => {
      const { delhiCar, haryanaTruck, bharatSeriesCar } = SYNTHETIC_DATA.vehicles;
      expect(delhiCar.format).toBe('STATE_SERIES');
      expect(delhiCar.normalized).toBe('DL01AB1234');
      expect(haryanaTruck.type).toBe('Truck');
      expect(bharatSeriesCar.format).toBe('BH_SERIES');
      expect(bharatSeriesCar.normalized).toBe('22BH1234AA');
    });

    it('creates complete synthetic hold payload via createSyntheticHoldInput helper', () => {
      const payload = createSyntheticHoldInput({
        customerName: 'Custom Name',
        vehicleType: 'LCV',
      });

      expect(payload.customerName).toBe('Custom Name');
      expect(payload.vehicleType).toBe('LCV');
      expect(payload.source).toBe('WEB');
      expect(payload.idempotencyKey).toBeTruthy();
    });
  });
});
