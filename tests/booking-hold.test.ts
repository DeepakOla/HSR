import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { POST } from '../src/pages/api/booking/create-hold';
import { createHold } from '../src/lib/booking-engine';
import { createMockD1, type MockD1Database } from './helpers/d1-mock';

let ipCounter = 1;
function nextClientIp(): string {
  return `10.42.0.${ipCounter++}`;
}

async function invokeCreateHold(
  db: MockD1Database,
  payload: Record<string, unknown>,
  clientIp = nextClientIp()
): Promise<Response> {
  const request = new Request('https://hsr.example/api/booking/create-hold', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://hsr.example',
      'cf-connecting-ip': clientIp,
    },
    body: JSON.stringify(payload),
  });

  const locals = {
    runtime: {
      env: {
        DB: db,
      },
    },
  } as unknown as App.Locals;

  return POST({ request, locals } as any);
}

describe('Booking Hold Creation & Pre-Write Payment Gate (M2)', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = createMockD1();
  });

  afterEach(() => {
    db.close();
  });

  // Helper to enable UPI payment in business_settings
  async function configureUpi(vpaId = 'hsr@okaxis', payeeName = 'HSR') {
    await db
      .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
      .bind(vpaId, payeeName)
      .run();
  }

  describe('Pre-Write Payment Gate', () => {
    it('fails closed with HTTP 422 when VPA is SETUP_REQUIRED', async () => {
      // Default migration state: vpa_id and vpa_payee_name are 'SETUP_REQUIRED'
      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4, // 1 cylinder
        vehicleType: 'Car',
        customerName: 'Aarav Sharma',
        mobile: '9876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        idempotencyKey: 'idemp-gate-001',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(422);

      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(json.error.message).toContain('Online advance payment is currently being configured');
      expect(json.contact).toBeDefined();
      expect(json.contact.phone).toBe('+919910055355');
      expect(json.contact.whatsapp).toBe('+919910055355');
      expect(json.contact.whatsappUrl).toContain('wa.me/919910055355');
    });

    it('returns localized Hindi message when locale is hi', async () => {
      const payload = {
        locale: 'hi',
        slotSnapshotId: 185,
        categoryId: 4,
        vehicleType: 'Car',
        customerName: 'आरव शर्मा',
        mobile: '9876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        idempotencyKey: 'idemp-gate-002',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(422);

      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(json.error.message).toContain('ऑनलाइन अग्रिम भुगतान वर्तमान में सेटअप किया जा रहा है');
    });

    it('asserts ZERO D1 writes occur after payment gate rejection', async () => {
      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4,
        vehicleType: 'Car',
        customerName: 'Aarav Sharma',
        mobile: '9876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        idempotencyKey: 'idemp-zero-writes',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(422);

      const bookings = await db.prepare('SELECT COUNT(*) as c FROM bookings').first<{ c: number }>();
      expect(bookings?.c).toBe(0);

      const allocations = await db.prepare('SELECT COUNT(*) as c FROM booking_slot_allocations').first<{ c: number }>();
      expect(allocations?.c).toBe(0);

      const customers = await db.prepare('SELECT COUNT(*) as c FROM customers').first<{ c: number }>();
      expect(customers?.c).toBe(0);

      const vehicles = await db.prepare('SELECT COUNT(*) as c FROM vehicles').first<{ c: number }>();
      expect(vehicles?.c).toBe(0);

      const audit = await db.prepare('SELECT COUNT(*) as c FROM booking_audit_events').first<{ c: number }>();
      expect(audit?.c).toBe(0);

      const idemp = await db.prepare('SELECT COUNT(*) as c FROM idempotency_keys').first<{ c: number }>();
      expect(idemp?.c).toBe(0);
    });

    it('rejects when VPA is empty or whitespace only', async () => {
      await configureUpi('   ', 'HSR Centre');

      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4,
        vehicleType: 'Car',
        customerName: 'Aarav Sharma',
        mobile: '9876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        idempotencyKey: 'idemp-empty-vpa',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    });

    it('rejects when payee name is SETUP_REQUIRED even if VPA is set', async () => {
      await configureUpi('hsr@okaxis', 'SETUP_REQUIRED');

      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4,
        vehicleType: 'Car',
        customerName: 'Aarav Sharma',
        mobile: '9876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        idempotencyKey: 'idemp-unset-payee',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    });

    it('passes gate when UPI is properly configured and returns UPI QR code', async () => {
      await configureUpi('hsr@okaxis', 'HSR Testing');

      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4, // 1 cylinder
        vehicleType: 'Car',
        customerName: 'Aarav Sharma',
        mobile: '9876543210',
        vehicleRegistration: 'HR26DQ5551',
        source: 'WEB',
        idempotencyKey: 'idemp-gate-pass',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(201);

      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.bookingCode).toMatch(/^HSR-\d{6}-[A-F0-9]{6}$/);
      expect(json.data.upiUri).toContain('upi://pay?');
      expect(json.data.upiUri).toContain('pa=hsr%40okaxis');
      expect(json.data.upiUri).toContain('pn=HSR+Testing');
      expect(json.data.upiUri).toContain('am=500.00'); // Flat ₹500
      expect(json.data.upiQrDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('Server-Side Public Cylinder Limit', () => {
    beforeEach(async () => {
      await configureUpi();
    });

    it.each([
      [4, 1], // category 4 = 1 cylinder
      [5, 2], // category 5 = 2 cylinders
      [7, 4], // category 7 = 4 cylinders
      [9, 6], // category 9 = 6 cylinders
    ])('accepts public online booking for category %i (%i cylinder(s))', async (categoryId, _cyls) => {
      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId,
        vehicleType: 'Truck',
        customerName: 'Balwan Singh',
        mobile: '9876543211',
        vehicleRegistration: 'HR26DQ5552',
        source: 'WEB',
        idempotencyKey: `idemp-public-cyl-${categoryId}`,
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
    });

    it('rejects public tampering with 7 cylinders (category 10) with HTTP 400', async () => {
      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 10, // 7 cylinders
        vehicleType: 'Heavy Truck',
        customerName: 'Tamper Tester',
        mobile: '9876543212',
        vehicleRegistration: 'HR26DQ5553',
        source: 'WEB',
        idempotencyKey: 'idemp-tamper-7cyl',
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(400);

      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('PUBLIC_CYLINDER_LIMIT_EXCEEDED');
      expect(json.error.message).toContain('Online self-service booking is limited to a maximum of 6 cylinders');
      expect(json.contact.phone).toBe('+919910055355');

      // Assert zero database writes for tampered booking
      const bookings = await db.prepare('SELECT COUNT(*) as c FROM bookings').first<{ c: number }>();
      expect(bookings?.c).toBe(0);
    });

    it.each([11, 12, 13, 14, 15])(
      'rejects public tampering for category %i (8–12 cylinders)',
      async (categoryId) => {
        const payload = {
          locale: 'en',
          slotSnapshotId: 185,
          categoryId,
          vehicleType: 'Heavy Vehicle',
          customerName: 'Tamper Tester',
          mobile: '9876543213',
          vehicleRegistration: 'HR26DQ5554',
          source: 'WEB',
          idempotencyKey: `idemp-tamper-${categoryId}`,
        };

        const res = await invokeCreateHold(db, payload);
        expect(res.status).toBe(400);
        const json = (await res.json()) as any;
        expect(json.error.code).toBe('PUBLIC_CYLINDER_LIMIT_EXCEEDED');
      }
    );

    it('allows reception staff to book 7–12 cylinders (PHONE/WALKIN)', async () => {
      // Receptionist creates 8-cylinder booking directly via engine
      const result = await createHold(db, {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 11, // 8 cylinders
        vehicleType: 'Commercial Bus',
        customerName: 'Depot Fleet Manager',
        mobile: '9876543214',
        vehicleRegistration: 'HR26DQ5555',
        source: 'PHONE',
        idempotencyKey: 'idemp-phone-8cyl',
      });

      expect(result.bookingCode).toBeDefined();
      expect(result.category.cylinderCount).toBe(8);

      const row = await db
        .prepare('SELECT cylinder_count_snapshot, source FROM bookings WHERE booking_code = ?')
        .bind(result.bookingCode)
        .first<{ cylinder_count_snapshot: number; source: string }>();

      expect(row?.cylinder_count_snapshot).toBe(8);
      expect(row?.source).toBe('PHONE');
    });
  });

  describe('Vehicle Registration Validation & Normalization', () => {
    beforeEach(async () => {
      await configureUpi();
    });

    it.each([
      ['DL01AB1234', 'DL01AB1234'],
      ['hr26dq5551', 'HR26DQ5551'],
      ['MH-12-CD-9999', 'MH12CD9999'],
      ['up 32 ab 1234', 'UP32AB1234'],
      ['22BH1234AA', '22BH1234AA'],
      ['21bh9999z', '21BH9999Z'],
      ['23 BH 5555 AB', '23BH5555AB'],
    ])('accepts valid registration %s and stores normalized as %s', async (inputReg, expectedStored) => {
      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4,
        vehicleType: 'Car',
        customerName: 'Chhavi Gupta',
        mobile: '9876543220',
        vehicleRegistration: inputReg,
        source: 'WEB',
        idempotencyKey: `idemp-reg-${inputReg}`,
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(201);

      const json = (await res.json()) as any;
      const bookingCode = json.data.bookingCode;

      const vehicle = await db
        .prepare(
          'SELECT v.registration_normalized, v.registration_display FROM vehicles v JOIN bookings b ON b.vehicle_id = v.id WHERE b.booking_code = ?'
        )
        .bind(bookingCode)
        .first<{ registration_normalized: string; registration_display: string }>();

      expect(vehicle?.registration_normalized).toBe(expectedStored);
    });

    it.each([
      'GARBAGE123',
      '1234',
      'TEST1234',
      'DL1',
      'NOT A NUMBER',
      'ABCDEFGHIJKLMNO',
      'DL01AB12345',
      '',
    ])('rejects invalid registration "%s" with HTTP 400 and zero D1 writes', async (invalidReg) => {
      const payload = {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4,
        vehicleType: 'Car',
        customerName: 'Chhavi Gupta',
        mobile: '9876543221',
        vehicleRegistration: invalidReg,
        source: 'WEB',
        idempotencyKey: `idemp-badreg-${invalidReg}`,
      };

      const res = await invokeCreateHold(db, payload);
      expect(res.status).toBe(400);

      const json = (await res.json()) as any;
      expect(json.success).toBe(false);

      const bookings = await db.prepare('SELECT COUNT(*) as c FROM bookings').first<{ c: number }>();
      expect(bookings?.c).toBe(0);
    });
  });

  describe('Flat ₹500 Advance Breakdown & Atomic Snapshot Creation', () => {
    beforeEach(async () => {
      await configureUpi();
    });

    it.each([
      // categoryId, cylinders, expectedBase, expectedGst, expectedTotal, expectedAdvance, expectedBalance
      [4, 1, 250000, 45000, 295000, 50000, 245000],
      [5, 2, 500000, 90000, 590000, 50000, 540000],
      [7, 4, 1000000, 180000, 1180000, 50000, 1130000],
      [9, 6, 1500000, 270000, 1770000, 50000, 1720000],
    ])(
      'creates booking for category %i (%i cyl) with flat ₹500 advance and snapshot integrity',
      async (categoryId, _cyls, base, gst, total, advance, balance) => {
        const payload = {
          locale: 'en',
          slotSnapshotId: 185,
          categoryId,
          vehicleType: 'Car',
          customerName: 'Deepak Sharma',
          mobile: '9876543230',
          vehicleRegistration: 'HR26DQ5560',
          source: 'WEB',
          idempotencyKey: `idemp-price-${categoryId}`,
        };

        const res = await invokeCreateHold(db, payload);
        expect(res.status).toBe(201);

        const json = (await res.json()) as any;
        const booking = json.data;

        expect(booking.pricing.basePricePaise).toBe(base);
        expect(booking.pricing.gstAmountPaise).toBe(gst);
        expect(booking.pricing.totalPricePaise).toBe(total);
        expect(booking.pricing.advancePaise).toBe(advance);
        expect(booking.pricing.balancePaise).toBe(balance);

        // Verify immutable database snapshot row
        const row = await db
          .prepare(
            `SELECT base_price_paise_snapshot, gst_rate_bps_snapshot, gst_amount_paise_snapshot,
                    total_price_paise_snapshot, amount_paid_paise, advance_paise_snapshot,
                    balance_paise_snapshot
             FROM bookings WHERE booking_code = ?`
          )
          .bind(booking.bookingCode)
          .first<{
            base_price_paise_snapshot: number;
            gst_rate_bps_snapshot: number;
            gst_amount_paise_snapshot: number;
            total_price_paise_snapshot: number;
            amount_paid_paise: number;
            advance_paise_snapshot: number;
            balance_paise_snapshot: number;
          }>();

        expect(row?.base_price_paise_snapshot).toBe(base);
        expect(row?.gst_rate_bps_snapshot).toBe(1800);
        expect(row?.gst_amount_paise_snapshot).toBe(gst);
        expect(row?.total_price_paise_snapshot).toBe(total);
        expect(row?.amount_paid_paise).toBe(0);
        expect(row?.advance_paise_snapshot).toBe(advance);
        expect(row?.balance_paise_snapshot).toBe(balance);
      }
    );

    it('rejects concurrent booking when consecutive work units are no longer available', async () => {
      // 1. First booking takes slot 185 for 2 cylinders (uses slots 185 and 186)
      const res1 = await invokeCreateHold(db, {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 5, // 2 cylinders
        vehicleType: 'Car',
        customerName: 'Customer One',
        mobile: '9876543240',
        vehicleRegistration: 'HR26DQ5570',
        source: 'WEB',
        idempotencyKey: 'idemp-concurrent-1',
      });
      expect(res1.status).toBe(201);

      // 2. Second booking attempts to take slot 185 for 1 cylinder
      const res2 = await invokeCreateHold(db, {
        locale: 'en',
        slotSnapshotId: 185,
        categoryId: 4, // 1 cylinder
        vehicleType: 'Car',
        customerName: 'Customer Two',
        mobile: '9876543241',
        vehicleRegistration: 'HR26DQ5571',
        source: 'WEB',
        idempotencyKey: 'idemp-concurrent-2',
      });
      expect(res2.status).toBe(409);

      const json2 = (await res2.json()) as any;
      expect(json2.success).toBe(false);
      expect(json2.error.code).toBe('CAPACITY_CONFLICT');
    });
  });
});
