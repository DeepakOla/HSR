import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { POST as retestReminderPost } from '../src/pages/api/public/retest-reminder';
import { GET as adminRemindersGet, POST as adminRemindersPost } from '../src/pages/api/admin/reminders';
import { POST as adminSettingsPost } from '../src/pages/api/admin/settings';
import { GET as publicConfigGet } from '../src/pages/api/public/config';
import { createMockD1 } from './helpers/d1-mock';
import { setupMockJwksServer } from './helpers/jwt-mock';

describe('Retest Reminders & Admin Dashboard Synchronization', () => {
  async function setupHarness() {
    const db = createMockD1();
    const jwks = await setupMockJwksServer({
      domain: 'hsr-test.cloudflareaccess.com',
      audience: 'test-aud',
    });

    await db
      .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
      .bind('owner@hsr.test', 'OWNER', 1)
      .run();

    await db
      .prepare('INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, ?)')
      .bind('reception@hsr.test', 'RECEPTIONIST', 1)
      .run();

    const ownerHeadersObj = Object.fromEntries(
      (await jwks.createAuthHeaders({ email: 'owner@hsr.test' })).entries()
    );
    const receptionistHeadersObj = Object.fromEntries(
      (await jwks.createAuthHeaders({ email: 'reception@hsr.test' })).entries()
    );

    const env = {
      DB: db,
      ACCESS_TEAM_DOMAIN: 'hsr-test.cloudflareaccess.com',
      ACCESS_AUDIENCE: 'test-aud',
    };

    return { db, env, ownerAuthHeaders: ownerHeadersObj, receptionistAuthHeaders: receptionistHeadersObj };
  }

  describe('Public Retest Reminder Registration (POST /api/public/retest-reminder)', () => {
    it('successfully registers valid reminder with Indian registration and phone', async () => {
      const { env, db } = await setupHarness();
      const req = new Request('https://hsr.test/api/public/retest-reminder', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://hsr.test',
        },
        body: JSON.stringify({
          vehicleRegistration: 'HR 26 DQ 5551',
          mobile: '9910055355',
          lastTestDate: '2021-10-15',
          dueDate: '2024-10-15',
          reminderChannel: 'WHATSAPP',
          locale: 'en',
        }),
      });

      const res = await retestReminderPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.vehicleRegistration).toBe('HR26DQ5551');

      // Verify D1 record
      const row = await db.prepare('SELECT * FROM retest_reminders WHERE vehicle_registration = ?').bind('HR26DQ5551').first<any>();
      expect(row).toBeDefined();
      expect(row.mobile).toBe('9910055355');
      expect(row.status).toBe('PENDING');
      expect(row.reminder_channel).toBe('WHATSAPP');
    });

    it('rejects invalid mobile numbers with HTTP 400', async () => {
      const { env } = await setupHarness();
      const req = new Request('https://hsr.test/api/public/retest-reminder', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://hsr.test',
        },
        body: JSON.stringify({
          vehicleRegistration: 'DL 01 AB 1234',
          mobile: '12345',
          dueDate: '2025-01-01',
        }),
      });

      const res = await retestReminderPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(400);
    });

    it('rejects cross-origin requests with HTTP 403', async () => {
      const { env } = await setupHarness();
      const req = new Request('https://hsr.test/api/public/retest-reminder', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://attacker.evil',
        },
        body: JSON.stringify({
          vehicleRegistration: 'HR26DQ5551',
          mobile: '9910055355',
          dueDate: '2025-01-01',
        }),
      });

      const res = await retestReminderPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(403);
    });

    it('blocks reminder registration when disabled by administration', async () => {
      const { env, db } = await setupHarness();
      await db.prepare('UPDATE business_settings SET enable_public_reminders = 0 WHERE id = 1').run();

      const req = new Request('https://hsr.test/api/public/retest-reminder', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://hsr.test',
        },
        body: JSON.stringify({
          vehicleRegistration: 'HR26DQ5551',
          mobile: '9910055355',
          dueDate: '2025-01-01',
        }),
      });

      const res = await retestReminderPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(403);
    });
  });

  describe('Admin Reminders API (GET & POST /api/admin/reminders)', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const { env } = await setupHarness();
      const req = new Request('https://hsr.test/api/admin/reminders');
      const res = await adminRemindersGet({ request: req, url: new URL(req.url), locals: { runtime: { env } } } as any);
      expect(res.status).toBe(401);
    });

    it('allows receptionist to list reminders and get summary', async () => {
      const { env, db, receptionistAuthHeaders } = await setupHarness();
      await db.prepare(
        "INSERT INTO retest_reminders (vehicle_registration, mobile, due_date, status) VALUES ('HR26AA1111', '9812345678', '2024-11-20', 'PENDING')"
      ).run();

      const req = new Request('https://hsr.test/api/admin/reminders', {
        headers: receptionistAuthHeaders,
      });

      const res = await adminRemindersGet({ request: req, url: new URL(req.url), locals: { runtime: { env } } } as any);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.data.reminders.length).toBeGreaterThanOrEqual(1);
      expect(data.data.summary.total).toBeGreaterThanOrEqual(1);
    });

    it('allows owner to update reminder status', async () => {
      const { env, db, ownerAuthHeaders } = await setupHarness();
      const insert = await db.prepare(
        "INSERT INTO retest_reminders (vehicle_registration, mobile, due_date, status) VALUES ('HR26BB2222', '9812345679', '2024-12-01', 'PENDING')"
      ).run();

      const reminderId = insert.meta.last_row_id;

      const req = new Request('https://hsr.test/api/admin/reminders', {
        method: 'POST',
        headers: {
          ...ownerAuthHeaders,
          'content-type': 'application/json',
          origin: 'https://hsr.test',
        },
        body: JSON.stringify({
          action: 'UPDATE_STATUS',
          id: reminderId,
          status: 'SENT',
        }),
      });

      const res = await adminRemindersPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(200);

      const updated = await db.prepare('SELECT status FROM retest_reminders WHERE id = ?').bind(reminderId).first<any>();
      expect(updated.status).toBe('SENT');
    });
  });

  describe('Owner Settings & Public Config Synchronization', () => {
    it('allows owner to toggle enable_public_reminders in business_settings', async () => {
      const { env, db, ownerAuthHeaders } = await setupHarness();
      const req = new Request('https://hsr.test/api/admin/settings', {
        method: 'POST',
        headers: {
          ...ownerAuthHeaders,
          'content-type': 'application/json',
          origin: 'https://hsr.test',
        },
        body: JSON.stringify({
          enable_public_reminders: 0,
        }),
      });

      const res = await adminSettingsPost({ request: req, locals: { runtime: { env } } } as any);
      expect(res.status).toBe(200);

      const settings = await db.prepare('SELECT enable_public_reminders FROM business_settings WHERE id = 1').first<any>();
      expect(settings.enable_public_reminders).toBe(0);

      // Verify public config reflects this change
      const configRes = await publicConfigGet({ locals: { runtime: { env } } } as any);
      const configData: any = await configRes.json();
      expect(configData.data.enablePublicReminders).toBe(false);
    });
  });
});
