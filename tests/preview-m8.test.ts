import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { createMockD1 } from './helpers/d1-mock';
import { onRequest as middlewareOnRequest } from '../src/middleware';
import { POST as feedbackPost } from '../src/pages/api/feedback';
import { POST as resetTestDataPost } from '../src/pages/api/admin/reset-test-data';
import { POST as createHoldPost } from '../src/pages/api/booking/create-hold';

describe('Milestone M8: Preview Deployment Readiness & Public Demo Experience', () => {
  describe('Pillar 1: Security Headers & Middleware Isolation', () => {
    it('injects standard defensive security headers on all responses', async () => {
      const request = new Request('https://hsr.example/en/');
      const context: any = {
        url: new URL('https://hsr.example/en/'),
        request,
        cookies: {
          get: vi.fn(),
          set: vi.fn(),
        },
        redirect: vi.fn(),
        locals: { runtime: { env: {} } },
      };

      const next = vi.fn().mockResolvedValue(
        new Response('<h1>HSR CNG</h1>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      );

      const response = await middlewareOnRequest(context, next);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    });

    it('injects X-Robots-Tag: noindex, nofollow on preview and dev hostnames', async () => {
      const previewHosts = [
        'https://hsr-preview.workers.dev/en/',
        'https://branch-preview.hsr.pages.dev/hi/',
        'http://localhost:4321/en/',
        'http://127.0.0.1:8787/en/',
      ];

      for (const urlStr of previewHosts) {
        const url = new URL(urlStr);
        const context: any = {
          url,
          request: new Request(urlStr),
          cookies: { get: vi.fn(), set: vi.fn() },
          redirect: vi.fn(),
          locals: { runtime: { env: {} } },
        };
        const next = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
        const response = await middlewareOnRequest(context, next);
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
      }
    });

    it('does not inject X-Robots-Tag on production custom domain', async () => {
      const url = new URL('https://hsrtesting.in/en/');
      const context: any = {
        url,
        request: new Request('https://hsrtesting.in/en/'),
        cookies: { get: vi.fn(), set: vi.fn() },
        redirect: vi.fn(),
        locals: { runtime: { env: { APP_BASE_URL: 'https://hsrtesting.in' } } },
      };
      const next = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
      const response = await middlewareOnRequest(context, next);
      expect(response.headers.get('X-Robots-Tag')).toBeNull();
    });
  });

  describe('Pillar 2: Public Feedback API (/api/feedback)', () => {
    it('rejects cross-origin feedback submissions', async () => {
      const db = createMockD1();
      const request = new Request('https://preview.hsr.example/api/feedback/', {
        method: 'POST',
        headers: {
          'Origin': 'https://malicious.evil',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment: 'Testing feedback' }),
      });

      const response = await feedbackPost({
        request,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(response.status).toBe(403);
    });

    it('rejects comments that are too short (< 3 characters)', async () => {
      const db = createMockD1();
      const request = new Request('https://preview.hsr.example/api/feedback/', {
        method: 'POST',
        headers: {
          'Origin': 'https://preview.hsr.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment: 'hi' }),
      });

      const response = await feedbackPost({
        request,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toBe('Validation failed');
    });

    it('records valid feedback and returns localized thank you message', async () => {
      const db = createMockD1();
      const request = new Request('https://preview.hsr.example/api/feedback/', {
        method: 'POST',
        headers: {
          'Origin': 'https://preview.hsr.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating: 5,
          category: 'ui_ux',
          name: 'Preview Tester',
          contact: 'tester@example.com',
          comment: 'The booking wizard layout and cylinder selector look very sharp!',
          locale: 'en',
        }),
      });

      const response = await feedbackPost({
        request,
        locals: { runtime: { env: { DB: db } } },
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('Thank you for your feedback');

      // Check that feedback was inserted into audit events
      const events = await db.prepare(
        "SELECT * FROM booking_audit_events WHERE event_type = 'DEMO_FEEDBACK'"
      ).all();
      expect(events.results.length).toBeGreaterThan(0);
      const payload = JSON.parse(events.results[0].event_payload_json as string);
      expect(payload.rating).toBe(5);
      expect(payload.name).toBe('Preview Tester');
    });
  });

  describe('Pillar 3: Test Data Reset Helper (/api/admin/reset-test-data)', () => {
    it('blocks unauthenticated resets when host is not preview/dev', async () => {
      const db = createMockD1();
      const env = {
        DB: db,
        APP_BASE_URL: 'https://hsrtesting.in',
        ACCESS_TEAM_DOMAIN: 'hsr.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'aud-test',
      };

      const request = new Request('https://hsrtesting.in/api/admin/reset-test-data/', {
        method: 'POST',
        headers: {
          'Origin': 'https://hsrtesting.in',
        },
      });

      const response = await resetTestDataPost({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(401);
    });

    it('allows resetting test bookings and active holds in preview environment', async () => {
      const db = createMockD1();
      const env = {
        DB: db,
        APP_BASE_URL: 'https://preview.hsr.example',
      };

      // Set UPI in settings to allow create-hold
      await db
        .prepare('UPDATE business_settings SET vpa_id = ?, vpa_payee_name = ? WHERE id = 1')
        .bind('hsr@okaxis', 'HSR')
        .run();

      // Create a valid hold using createHoldPost
      const createReq = new Request('https://preview.hsr.example/api/booking/create-hold', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://preview.hsr.example',
        },
        body: JSON.stringify({
          locale: 'en',
          slotSnapshotId: 185,
          categoryId: 4,
          vehicleType: 'Car',
          customerName: 'Preview Tester',
          mobile: '9876543210',
          vehicleRegistration: 'HR26DQ5551',
          source: 'WEB',
          idempotencyKey: 'idemp-preview-test-001',
        }),
      });

      const createRes = await createHoldPost({
        request: createReq,
        locals: { runtime: { env } },
      } as any);
      expect(createRes.status).toBe(201);

      // Verify that booking was created in HELD state
      const beforeReset = await db
        .prepare("SELECT reservation_state FROM bookings WHERE reservation_state = 'HELD'")
        .all();
      expect(beforeReset.results.length).toBeGreaterThanOrEqual(1);

      // Invoke reset-test-data endpoint
      const resetReq = new Request('https://preview.hsr.example/api/admin/reset-test-data/', {
        method: 'POST',
        headers: {
          'Origin': 'https://preview.hsr.example',
        },
      });

      const resetRes = await resetTestDataPost({
        request: resetReq,
        locals: { runtime: { env } },
      } as any);

      expect(resetRes.status).toBe(200);
      const data = await resetRes.json();
      expect(data.success).toBe(true);
      expect(data.bookingsCancelled).toBeGreaterThanOrEqual(1);

      // Verify that active HELD bookings are now 0
      const afterReset = await db
        .prepare("SELECT reservation_state FROM bookings WHERE reservation_state = 'HELD'")
        .all();
      expect(afterReset.results.length).toBe(0);
    });
  });

  describe('Pillar 4: Cloudflare Preview Isolation Configuration', () => {
    it('verifies wrangler.jsonc has separate preview D1 and NO R2 bucket', () => {
      const wranglerPath = path.resolve(__dirname, '../wrangler.jsonc');
      const content = fs.readFileSync(wranglerPath, 'utf8');

      // Strip JSON comments safely
      const clean = content.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');
      const parsed = JSON.parse(clean);

      // Production D1
      expect(parsed.d1_databases[0].database_name).toBe('hsr_green_energy_prod');
      expect(parsed.d1_databases[0].database_id).toBe('2167157a-4c00-4063-b183-c0a5bd12ed5d');

      // Production R2 bucket present at root
      expect(parsed.r2_buckets).toBeDefined();
      expect(parsed.r2_buckets[0].bucket_name).toBe('hsr-prod');

      // Preview environment isolated
      expect(parsed.env).toBeDefined();
      expect(parsed.env.preview).toBeDefined();
      expect(parsed.env.preview.d1_databases[0].database_name).toBe('hsr_green_energy_preview');
      expect(parsed.env.preview.d1_databases[0].database_id).toBe('3220c6e5-64ff-4874-9d5d-0e237f5af9ad');

      // CRITICAL INVARIANT: Preview must NOT have r2_buckets configured
      expect(parsed.env.preview.r2_buckets).toBeUndefined();
    });

    it('verifies .nvmrc and .node-version enforce Node 22 for Cloudflare Workers Builds', () => {
      const nvmrcPath = path.resolve(__dirname, '../.nvmrc');
      const nodeVersionPath = path.resolve(__dirname, '../.node-version');

      expect(fs.existsSync(nvmrcPath)).toBe(true);
      expect(fs.existsSync(nodeVersionPath)).toBe(true);

      const nvmrc = fs.readFileSync(nvmrcPath, 'utf8').trim();
      const nodeVersion = fs.readFileSync(nodeVersionPath, 'utf8').trim();

      expect(nvmrc).toBe('22');
      expect(nodeVersion).toBe('22');
    });

    it('verifies public/_headers contains defensive headers', () => {
      const headersPath = path.resolve(__dirname, '../public/_headers');
      expect(fs.existsSync(headersPath)).toBe(true);
      const headers = fs.readFileSync(headersPath, 'utf8');
      expect(headers).toContain('X-Content-Type-Options: nosniff');
      expect(headers).toContain('X-Frame-Options: DENY');
      expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
      expect(headers).toContain('Permissions-Policy: camera=()');
    });
  });
});
