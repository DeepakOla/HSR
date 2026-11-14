import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { calculateBookingPrice, calculateServicePrice, FIXED_GST_RATE_BPS } from '../src/lib/pricing';
import { POST } from '../src/pages/api/booking/create-hold';
import { createMockD1, type MockD1Database } from './helpers/d1-mock';

let ipCounter = 100;
function nextClientIp(): string {
  return `10.99.${Math.floor(ipCounter / 254)}.${(ipCounter++ % 254) + 1}`;
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

describe('Challenger M2-1: Pricing Engine Adversarial & Fuzzing Suite', () => {
  describe('Mathematical Invariant Verification & Fuzzing (10,000 randomized iterations)', () => {
    it('unconditionally preserves advancePaise + balancePaise === totalPricePaise and rounding rules', () => {
      // Deterministic PRNG seed for reproducible stress test
      let seed = 0x12345678;
      function nextRandom() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      const ITERATIONS = 10_000;
      let iterationsPassed = 0;

      for (let i = 0; i < ITERATIONS; i++) {
        let basePricePaise: number;
        if (i % 5 === 0) {
          // Standard commercial cylinder counts 1 to 12
          const cyls = Math.floor(nextRandom() * 12) + 1;
          basePricePaise = cyls * 250000;
        } else if (i % 5 === 1) {
          // Small values (0 to 1,000 paise)
          basePricePaise = Math.floor(nextRandom() * 1000);
        } else if (i % 5 === 2) {
          // Medium values (1,000 to 100,000,000 paise / ₹10 lakh)
          basePricePaise = Math.floor(nextRandom() * 100_000_000);
        } else {
          // Very large values (up to 1,000,000,000,000 paise / ₹1,000 crore)
          basePricePaise = Math.floor(nextRandom() * 1_000_000_000_000);
        }

        const expectedGst = Math.round((basePricePaise * FIXED_GST_RATE_BPS) / 10000);
        const expectedTotal = basePricePaise + expectedGst;

        // Choose advancePaise between 0 and expectedTotal
        let advancePaise: number;
        const advType = i % 4;
        if (advType === 0) {
          // Flat ₹500 default or zero if total < 500
          advancePaise = Math.min(50000, expectedTotal);
        } else if (advType === 1) {
          // Zero advance
          advancePaise = 0;
        } else if (advType === 2) {
          // Full advance
          advancePaise = expectedTotal;
        } else {
          // Arbitrary safe integer advance between 0 and expectedTotal
          advancePaise = Math.floor(nextRandom() * (expectedTotal + 1));
        }

        const breakdown = calculateBookingPrice(basePricePaise, advancePaise);

        // Fast Invariant Assertions
        if (breakdown.totalPricePaise !== expectedTotal) {
          throw new Error(`Total price mismatch at iter ${i}: got ${breakdown.totalPricePaise}, expected ${expectedTotal}`);
        }
        if (breakdown.gstAmountPaise !== expectedGst) {
          throw new Error(`GST mismatch at iter ${i}: got ${breakdown.gstAmountPaise}, expected ${expectedGst}`);
        }
        if (breakdown.basePricePaise !== basePricePaise) {
          throw new Error(`Base price mismatch at iter ${i}`);
        }
        if (breakdown.advancePaise + breakdown.balancePaise !== breakdown.totalPricePaise) {
          throw new Error(`Invariant advance + balance === total broken at iter ${i}`);
        }
        if (breakdown.balancePaise !== expectedTotal - advancePaise || breakdown.balancePaise < 0) {
          throw new Error(`Balance calculation invariant broken at iter ${i}`);
        }
        if (breakdown.advancePaise !== advancePaise) {
          throw new Error(`Advance mismatch at iter ${i}`);
        }
        if (
          !Number.isSafeInteger(breakdown.basePricePaise) ||
          !Number.isSafeInteger(breakdown.gstAmountPaise) ||
          !Number.isSafeInteger(breakdown.totalPricePaise) ||
          !Number.isSafeInteger(breakdown.advancePaise) ||
          !Number.isSafeInteger(breakdown.balancePaise)
        ) {
          throw new Error(`Safe integer invariant broken at iter ${i}`);
        }

        iterationsPassed++;
      }

      expect(iterationsPassed).toBe(ITERATIONS);
    }, 15000);
  });

  describe('Extreme Boundary Conditions', () => {
    it('handles zero base price with zero advance', () => {
      const breakdown = calculateBookingPrice(0, 0);
      expect(breakdown).toEqual({
        basePricePaise: 0,
        gstRateBps: 1800,
        gstAmountPaise: 0,
        totalPricePaise: 0,
        advancePaise: 0,
        balancePaise: 0,
      });
      expect(breakdown.advancePaise + breakdown.balancePaise).toBe(breakdown.totalPricePaise);
    });

    it('handles single paise precision and rounding boundaries', () => {
      // 1 paise * 0.18 = 0.18 paise -> rounds to 0
      const b1 = calculateBookingPrice(1, 0);
      expect(b1.gstAmountPaise).toBe(0);
      expect(b1.totalPricePaise).toBe(1);
      expect(b1.balancePaise).toBe(1);

      // 3 paise * 0.18 = 0.54 paise -> rounds to 1
      const b3 = calculateBookingPrice(3, 1);
      expect(b3.gstAmountPaise).toBe(1);
      expect(b3.totalPricePaise).toBe(4);
      expect(b3.balancePaise).toBe(3);

      // 27 paise * 0.18 = 4.86 paise -> rounds to 5
      const b27 = calculateBookingPrice(27, 32);
      expect(b27.gstAmountPaise).toBe(5);
      expect(b27.totalPricePaise).toBe(32);
      expect(b27.balancePaise).toBe(0);

      // 28 paise * 0.18 = 5.04 paise -> rounds to 5
      const b28 = calculateBookingPrice(28, 20);
      expect(b28.gstAmountPaise).toBe(5);
      expect(b28.totalPricePaise).toBe(33);
      expect(b28.balancePaise).toBe(13);
    });

    it('handles multi-crore base prices (up to 5 trillion paise / ₹5,000 crore)', () => {
      const hugeBase = 5_000_000_000_000; // ₹5,000 crore
      const advance = 50000;
      const breakdown = calculateBookingPrice(hugeBase, advance);

      const expectedGst = Math.round((hugeBase * 1800) / 10000); // 900_000_000_000
      expect(breakdown.gstAmountPaise).toBe(expectedGst);
      expect(breakdown.totalPricePaise).toBe(hugeBase + expectedGst);
      expect(breakdown.advancePaise).toBe(advance);
      expect(breakdown.balancePaise).toBe(hugeBase + expectedGst - advance);
      expect(breakdown.advancePaise + breakdown.balancePaise).toBe(breakdown.totalPricePaise);
    });
  });

  describe('Adversarial & Malformed Inputs (Fail-Fast Verification)', () => {
    it('rejects negative base prices and negative advances', () => {
      expect(() => calculateBookingPrice(-1, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(-250000, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(-Number.MAX_SAFE_INTEGER, 50000)).toThrow(RangeError);

      expect(() => calculateBookingPrice(250000, -1)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, -50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, -Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    });

    it('rejects non-integer floating-point values (decimals)', () => {
      expect(() => calculateBookingPrice(250000.5, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000.001, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(0.5, 0)).toThrow(RangeError);

      expect(() => calculateBookingPrice(250000, 50000.5)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, 0.99)).toThrow(RangeError);
    });

    it('rejects advance strictly greater than total price', () => {
      const total = calculateServicePrice(250000).totalPricePaise; // 295000
      expect(() => calculateBookingPrice(250000, total + 1)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, total + 100000)).toThrow(RangeError);
    });

    it('rejects NaN, Infinity, -Infinity, strings, and non-numeric types', () => {
      expect(() => calculateBookingPrice(NaN, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, NaN)).toThrow(RangeError);
      expect(() => calculateBookingPrice(Infinity, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, Infinity)).toThrow(RangeError);
      expect(() => calculateBookingPrice(-Infinity, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, -Infinity)).toThrow(RangeError);

      expect(() => calculateBookingPrice('250000' as any, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, '50000' as any)).toThrow(RangeError);
      expect(() => calculateBookingPrice(null as any, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, null as any)).toThrow(RangeError);
      expect(() => calculateBookingPrice(undefined as any, 50000)).toThrow(RangeError);
      expect(() => calculateBookingPrice(250000, undefined as any)).toThrow(RangeError);
    });
  });
});

describe('Challenger M2-1: Concurrency & Atomic Capacity Race Conditions', () => {
  let db: MockD1Database;

  beforeEach(async () => {
    db = createMockD1();
    // Enable UPI payments so create-hold passes pre-write payment gate
    await db
      .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
      .bind('hsr@okaxis', 'HSR Green Energy')
      .run();
  });

  afterEach(() => {
    db.close();
  });

  it('Scenario 1: 10 concurrent requests racing for the EXACT SAME slot -> exactly ONE 201, 9 409s, zero double-allocation', async () => {
    const slotSnapshotId = 185;
    const categoryId = 4; // 1 cylinder

    const requests = Array.from({ length: 10 }, (_, i) => ({
      locale: 'en',
      slotSnapshotId,
      categoryId,
      vehicleType: 'Car',
      customerName: `Concurrent Customer ${i + 1}`,
      mobile: `98765432${(i + 10).toString().padStart(2, '0')}`,
      vehicleRegistration: `HR26DQ55${(i + 10).toString().padStart(2, '0')}`,
      source: 'WEB',
      idempotencyKey: `idemp-race-exact-${i + 1}`,
    }));

    // Fire all 10 requests simultaneously
    const responses = await Promise.all(
      requests.map((payload) => invokeCreateHold(db, payload))
    );

    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 201);
    const conflicts = statuses.filter((s) => s === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(9);

    // Verify error code for all 9 conflicts is CAPACITY_CONFLICT
    for (const res of responses) {
      if (res.status === 409) {
        const body = (await res.json()) as any;
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('CAPACITY_CONFLICT');
      }
    }

    // Verify exact allocation count in D1
    const allocations = await db
      .prepare('SELECT COUNT(*) as count FROM booking_slot_allocations WHERE slot_snapshot_id = ?')
      .bind(slotSnapshotId)
      .first<{ count: number }>();
    expect(allocations?.count).toBe(1);

    const bookings = await db
      .prepare('SELECT COUNT(*) as count FROM bookings WHERE slot_snapshot_id = ?')
      .bind(slotSnapshotId)
      .first<{ count: number }>();
    expect(bookings?.count).toBe(1);
  }, 30000);

  it('Scenario 2: 4 concurrent requests competing for overlapping multi-cylinder work units -> atomic mutual exclusion', async () => {
    // Slot 185, 186, 187, 188
    // Req A: 4 cyl starting at 185 (needs 185, 186, 187, 188)
    // Req B: 2 cyl starting at 186 (needs 186, 187)
    // Req C: 2 cyl starting at 187 (needs 187, 188)
    // Req D: 1 cyl starting at 188 (needs 188)
    const testCases = [
      { id: 'A', slotSnapshotId: 185, categoryId: 7, reg: 'HR26DQ5601' }, // 4 cyl
      { id: 'B', slotSnapshotId: 186, categoryId: 5, reg: 'HR26DQ5602' }, // 2 cyl
      { id: 'C', slotSnapshotId: 187, categoryId: 5, reg: 'HR26DQ5603' }, // 2 cyl
      { id: 'D', slotSnapshotId: 188, categoryId: 4, reg: 'HR26DQ5604' }, // 1 cyl
    ];

    const responses = await Promise.all(
      testCases.map((tc, idx) =>
        invokeCreateHold(db, {
          locale: 'en',
          slotSnapshotId: tc.slotSnapshotId,
          categoryId: tc.categoryId,
          vehicleType: 'Car',
          customerName: `Customer ${tc.id}`,
          mobile: `98765433${idx.toString().padStart(2, '0')}`,
          vehicleRegistration: tc.reg,
          source: 'WEB',
          idempotencyKey: `idemp-race-overlap-${tc.id}`,
        })
      )
    );

    const successfulResponses: any[] = [];
    for (const res of responses) {
      if (res.status === 201) {
        successfulResponses.push(await res.json());
      } else {
        expect(res.status).toBe(409);
        const errJson = (await res.json()) as any;
        expect(errJson.error.code).toBe('CAPACITY_CONFLICT');
      }
    }

    // At least 1 request must succeed
    expect(successfulResponses.length).toBeGreaterThanOrEqual(1);

    // Verify in database: NO slot has more than 1 allocation
    const duplicates = await db
      .prepare(
        `SELECT slot_snapshot_id, COUNT(*) as count
         FROM booking_slot_allocations
         WHERE slot_snapshot_id IN (185, 186, 187, 188)
         GROUP BY slot_snapshot_id
         HAVING count > 1`
      )
      .all<{ slot_snapshot_id: number; count: number }>();
    expect(duplicates.results.length).toBe(0);
  }, 30000);

  it('Scenario 3: 3 concurrent requests for disjoint adjacent slots -> all 3 succeed (HTTP 201)', async () => {
    // Slots 185, 186, 187 booked for 1 cylinder each
    const testCases = [
      { slotSnapshotId: 185, reg: 'HR26DQ5611' },
      { slotSnapshotId: 186, reg: 'HR26DQ5612' },
      { slotSnapshotId: 187, reg: 'HR26DQ5613' },
    ];

    const responses = await Promise.all(
      testCases.map((tc, idx) =>
        invokeCreateHold(db, {
          locale: 'en',
          slotSnapshotId: tc.slotSnapshotId,
          categoryId: 4, // 1 cylinder
          vehicleType: 'Car',
          customerName: `Adjacent Customer ${idx + 1}`,
          mobile: `98765434${idx.toString().padStart(2, '0')}`,
          vehicleRegistration: tc.reg,
          source: 'WEB',
          idempotencyKey: `idemp-race-disjoint-${idx + 1}`,
        })
      )
    );

    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);

    const allocations = await db
      .prepare('SELECT slot_snapshot_id FROM booking_slot_allocations WHERE slot_snapshot_id IN (185, 186, 187)')
      .all<{ slot_snapshot_id: number }>();
    expect(allocations.results.length).toBe(3);
  }, 30000);

  it('Scenario 4: 5 concurrent requests with identical idempotency key -> exactly ONE booking created, all return same response', async () => {
    const identicalPayload = {
      locale: 'en',
      slotSnapshotId: 185,
      categoryId: 4,
      vehicleType: 'Car',
      customerName: 'Idempotency User',
      mobile: '9876543501',
      vehicleRegistration: 'HR26DQ5621',
      source: 'WEB',
      idempotencyKey: 'identical-key-concurrency-test',
    };

    // 5 concurrent identical requests
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => invokeCreateHold(db, identicalPayload))
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses).toEqual([201, 201, 201, 201, 201]);

    const bodies = await Promise.all(responses.map((r) => r.json())) as any[];
    const firstBookingCode = bodies[0].data.bookingCode;

    for (const body of bodies) {
      expect(body.data.bookingCode).toBe(firstBookingCode);
    }

    // Verify only 1 booking and 1 allocation in database
    const bookingCount = await db
      .prepare('SELECT COUNT(*) as count FROM bookings WHERE booking_code = ?')
      .bind(firstBookingCode)
      .first<{ count: number }>();
    expect(bookingCount?.count).toBe(1);

    const allocationCount = await db
      .prepare('SELECT COUNT(*) as count FROM booking_slot_allocations WHERE slot_snapshot_id = 185')
      .first<{ count: number }>();
    expect(allocationCount?.count).toBe(1);
  }, 30000);

  it('Scenario 5: 5 concurrent requests with cylinderCount > 6 on WEB -> all rejected HTTP 400 and ZERO D1 writes', async () => {
    // Category 10 has 7 cylinders (id = 10)
    const requests = Array.from({ length: 5 }, (_, i) => ({
      locale: 'en',
      slotSnapshotId: 185,
      categoryId: 10, // 7 cylinders
      vehicleType: 'Truck',
      customerName: `Tampering Customer ${i + 1}`,
      mobile: `98765436${(i + 10).toString().padStart(2, '0')}`,
      vehicleRegistration: `HR26DQ56${(i + 30).toString().padStart(2, '0')}`,
      source: 'WEB',
      idempotencyKey: `idemp-race-tamper-${i + 1}`,
    }));

    const responses = await Promise.all(
      requests.map((payload) => invokeCreateHold(db, payload))
    );

    for (const res of responses) {
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('PUBLIC_CYLINDER_LIMIT_EXCEEDED');
      expect(json.contact.phone).toBe('+919910055355');
    }

    // Zero writes across all tables
    const bookings = await db.prepare('SELECT COUNT(*) as count FROM bookings').first<{ count: number }>();
    expect(bookings?.count).toBe(0);
    const allocations = await db.prepare('SELECT COUNT(*) as count FROM booking_slot_allocations').first<{ count: number }>();
    expect(allocations?.count).toBe(0);
  }, 30000);

  it('Scenario 6: 5 concurrent requests when payment is SETUP_REQUIRED -> all fail-closed HTTP 422 and ZERO D1 writes', async () => {
    // Reset payment to SETUP_REQUIRED
    await db
      .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
      .bind('SETUP_REQUIRED', 'SETUP_REQUIRED')
      .run();

    const requests = Array.from({ length: 5 }, (_, i) => ({
      locale: 'en',
      slotSnapshotId: 185,
      categoryId: 4, // 1 cylinder
      vehicleType: 'Car',
      customerName: `Blocked Customer ${i + 1}`,
      mobile: `98765437${(i + 10).toString().padStart(2, '0')}`,
      vehicleRegistration: `HR26DQ56${(i + 40).toString().padStart(2, '0')}`,
      source: 'WEB',
      idempotencyKey: `idemp-race-nopay-${i + 1}`,
    }));

    const responses = await Promise.all(
      requests.map((payload) => invokeCreateHold(db, payload))
    );

    for (const res of responses) {
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    }

    // Zero writes
    const bookings = await db.prepare('SELECT COUNT(*) as count FROM bookings').first<{ count: number }>();
    expect(bookings?.count).toBe(0);
    const allocations = await db.prepare('SELECT COUNT(*) as count FROM booking_slot_allocations').first<{ count: number }>();
    expect(allocations?.count).toBe(0);
  }, 30000);

  it('Scenario 7: Owner sets flat advance to 0 -> create-hold creates booking with advance 0 and full balance', async () => {
    await db
      .prepare('UPDATE business_settings SET flat_advance_paise = 0 WHERE id = 1')
      .run();

    const payload = {
      locale: 'en',
      slotSnapshotId: 185,
      categoryId: 4, // 1 cylinder (base 250000, GST 45000, Total 295000)
      vehicleType: 'Car',
      customerName: 'Zero Advance Customer',
      mobile: '9876543801',
      vehicleRegistration: 'HR26DQ5650',
      source: 'WEB',
      idempotencyKey: 'idemp-zero-advance-test',
    };

    const res = await invokeCreateHold(db, payload);
    expect(res.status).toBe(201);

    const json = (await res.json()) as any;
    expect(json.data.pricing.advancePaise).toBe(0);
    expect(json.data.pricing.balancePaise).toBe(295000);
    expect(json.data.pricing.totalPricePaise).toBe(295000);

    // Verify database snapshot
    const row = await db
      .prepare('SELECT advance_paise_snapshot, balance_paise_snapshot, total_price_paise_snapshot FROM bookings WHERE booking_code = ?')
      .bind(json.data.bookingCode)
      .first<{ advance_paise_snapshot: number; balance_paise_snapshot: number; total_price_paise_snapshot: number }>();

    expect(row?.advance_paise_snapshot).toBe(0);
    expect(row?.balance_paise_snapshot).toBe(295000);
    expect(row?.total_price_paise_snapshot).toBe(295000);
    expect((row?.advance_paise_snapshot ?? 0) + (row?.balance_paise_snapshot ?? 0)).toBe(row?.total_price_paise_snapshot);
  }, 30000);
});
