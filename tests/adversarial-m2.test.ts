import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { POST } from '../src/pages/api/booking/create-hold';
import { createHold } from '../src/lib/booking-engine';
import { createMockD1, type MockD1Database } from './helpers/d1-mock';
import { validateVehicleRegistration } from '../src/lib/vehicle-registration';

let ipCounter = 300;
function nextClientIp(): string {
  return `192.168.2.${ipCounter++}`;
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

async function assertZeroDatabaseWrites(db: MockD1Database) {
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
}

describe('Adversarial Challenger M2-2: Security & Gating Boundaries', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = createMockD1();
  });

  afterEach(() => {
    db.close();
  });

  // Base valid payload
  const validPayload = {
    locale: 'en' as const,
    slotSnapshotId: 185,
    categoryId: 4, // 1 cylinder
    vehicleType: 'Car',
    customerName: 'Adversarial Tester',
    mobile: '9876543210',
    vehicleRegistration: 'HR26DQ5551',
    source: 'WEB' as const,
    idempotencyKey: 'adv-idemp-001',
  };

  async function configureUpi(vpaId = 'hsr@okaxis', payeeName = 'HSR Testing') {
    await db
      .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
      .bind(vpaId, payeeName)
      .run();
  }

  /* =========================================================================
   * SECTION 1: Pre-Write Payment Gating Bypass Stress Tests
   * ========================================================================= */
  describe('1. Adversarial Pre-Write Payment Gate Bypass Attempts', () => {
    const unconfiguredPaymentScenarios = [
      { name: 'default migration state (both SETUP_REQUIRED)', vpa: 'SETUP_REQUIRED', payee: 'SETUP_REQUIRED' },
      { name: 'valid VPA with SETUP_REQUIRED payee', vpa: 'hsr@okaxis', payee: 'SETUP_REQUIRED' },
      { name: 'SETUP_REQUIRED VPA with valid payee', vpa: 'SETUP_REQUIRED', payee: 'HSR CNG' },
      { name: 'empty string VPA', vpa: '', payee: 'HSR CNG' },
      { name: 'empty string payee', vpa: 'hsr@okaxis', payee: '' },
      { name: 'whitespace VPA (standard spaces)', vpa: '     ', payee: 'HSR CNG' },
      { name: 'whitespace payee (standard spaces)', vpa: 'hsr@okaxis', payee: '     ' },
      { name: 'whitespace VPA (tabs and newlines)', vpa: '\t\t\r\n', payee: 'HSR CNG' },
      { name: 'whitespace payee (tabs and newlines)', vpa: 'hsr@okaxis', payee: '\t\n ' },
      { name: 'Unicode whitespace VPA (non-breaking space U+00A0 & en-quad U+2000)', vpa: '\u00A0\u2000', payee: 'HSR CNG' },
      { name: 'Unicode whitespace payee (non-breaking space U+00A0)', vpa: 'hsr@okaxis', payee: '\u00A0' },
      { name: 'trailing whitespace SETUP_REQUIRED VPA', vpa: 'SETUP_REQUIRED   ', payee: 'HSR CNG' },
      { name: 'leading whitespace SETUP_REQUIRED payee', vpa: 'hsr@okaxis', payee: '   SETUP_REQUIRED' },
      { name: 'mixed whitespace and newlines in VPA', vpa: '  \r\n\t  ', payee: 'HSR CNG' },
    ];

    it.each(unconfiguredPaymentScenarios)(
      'blocks hold creation with HTTP 422 and verifies ZERO D1 writes when $name',
      async ({ vpa, payee }) => {
        await db
          .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
          .bind(vpa, payee)
          .run();

        const res = await invokeCreateHold(db, {
          ...validPayload,
          idempotencyKey: `adv-gate-${Math.random()}`,
        });

        expect(res.status).toBe(422);

        const json = (await res.json()) as any;
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
        expect(json.contact).toBeDefined();
        expect(json.contact.phone).toBe('+919910055355');
        expect(json.contact.whatsapp).toBe('+919910055355');
        expect(json.contact.whatsappUrl).toContain('wa.me/919910055355');

        await assertZeroDatabaseWrites(db);
      }
    );

    it('confirms DB schema enforces NOT NULL on business_settings vpa_id and vpa_payee_name', async () => {
      // Database schema level defense-in-depth: table rejects NULL writes
      await expect(
        db.prepare('UPDATE business_settings SET vpa_id = NULL WHERE id = 1').run()
      ).rejects.toThrow(/NOT NULL constraint failed/);

      await expect(
        db.prepare('UPDATE business_settings SET vpa_payee_name = NULL WHERE id = 1').run()
      ).rejects.toThrow(/NOT NULL constraint failed/);
    });

    it('blocks booking at booking-engine level as defense-in-depth even if create-hold gate were somehow bypassed', async () => {
      await db
        .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
        .bind('SETUP_REQUIRED', 'SETUP_REQUIRED')
        .run();

      await expect(
        createHold(db, {
          ...validPayload,
          idempotencyKey: 'engine-direct-bypass',
        })
      ).rejects.toThrow(/ONLINE_PAYMENT_UNAVAILABLE/);

      await assertZeroDatabaseWrites(db);
    });

    it('EMPIRICAL FINDING: zero-width space (U+200B) bypasses String.trim() and pre-write payment gate', async () => {
      // Demonstrating that String.trim() in JavaScript does NOT strip U+200B (Zero Width Space)
      // because U+200B is in category Cf (Other, Format), not Zs (Separator, Space).
      const zeroWidthVpa = '\u200B';
      expect(zeroWidthVpa.trim()).toBe('\u200B'); // trim() does not remove it!

      await db
        .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
        .bind(zeroWidthVpa, 'HSR Testing')
        .run();

      const res = await invokeCreateHold(db, {
        ...validPayload,
        idempotencyKey: 'zero-width-vpa-test',
      });

      // Because vpa_id is '\u200B', !!vpaId is true and vpaId !== 'SETUP_REQUIRED' is true.
      // The payment gate treats this as configured and issues a booking hold!
      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.upiUri).toContain('pa=%E2%80%8B'); // Invisible zero-width character in UPI URL
    });
  });

  /* =========================================================================
   * SECTION 2: Public Cylinder Count Limit Tampering Stress Tests
   * ========================================================================= */
  describe('2. Adversarial Public Cylinder Limit Tampering Attempts', () => {
    beforeEach(async () => {
      await configureUpi();
    });

    it.each([
      { categoryId: 10, label: '7 cylinders' },
      { categoryId: 11, label: '8 cylinders' },
      { categoryId: 12, label: '9 cylinders' },
      { categoryId: 13, label: '10 cylinders' },
      { categoryId: 14, label: '11 cylinders' },
      { categoryId: 15, label: '12 cylinders' },
    ])('strictly rejects public hold for $label (cat $categoryId) with HTTP 400 and zero D1 writes', async ({ categoryId }) => {
      const res = await invokeCreateHold(db, {
        ...validPayload,
        categoryId,
        idempotencyKey: `adv-cyl-cat-${categoryId}`,
      });

      expect(res.status).toBe(400);

      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('PUBLIC_CYLINDER_LIMIT_EXCEEDED');
      expect(json.contact.phone).toBe('+919910055355');

      await assertZeroDatabaseWrites(db);
    });

    it('strictly rejects when an active category has 20 cylinders in DB', async () => {
      await db.prepare(`
        INSERT INTO vehicle_categories (code, sort_order, name_en, name_hi, cylinder_count, base_price_paise, gst_rate_bps, advance_paise, is_active)
        VALUES ('CYL_20', 20, '20 CNG cylinders', '20 सीएनजी', 20, 5000000, 1800, NULL, 1)
      `).run();

      const newCat = await db.prepare("SELECT id FROM vehicle_categories WHERE code = 'CYL_20'").first<{ id: number }>();
      expect(newCat).toBeDefined();

      const res = await invokeCreateHold(db, {
        ...validPayload,
        categoryId: newCat!.id,
        idempotencyKey: 'adv-cyl-20',
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('PUBLIC_CYLINDER_LIMIT_EXCEEDED');

      await assertZeroDatabaseWrites(db);
    });

    it('strictly rejects when categoryId does not exist (e.g. 999) with HTTP 400', async () => {
      const res = await invokeCreateHold(db, {
        ...validPayload,
        categoryId: 999,
        idempotencyKey: 'adv-cyl-999',
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('INVALID_CATEGORY');

      await assertZeroDatabaseWrites(db);
    });

    it('strictly rejects when categoryId is an inactive legacy category (e.g. 1) with HTTP 400', async () => {
      const res = await invokeCreateHold(db, {
        ...validPayload,
        categoryId: 1, // inactive CAR_TAXI_1
        idempotencyKey: 'adv-cyl-inactive',
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('INVALID_CATEGORY');

      await assertZeroDatabaseWrites(db);
    });

    const malformedCategoryPayloads = [
      { name: 'negative categoryId', categoryId: -1 },
      { name: 'negative big categoryId', categoryId: -999 },
      { name: 'zero categoryId', categoryId: 0 },
      { name: 'float categoryId', categoryId: 4.5 },
      { name: 'string categoryId', categoryId: '4' },
      { name: 'SQL injection string in categoryId', categoryId: '4 OR 1=1' },
      { name: 'null categoryId', categoryId: null },
      { name: 'missing categoryId', categoryId: undefined },
    ];

    it.each(malformedCategoryPayloads)(
      'rejects malformed $name with HTTP 400 at schema boundary with zero D1 writes',
      async ({ categoryId }) => {
        const payload: Record<string, unknown> = {
          ...validPayload,
          idempotencyKey: `adv-malformed-cat-${Math.random()}`,
        };
        if (categoryId === undefined) {
          delete payload.categoryId;
        } else {
          payload.categoryId = categoryId;
        }

        const res = await invokeCreateHold(db, payload);
        expect(res.status).toBe(400);

        await assertZeroDatabaseWrites(db);
      }
    );

    it('rejects client attempting to forge source: "PHONE" via public API', async () => {
      // createHoldSchema has `source: z.literal('WEB').default('WEB')`
      // A client sending `source: 'PHONE'` must be rejected at schema parse
      const res = await invokeCreateHold(db, {
        ...validPayload,
        categoryId: 11, // 8 cylinders
        source: 'PHONE',
        idempotencyKey: 'adv-forge-phone-source',
      });

      expect(res.status).toBe(400);
      await assertZeroDatabaseWrites(db);
    });

    it('allows reception staff (PHONE) to book >6 cylinders via engine directly', async () => {
      const result = await createHold(db, {
        ...validPayload,
        categoryId: 15, // 12 cylinders
        source: 'PHONE',
        idempotencyKey: 'staff-12-cyl',
      });

      expect(result.bookingCode).toBeDefined();
      expect(result.category.cylinderCount).toBe(12);

      const booking = await db
        .prepare('SELECT cylinder_count_snapshot, source FROM bookings WHERE booking_code = ?')
        .bind(result.bookingCode)
        .first<{ cylinder_count_snapshot: number; source: string }>();

      expect(booking?.cylinder_count_snapshot).toBe(12);
      expect(booking?.source).toBe('PHONE');
    });
  });

  /* =========================================================================
   * SECTION 3: Vehicle Registration Validation & Injection Stress Tests
   * ========================================================================= */
  describe('3. Adversarial Vehicle Registration Validation & Injection Attempts', () => {
    beforeEach(async () => {
      await configureUpi();
    });

    const injectionAndMalformedPayloads = [
      // SQL Injection Payloads
      { name: 'SQLi: simple tautology', reg: "' OR '1'='1" },
      { name: 'SQLi: drop table attempt', reg: "DL01'; DROP TABLE bookings;--" },
      { name: 'SQLi: union select', reg: "' UNION SELECT 1,2,3--" },
      { name: 'SQLi: comment terminate', reg: "admin'--" },
      { name: 'SQLi: subquery injection', reg: "DL01(SELECT 1)AA1234" },

      // XSS / Script Injection Payloads
      { name: 'XSS: basic script tag', reg: "<script>alert(1)</script>" },
      { name: 'XSS: img onerror', reg: "<img src=x onerror=alert(1)>" },
      { name: 'XSS: svg onload', reg: "<svg/onload=alert('XSS')>" },
      { name: 'XSS: javascript URI', reg: "javascript:alert(1)" },
      { name: 'XSS: closing tag evasion', reg: "\"><script>alert(1)</script>" },

      // Arbitrary non-vehicle words
      { name: 'arbitrary word: MYCAR', reg: "MYCAR" },
      { name: 'arbitrary word: TOYOTA', reg: "TOYOTA" },
      { name: 'arbitrary word: TRUCK1', reg: "TRUCK1" },
      { name: 'arbitrary text with spaces', reg: "HELLO WORLD" },
      { name: 'arbitrary make model', reg: "MARUTI WAGONR" },

      // Structural violations
      { name: 'too short: 2 chars', reg: "DL" },
      { name: 'too short: 3 chars', reg: "DL1" },
      { name: 'state code only', reg: "HR26" },
      { name: 'numbers only', reg: "12345678" },
      { name: 'letters only', reg: "DLABCDEF" },
      { name: 'reversed structure: digits first', reg: "1234DL01AB" },
      { name: 'extra long: 15 digits', reg: "DL01AB123456789" },
      { name: 'Unicode fullwidth digits', reg: "DL０１AB１２३४" },

      // BH Series invalid variants
      { name: 'BH with 3 digits instead of 4', reg: "22BH123AA" },
      { name: 'BH with 5 digits instead of 4', reg: "22BH12345AA" },
      { name: 'BH with 3 series letters', reg: "22BH1234AAA" },
      { name: 'BH missing series letters', reg: "22BH1234" },
    ];

    it.each(injectionAndMalformedPayloads)(
      'rejects $name ("$reg") with HTTP 400 and zero D1 writes',
      async ({ reg }) => {
        const res = await invokeCreateHold(db, {
          ...validPayload,
          vehicleRegistration: reg,
          idempotencyKey: `adv-reg-${Math.random()}`,
        });

        expect(res.status).toBe(400);

        const json = (await res.json()) as any;
        expect(json.success).toBe(false);

        await assertZeroDatabaseWrites(db);
      }
    );

    const legitimateRegistrations = [
      { input: 'HR26DQ5551', normalized: 'HR26DQ5551', format: 'STATE' },
      { input: 'hr 26 dq 5551', normalized: 'HR26DQ5551', format: 'STATE (spaces)' },
      { input: 'DL-01-AB-1234', normalized: 'DL01AB1234', format: 'STATE (hyphens)' },
      { input: 'KA 01 M 9999', normalized: 'KA01M9999', format: 'STATE (single series letter)' },
      { input: 'DL 1C AA 1111', normalized: 'DL1CAA1111', format: 'STATE (single-digit RTO with cat letter)' },
      { input: '22BH1234AA', normalized: '22BH1234AA', format: 'BH' },
      { input: '23 BH 5678 ZZ', normalized: '23BH5678ZZ', format: 'BH (spaces)' },
      { input: '21-bh-9999-a', normalized: '21BH9999A', format: 'BH (single series letter, hyphens)' },
    ];

    it.each(legitimateRegistrations)(
      'accepts valid registration "$input" ($format) and stores normalized "$normalized"',
      async ({ input, normalized }) => {
        const res = await invokeCreateHold(db, {
          ...validPayload,
          vehicleRegistration: input,
          idempotencyKey: `adv-valid-reg-${normalized}`,
        });

        expect(res.status).toBe(201);
        const json = (await res.json()) as any;
        expect(json.success).toBe(true);
        const bookingCode = json.data.bookingCode;

        // Verify stored in vehicles table as normalized
        const vehicle = await db
          .prepare(
            'SELECT v.registration_normalized FROM vehicles v JOIN bookings b ON b.vehicle_id = v.id WHERE b.booking_code = ?'
          )
          .bind(bookingCode)
          .first<{ registration_normalized: string }>();

        expect(vehicle?.registration_normalized).toBe(normalized);
      }
    );

    /* =========================================================================
     * SECTION 4: Empirical Character Stripping & Regex Surface Analysis
     * ========================================================================= */
    describe('4. Empirical Analysis of Normalization Stripping Behavior', () => {
      it('demonstrates that normalizeVehicleRegistration strips non-alphanumerics before regex matching', () => {
        // Because normalizeVehicleRegistration runs `.replace(/[^A-Z0-9]/g, '')`:
        // 1. Non-alphanumeric punctuation and delimiters are stripped:
        expect(validateVehicleRegistration('DL.01.AB.1234').valid).toBe(true);
        expect(validateVehicleRegistration('DL.01.AB.1234').normalized).toBe('DL01AB1234');

        // 2. Control characters such as tabs or newlines are stripped:
        expect(validateVehicleRegistration('HR26\tAB1234').valid).toBe(true);
        expect(validateVehicleRegistration('HR26\tAB1234').normalized).toBe('HR26AB1234');

        // 3. Null bytes are stripped:
        expect(validateVehicleRegistration('DL01AB1234\0').valid).toBe(true);
        expect(validateVehicleRegistration('DL01AB1234\0').normalized).toBe('DL01AB1234');

        // 4. Injected symbols like @, #, $ are stripped if surrounding characters form a valid plate:
        expect(validateVehicleRegistration('DL@01#AB$1234').valid).toBe(true);
        expect(validateVehicleRegistration('DL@01#AB$1234').normalized).toBe('DL01AB1234');

        // 5. Cyrillic homoglyph (U+0410) is stripped because it is not in ASCII [A-Z]:
        expect(validateVehicleRegistration('DL01АB1234').valid).toBe(true);
        expect(validateVehicleRegistration('DL01АB1234').normalized).toBe('DL01B1234');

        // 6. Emojis are stripped, and if remaining characters match 0-letter series, it validates:
        expect(validateVehicleRegistration('DL01🚗1234').valid).toBe(true);
        expect(validateVehicleRegistration('DL01🚗1234').normalized).toBe('DL011234');
      });

      it('demonstrates that STATE_SERIES_REGEX permits any 2 uppercase letters as state code', () => {
        // STATE_SERIES_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/
        // It does not maintain a whitelist of the 36 valid Indian State/UT codes.
        // Therefore, fictitious codes like 'XX' or 'ZZ' are accepted by the regex.
        expect(validateVehicleRegistration('XX01AB1234').valid).toBe(true);
        expect(validateVehicleRegistration('ZZ01AB1234').valid).toBe(true);
      });

      it('demonstrates that BH_SERIES_REGEX accepts any 2-digit year prefix', () => {
        // BH_SERIES_REGEX = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/
        // BH series was introduced in 2021, but regex accepts years like '20' or '19'.
        expect(validateVehicleRegistration('20BH1234AA').valid).toBe(true);
        expect(validateVehicleRegistration('19BH1234AA').valid).toBe(true);
      });
    });
  });
});
