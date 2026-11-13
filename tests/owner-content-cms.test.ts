import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { GET as contentGet, POST as contentPost } from '../src/pages/api/admin/content';
import { createMockD1 } from './helpers/d1-mock';
import { setupMockJwksServer } from './helpers/jwt-mock';
import { getPageContent, parsePageContent } from '../src/lib/content';

describe('Milestone M5: Bilingual Owner Content CMS', () => {
  async function setupHarness() {
    const db = createMockD1();
    const jwks = await setupMockJwksServer({
      domain: 'hsr-test.cloudflareaccess.com',
      audience: 'test-aud',
    });

    // Provision OWNER and RECEPTIONIST in staff_users
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

  describe('GET /api/admin/content Authentication & Authorization', () => {
    it('rejects unauthenticated request with HTTP 401', async () => {
      const { env } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        headers: {},
      });

      const response = await contentGet({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(401);
    });

    it('rejects non-owner (RECEPTIONIST) request with HTTP 403', async () => {
      const { env, receptionistAuthHeaders } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        headers: receptionistAuthHeaders,
      });

      const response = await contentGet({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(403);
    });

    it('allows OWNER and returns all seeded localized content records', async () => {
      const { env, ownerAuthHeaders } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        headers: ownerAuthHeaders,
      });

      const response = await contentGet({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(200);
      const json: any = await response.json();
      expect(json.data.content).toBeDefined();
      expect(Array.isArray(json.data.content)).toBe(true);

      // Verify default seeded pages are returned
      const pageKeys = json.data.content.map((c: any) => c.page_key);
      expect(pageKeys).toContain('about');
      expect(pageKeys).toContain('services');
      expect(pageKeys).toContain('how-it-works');
      expect(pageKeys).toContain('contact');
    });
  });

  describe('POST /api/admin/content Authorization & Validation', () => {
    it('rejects unauthenticated request with HTTP 401', async () => {
      const { env } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageKey: 'about',
          locale: 'en',
          title: 'About Us',
          body: 'Content',
        }),
      });

      const response = await contentPost({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(401);
    });

    it('rejects non-owner request with HTTP 403', async () => {
      const { env, receptionistAuthHeaders } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        method: 'POST',
        headers: {
          ...receptionistAuthHeaders,
          'content-type': 'application/json',
          origin: 'http://localhost:4321',
        },
        body: JSON.stringify({
          pageKey: 'about',
          locale: 'en',
          title: 'About Us',
          body: 'Content',
        }),
      });

      const response = await contentPost({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(403);
    });

    it('rejects invalid payload (missing title, invalid locale) with HTTP 400', async () => {
      const { env, ownerAuthHeaders } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        method: 'POST',
        headers: {
          ...ownerAuthHeaders,
          'content-type': 'application/json',
          origin: 'http://localhost:4321',
        },
        body: JSON.stringify({
          pageKey: 'about',
          locale: 'fr', // invalid locale
          body: 'Some text',
        }),
      });

      const response = await contentPost({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(400);
      const json: any = await response.json();
      expect(json.error.message).toContain('Invalid content payload');
    });

    it('successfully updates single page content and inserts audit event', async () => {
      const { db, env, ownerAuthHeaders } = await setupHarness();
      const request = new Request('http://localhost:4321/api/admin/content', {
        method: 'POST',
        headers: {
          ...ownerAuthHeaders,
          'content-type': 'application/json',
          origin: 'http://localhost:4321',
        },
        body: JSON.stringify({
          pageKey: 'about',
          locale: 'en',
          title: 'HSR Advanced Hydro Testing Station',
          body: 'We operate certified high-pressure testing facilities.',
        }),
      });

      const response = await contentPost({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(200);
      const json: any = await response.json();
      expect(json.data.ok).toBe(true);
      expect(json.data.count).toBe(1);

      // Verify record updated in D1
      const updated = await db
        .prepare('SELECT title, body FROM localized_content WHERE locale = ? AND page_key = ?')
        .bind('en', 'about')
        .first<{ title: string; body: string }>();

      expect(updated?.title).toBe('HSR Advanced Hydro Testing Station');
      expect(updated?.body).toBe('We operate certified high-pressure testing facilities.');

      // Verify audit event
      const audit = await db
        .prepare('SELECT event_type, actor_id, event_payload_json FROM booking_audit_events WHERE event_type = ?')
        .bind('CONTENT_UPDATED')
        .first<{ event_type: string; actor_id: string; event_payload_json: string }>();

      expect(audit).toBeDefined();
      expect(audit?.actor_id).toBe('owner@hsr.test');
      expect(audit?.event_payload_json).toContain('"pageKey":"about"');
    });

    it('supports batch update with structured JSON payload', async () => {
      const { db, env, ownerAuthHeaders } = await setupHarness();
      const structuredBody = JSON.stringify({
        summary: 'Rigorous hydrostatic cylinder testing conforming to safety codes.',
        sections: [
          {
            heading: 'Testing Methodology',
            subheading: 'High-Pressure Water Jacket Method',
            paragraphs: ['Cylinders are pressurized up to 300 bar inside a water jacket.'],
            bullets: ['Accurate volumetric expansion measurement', 'Ultrasonic flaw scan'],
          },
        ],
      });

      const request = new Request('http://localhost:4321/api/admin/content', {
        method: 'POST',
        headers: {
          ...ownerAuthHeaders,
          'content-type': 'application/json',
          origin: 'http://localhost:4321',
        },
        body: JSON.stringify({
          items: [
            {
              pageKey: 'services',
              locale: 'en',
              title: 'Comprehensive CNG Cylinder Testing',
              body: structuredBody,
            },
            {
              pageKey: 'services',
              locale: 'hi',
              title: 'व्यापक सीएनजी सिलेंडर परीक्षण',
              body: 'पूरी तरह से प्रमाणित परीक्षण सेवाएँ।',
            },
          ],
        }),
      });

      const response = await contentPost({
        request,
        locals: { runtime: { env } },
      } as any);

      expect(response.status).toBe(200);
      const json: any = await response.json();
      expect(json.data.count).toBe(2);

      const enServices = await db
        .prepare('SELECT title, body FROM localized_content WHERE locale = ? AND page_key = ?')
        .bind('en', 'services')
        .first<{ title: string; body: string }>();

      expect(enServices?.title).toBe('Comprehensive CNG Cylinder Testing');
      expect(enServices?.body).toBe(structuredBody);
    });
  });

  describe('Content Parsing & Fallback Logic', () => {
    it('parses SETUP_REQUIRED as unconfigured with no paragraphs or sections', () => {
      const parsed = parsePageContent('SETUP_REQUIRED');
      expect(parsed.isConfigured).toBe(false);
      expect(parsed.isStructured).toBe(false);
      expect(parsed.sections).toEqual([]);
      expect(parsed.paragraphs).toEqual([]);
    });

    it('parses empty or whitespace string as unconfigured', () => {
      const parsed = parsePageContent('   ');
      expect(parsed.isConfigured).toBe(false);
    });

    it('parses multi-paragraph plain text correctly', () => {
      const text = 'First paragraph describing the business.\n\nSecond paragraph explaining the certification requirements.';
      const parsed = parsePageContent(text);

      expect(parsed.isConfigured).toBe(true);
      expect(parsed.isStructured).toBe(false);
      expect(parsed.paragraphs).toHaveLength(2);
      expect(parsed.paragraphs[0]).toBe('First paragraph describing the business.');
      expect(parsed.paragraphs[1]).toBe('Second paragraph explaining the certification requirements.');
    });

    it('parses structured JSON into summary, sections, headings, paragraphs, and bullets', () => {
      const structured = {
        summary: 'Executive summary of testing operations.',
        sections: [
          {
            heading: 'Section One',
            subheading: 'Subhead 1',
            paragraphs: ['Paragraph 1.1', 'Paragraph 1.2'],
            bullets: ['Point 1', 'Point 2'],
          },
        ],
      };

      const parsed = parsePageContent(JSON.stringify(structured));
      expect(parsed.isConfigured).toBe(true);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.summary).toBe('Executive summary of testing operations.');
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].heading).toBe('Section One');
      expect(parsed.sections[0].subheading).toBe('Subhead 1');
      expect(parsed.sections[0].paragraphs).toEqual(['Paragraph 1.1', 'Paragraph 1.2']);
      expect(parsed.sections[0].bullets).toEqual(['Point 1', 'Point 2']);
    });

    it('gracefully handles malformed JSON by falling back to plain text without throwing', () => {
      const badJson = '{ "summary": "test", broken }';
      const parsed = parsePageContent(badJson);

      expect(parsed.isConfigured).toBe(true);
      expect(parsed.isStructured).toBe(false);
      expect(parsed.paragraphs).toEqual([badJson]);
    });

    it('getPageContent returns safe fallback when page key is missing from database', async () => {
      const db = createMockD1();
      const content = await getPageContent(db, 'en', 'non-existent-page');

      expect(content).toBeDefined();
      expect(content.title).toBe('Non existent page');
      expect(content.body).toBe('SETUP_REQUIRED');
    });
  });
});
