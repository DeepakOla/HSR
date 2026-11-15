import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { POST as dueAssistancePost } from '../src/pages/api/public/due-date-assistance';
import { POST as requestChallengePost } from '../src/pages/api/auth/customer/request-challenge';
import { POST as verifyChallengePost } from '../src/pages/api/auth/customer/verify-challenge';
import { GET as seoAuditsGet, POST as seoAuditsPost } from '../src/pages/api/admin/seo';
import { POST as settingsPost } from '../src/pages/api/admin/settings';
import { GET as vouchersGet, PATCH as vouchersPatch } from '../src/pages/api/admin/vouchers';
import { createMockD1 } from './helpers/d1-mock';
import { setupMockJwksServer } from './helpers/jwt-mock';

describe('v0.0.3: Customer Journey Simplification, 2-Path Due Date, Email Auth & SEO Tracker', () => {
  let db: any;
  let jwks: any;

  beforeEach(async () => {
    db = createMockD1();
    jwks = await setupMockJwksServer({
      domain: 'hsr-auth.cloudflareaccess.com',
      audience: 'aud-hsr-testing-bay-prod-12345',
    });
    // Seed staff records in staff_users
    await db.prepare('INSERT OR IGNORE INTO staff_users (id, email, role, is_active) VALUES (?, ?, ?, 1)')
      .bind(101, 'owner@hsr.test', 'OWNER')
      .run();
    await db.prepare('INSERT OR IGNORE INTO staff_users (id, email, role, is_active) VALUES (?, ?, ?, 1)')
      .bind(102, 'receptionist@hsr.test', 'RECEPTIONIST')
      .run();
  });

  describe('Option B: Due Date Assistance & ₹200 Loyalty Voucher', () => {
    it('rejects assistance request without vehicle registration', async () => {
      const req = new Request('http://localhost:4321/api/public/due-date-assistance/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4321' },
        body: JSON.stringify({ mobile: '9812345678' }),
      });
      const res = await dueAssistancePost({
        request: req,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error.code).toBe('MISSING_REGISTRATION');
    });

    it('rejects assistance request without contact details (neither mobile nor email)', async () => {
      const req = new Request('http://localhost:4321/api/public/due-date-assistance/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4321' },
        body: JSON.stringify({ vehicleRegistration: 'HR26AB1234' }),
      });
      const res = await dueAssistancePost({
        request: req,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error.code).toBe('MISSING_CONTACT');
    });

    it('successfully logs assistance request and issues ₹200 voucher code', async () => {
      const req = new Request('http://localhost:4321/api/public/due-date-assistance/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4321' },
        body: JSON.stringify({
          vehicleRegistration: 'HR26 DK 5555',
          mobile: '9812345678',
          cylinderInfo: 'Stamped 04/2023 on collar plate',
          locale: 'en',
        }),
      });
      const res = await dueAssistancePost({
        request: req,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      const json = await res.json() as any;
      if (res.status !== 201) {
        console.error('dueAssistancePost error:', json);
      }
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.voucherCode).toMatch(/^HSR200-[A-Z0-9]{4}$/);
      expect(json.data.voucherDiscountFormatted).toBe('₹200');

      // Verify record stored in database
      const row = await db.prepare(
        'SELECT * FROM due_date_assistance_requests WHERE vehicle_registration = ?'
      ).bind('HR26DK5555').first() as any;

      expect(row).not.toBeNull();
      expect(row.mobile).toBe('9812345678');
      expect(row.voucher_code).toBe(json.data.voucherCode);
      expect(row.voucher_discount_paise).toBe(20000);
    });
  });

  describe('Customer Passwordless Auth with Email OTP & /user/ Workspace Redirect', () => {
    it('creates auth challenge for email and generates verification code', async () => {
      const req = new Request('http://localhost:4321/api/auth/customer/request-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'fleetowner@example.com' }),
      });
      const res = await requestChallengePost({
        request: req,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.channelUsed).toBe('EMAIL_MAGIC_LINK');
      expect(json.data.maskedIdentifier).toContain('***@example.com');
      expect(json.data.challengeId).toBeDefined();

      // Verify challenge in DB
      const challenge = await db.prepare(
        'SELECT * FROM auth_challenges WHERE id = ?'
      ).bind(json.data.challengeId).first() as any;
      expect(challenge).not.toBeNull();
      expect(challenge.identifier).toBe('fleetowner@example.com');
    });

    it('verifies code and returns redirectUrl to /user/ instead of legacy /app/', async () => {
      // 1. Request challenge
      const req1 = new Request('http://localhost:4321/api/auth/customer/request-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'testuser@example.com' }),
      });
      const res1 = await requestChallengePost({
        request: req1,
        locals: { runtime: { env: { DB: db } } },
      } as any);
      const data1 = (await res1.json() as any).data;

      // 2. Verify with code 123456
      const req2 = new Request('http://localhost:4321/api/auth/customer/verify-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: data1.challengeId,
          codeOrToken: '123456',
        }),
      });
      const res2 = await verifyChallengePost({
        request: req2,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(res2.status).toBe(200);
      const data2 = (await res2.json() as any).data;
      expect(data2.authenticated).toBe(true);
      expect(data2.session.redirectUrl).toBe('/user/');
    });
  });

  describe('SEO Diagnostic Tracker in Admin', () => {
    it('allows owner to execute live SEO audit and records score & findings', async () => {
      const token = await jwks.createToken({
        email: 'owner@hsr.test',
      });

      const req = new Request('http://localhost:4321/api/admin/seo/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:4321',
          'cf-access-jwt-assertion': token,
        },
        body: JSON.stringify({ targetPage: '/cng/cylinder-test/' }),
      });

      const res = await seoAuditsPost({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
        url: new URL(req.url),
      } as any);

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.audit.page_url).toBe('/cng/cylinder-test/');
      expect(json.data.audit.score).toBeGreaterThan(90);
      expect(json.data.audit.findings.length).toBeGreaterThan(0);

      // Verify persisted in DB
      const dbRecord = await db.prepare(
        'SELECT * FROM seo_audits WHERE id = ?'
      ).bind(json.data.audit.id).first() as any;
      expect(dbRecord).not.toBeNull();
      expect(dbRecord.score).toBe(json.data.audit.score);
    });

    it('retrieves audit history list for admin dashboard', async () => {
      const token = await jwks.createToken({
        email: 'receptionist@hsr.test',
      });

      const req = new Request('http://localhost:4321/api/admin/seo/', {
        headers: {
          'cf-access-jwt-assertion': token,
        },
      });

      const res = await seoAuditsGet({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(Array.isArray(json.data.audits)).toBe(true);
      expect(json.data.audits.length).toBeGreaterThan(0);
    });
  });

  describe('Social Media & Voucher Settings in Admin Settings', () => {
    it('allows owner to update social media links and retest voucher configuration', async () => {
      const token = await jwks.createToken({
        email: 'owner@hsr.test',
      });

      const req = new Request('http://localhost:4321/api/admin/settings/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:4321',
          'cf-access-jwt-assertion': token,
        },
        body: JSON.stringify({
          social_facebook: 'https://facebook.com/hsrofficial',
          social_instagram: 'https://instagram.com/hsrofficial',
          social_youtube: 'https://youtube.com/@hsrofficial',
          social_twitter: 'https://twitter.com/hsrofficial',
          show_social_media: 1,
          voucher_amount_paise: 20000,
          voucher_enabled: 1,
        }),
      });

      const res = await settingsPost({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.updated).toBe(true);

      // Verify in DB
      const settings = await db.prepare(
        'SELECT social_facebook, social_instagram, show_social_media, voucher_amount_paise, voucher_enabled FROM business_settings WHERE id = 1'
      ).first() as any;

      expect(settings.social_facebook).toBe('https://facebook.com/hsrofficial');
      expect(settings.social_instagram).toBe('https://instagram.com/hsrofficial');
      expect(settings.show_social_media).toBe(1);
      expect(settings.voucher_amount_paise).toBe(20000);
      expect(settings.voucher_enabled).toBe(1);
    });

    it('allows owner to update brand_logo_url in business settings', async () => {
      const token = await jwks.createToken({
        email: 'owner@hsr.test',
      });

      const req = new Request('http://localhost:4321/api/admin/settings/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:4321',
          'cf-access-jwt-assertion': token,
        },
        body: JSON.stringify({
          brand_logo_url: '/images/custom-hsr-logo.png',
        }),
      });

      const res = await settingsPost({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.updated).toBe(true);

      const settings = await db.prepare(
        'SELECT brand_logo_url FROM business_settings WHERE id = 1'
      ).first() as any;

      expect(settings.brand_logo_url).toBe('/images/custom-hsr-logo.png');
    });
  });

  describe('Admin Vouchers Management & Vehicle Linkage API', () => {
    beforeEach(async () => {
      // Seed test vouchers
      await db.prepare(`
        INSERT INTO due_date_assistance_requests 
          (id, vehicle_registration, display_reg_no, mobile, email, cylinder_info, voucher_code, voucher_discount_paise, status)
        VALUES 
          ('vch-001', 'HR26DK5555', 'HR26 DK 5555', '9812345678', 'customer1@test.com', '1 cylinder Maruti', 'HSR200-ABCD', 20000, 'PENDING_ASSISTANCE'),
          ('vch-002', 'DL01AB1234', 'DL01 AB 1234', '9899001122', 'customer2@test.com', 'Commercial taxi', 'HSR200-EFGH', 20000, 'CONTACTED')
      `).run();
    });

    it('rejects unauthenticated requests with HTTP 401', async () => {
      const req = new Request('http://localhost:4321/api/admin/vouchers');
      const res = await vouchersGet({
        request: req,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(res.status).toBe(401);
    });

    it('allows receptionist to list vouchers and returns computed stats', async () => {
      const token = await jwks.createToken({ email: 'receptionist@hsr.test' });
      const req = new Request('http://localhost:4321/api/admin/vouchers', {
        headers: { 'cf-access-jwt-assertion': token },
      });

      const res = await vouchersGet({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.vouchers).toBeInstanceOf(Array);
      expect(json.data.vouchers.length).toBeGreaterThanOrEqual(2);
      expect(json.data.stats.total).toBeGreaterThanOrEqual(2);
      expect(json.data.stats.pending).toBeGreaterThanOrEqual(1);
      expect(json.data.stats.totalDiscountPaise).toBeGreaterThanOrEqual(40000);
    });

    it('filters vouchers by vehicle registration query', async () => {
      const token = await jwks.createToken({ email: 'owner@hsr.test' });
      const req = new Request('http://localhost:4321/api/admin/vouchers?q=HR26DK', {
        headers: { 'cf-access-jwt-assertion': token },
      });

      const res = await vouchersGet({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.vouchers.length).toBe(1);
      expect(json.data.vouchers[0].vehicle_registration).toBe('HR26DK5555');
      expect(json.data.vouchers[0].voucher_code).toBe('HSR200-ABCD');
    });

    it('finds voucher by car registration with spaces or lowercase', async () => {
      const token = await jwks.createToken({ email: 'owner@hsr.test' });
      const req = new Request('http://localhost:4321/api/admin/vouchers?q=hr26dk5555', {
        headers: { 'cf-access-jwt-assertion': token },
      });

      const res = await vouchersGet({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.vouchers.length).toBe(1);
      expect(json.data.vouchers[0].vehicle_registration).toBe('HR26DK5555');
    });

    it('returns empty list when vehicle registration has no voucher', async () => {
      const token = await jwks.createToken({ email: 'receptionist@hsr.test' });
      const req = new Request('http://localhost:4321/api/admin/vouchers?q=UP16ZZ9999', {
        headers: { 'cf-access-jwt-assertion': token },
      });

      const res = await vouchersGet({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.vouchers.length).toBe(0);
    });

    it('successfully updates voucher status to BOOKED', async () => {
      const token = await jwks.createToken({ email: 'receptionist@hsr.test' });
      const req = new Request('http://localhost:4321/api/admin/vouchers', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:4321',
          'cf-access-jwt-assertion': token,
        },
        body: JSON.stringify({
          id: 'vch-001',
          status: 'BOOKED',
          notes: 'Customer arrived and ₹200 discount applied to bill',
        }),
      });

      const res = await vouchersPatch({
        request: req,
        locals: {
          runtime: {
            env: {
              DB: db,
              ACCESS_TEAM_DOMAIN: 'hsr-auth.cloudflareaccess.com',
              ACCESS_AUDIENCE: 'aud-hsr-testing-bay-prod-12345',
            },
          },
        },
      } as any);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.success).toBe(true);

      // Verify in DB
      const updated = await db.prepare(
        'SELECT status, notes FROM due_date_assistance_requests WHERE id = ?'
      ).bind('vch-001').first() as any;

      expect(updated.status).toBe('BOOKED');
      expect(updated.notes).toContain('discount applied');
    });
  });

  describe('Security: Email Customer Isolation (Zero Cross-Contamination)', () => {
    it('strictly isolates parties and sessions when multiple users sign in via email', async () => {
      // 1. User Alice signs in
      const reqA1 = new Request('http://localhost:4321/api/auth/customer/request-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@domain.test' }),
      });
      const resA1 = await requestChallengePost({
        request: reqA1,
        locals: { runtime: { env: { DB: db } } },
      } as any);
      const chalA = (await resA1.json() as any).data.challengeId;

      const reqA2 = new Request('http://localhost:4321/api/auth/customer/verify-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: chalA, codeOrToken: '123456' }),
      });
      const resA2 = await verifyChallengePost({
        request: reqA2,
        locals: { runtime: { env: { DB: db } } },
      } as any);
      const dataA = (await resA2.json() as any).data;

      // 2. User Bob signs in
      const reqB1 = new Request('http://localhost:4321/api/auth/customer/request-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'bob@domain.test' }),
      });
      const resB1 = await requestChallengePost({
        request: reqB1,
        locals: { runtime: { env: { DB: db } } },
      } as any);
      const chalB = (await resB1.json() as any).data.challengeId;

      const reqB2 = new Request('http://localhost:4321/api/auth/customer/verify-challenge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: chalB, codeOrToken: '123456' }),
      });
      const resB2 = await verifyChallengePost({
        request: reqB2,
        locals: { runtime: { env: { DB: db } } },
      } as any);
      const dataB = (await resB2.json() as any).data;

      // Assert Alice and Bob have different, isolated parties
      expect(dataA.session.partyId).toBeDefined();
      expect(dataB.session.partyId).toBeDefined();
      expect(dataA.session.partyId).not.toBe(dataB.session.partyId);

      // Verify contact phones in DB have unique email entries
      const alicePhone = await db.prepare('SELECT * FROM contact_phones WHERE phone_e164 = ?')
        .bind('alice@domain.test').first() as any;
      const bobPhone = await db.prepare('SELECT * FROM contact_phones WHERE phone_e164 = ?')
        .bind('bob@domain.test').first() as any;

      expect(alicePhone).not.toBeNull();
      expect(bobPhone).not.toBeNull();
      expect(alicePhone.id).not.toBe(bobPhone.id);
    });
  });
});
