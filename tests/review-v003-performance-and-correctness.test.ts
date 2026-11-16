import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { POST as fleetEnquiryPost } from '../src/pages/api/public/fleet-enquiry';
import { createMockD1 } from './helpers/d1-mock';

describe('⚡ v0.0.3 Verification: Speed, SEO, Theme Unification, Fleet & Status Correctness', () => {
  it('verifies HomePage.astro has resolved broken anchor links with #refused-cng and #pricing', async () => {
    const homeContent = await fs.readFile('src/components/HomePage.astro', 'utf-8');

    // Both missing anchor sections must exist
    expect(homeContent).toContain('id="refused-cng"');
    expect(homeContent).toContain('id="pricing"');

    // Refused at pump explanation
    expect(homeContent).toContain('Refused CNG at the Pump?');
    expect(homeContent).toContain('Gas Cylinders Rules 2016');

    // Transparent pricing section with dynamic advance
    expect(homeContent).toContain('Transparent Cylinder Hydro Testing Tariffs');
    expect(homeContent).toContain('{advanceFormatted}');

    // Local WebP hero image (0 cross-origin roundtrips)
    expect(homeContent).toContain('src="/images/hydro-test-rig.webp"');
    expect(homeContent).not.toContain('images.unsplash.com');
  });

  it('verifies BaseLayout.astro has og:image, twitter:image, sitemap has /cng/, and FeedbackModal has zero React island overhead', async () => {
    const layoutContent = await fs.readFile('src/layouts/BaseLayout.astro', 'utf-8');

    // OpenGraph and Twitter images
    expect(layoutContent).toContain('property="og:image"');
    expect(layoutContent).toContain('property="twitter:image"');

    // FeedbackModal is native Astro component with 0 KB React island
    expect(layoutContent).toContain("import FeedbackModal from '../components/FeedbackModal.astro';");
    expect(layoutContent).toContain('<FeedbackModal locale={locale} />');
    expect(layoutContent).not.toContain('<FeedbackModal client:idle');

    // Check sitemap contains /cng/
    const sitemapContent = await fs.readFile('src/pages/sitemap.xml.ts', 'utf-8');
    expect(sitemapContent).toContain("'/cng/'");
  });

  it('verifies DueDateChecker lazy-loads RetestDueModal to reduce initial JS payload', async () => {
    const checkerContent = await fs.readFile('src/components/home/DueDateChecker.tsx', 'utf-8');
    expect(checkerContent).toContain("const RetestDueModal = lazy(() => import('./RetestDueModal'));");
    expect(checkerContent).toContain('<Suspense fallback={null}>');
  });

  it('verifies CustomerLayout.astro imports design-tokens.css and unifies industrial palette', async () => {
    const custContent = await fs.readFile('src/layouts/CustomerLayout.astro', 'utf-8');
    expect(custContent).toContain("import '../styles/design-tokens.css';");
    expect(custContent).toContain('--color-primary: #0a1128;');
    expect(custContent).toContain('--color-accent: #ea580c;');
    expect(custContent).toContain('--color-steel: #0284c7;');
    expect(custContent).not.toContain('--color-primary: #15803d;');
  });

  it('verifies InlineBooking.tsx has terms acceptance, PENDING VERIFICATION status, and fleet API call', async () => {
    const inlineContent = await fs.readFile('src/components/booking/InlineBooking.tsx', 'utf-8');

    // Terms and conditions acceptance
    expect(inlineContent).toContain('id="booking-terms-checkbox"');
    expect(inlineContent).toContain('non-refundable upon slot confirmation');

    // Status transition: PENDING VERIFICATION
    expect(inlineContent).toContain('PENDING VERIFICATION');
    expect(inlineContent).toContain('Advance Submitted — Pending Verification');

    // Fleet API call
    expect(inlineContent).toContain('/api/public/fleet-enquiry/');
    expect(inlineContent).toContain('WhatsApp Fleet Coordinator');
  });

  it('validates /api/public/fleet-enquiry/ endpoint correctly stores fleet leads', async () => {
    const db = createMockD1();

    // 1. Rejects invalid mobile
    const badPhoneReq = new Request('https://hsr.example/api/public/fleet-enquiry/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://hsr.example' },
      body: JSON.stringify({
        contactName: 'Fleet Manager',
        contactPhone: '12345',
        vehicles: [{ id: '1', vehicleType: 'Car', cylinderCount: 1, registration: 'HR26AB1234' }],
      }),
    });
    const badRes = await fleetEnquiryPost({ request: badPhoneReq, locals: { runtime: { env: { DB: db } } } } as any);
    expect(badRes.status).toBe(400);

    // 2. Rejects empty vehicles
    const emptyVehiclesReq = new Request('https://hsr.example/api/public/fleet-enquiry/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://hsr.example' },
      body: JSON.stringify({
        contactName: 'Fleet Manager',
        contactPhone: '9876543210',
        vehicles: [],
      }),
    });
    const emptyRes = await fleetEnquiryPost({ request: emptyVehiclesReq, locals: { runtime: { env: { DB: db } } } } as any);
    expect(emptyRes.status).toBe(400);

    // 3. Accepts valid fleet enquiry and logs to DB
    const validReq = new Request('https://hsr.example/api/public/fleet-enquiry/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://hsr.example' },
      body: JSON.stringify({
        contactName: 'Deepak Fleet Logistics',
        contactPhone: '9876543210',
        fleetDate: '2026-11-20',
        vehicles: [
          { id: '1', vehicleType: 'Passenger Car', cylinderCount: 1, registration: 'HR26DQ5551' },
          { id: '2', vehicleType: 'Commercial Van', cylinderCount: 2, registration: 'DL01AB1234' },
        ],
      }),
    });
    const validRes = await fleetEnquiryPost({ request: validReq, locals: { runtime: { env: { DB: db } } } } as any);
    const validJson: any = await validRes.json();
    if (validRes.status !== 200) console.error('fleetEnquiry error:', validJson);
    expect(validRes.status).toBe(200);
    expect(validJson.success).toBe(true);
    expect(validJson.data.vehicleCount).toBe(2);

    // Check DB record
    const event = await db
      .prepare("SELECT * FROM booking_audit_events WHERE event_type = 'FLEET_ENQUIRY' ORDER BY id DESC LIMIT 1")
      .first<any>();
    expect(event).toBeDefined();
    const payload = JSON.parse(event.event_payload_json);
    expect(payload.contactPhone).toBe('9876543210');
    expect(payload.vehicleCount).toBe(2);
  });
});
