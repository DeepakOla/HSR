import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { buildLocalBusinessSchema, buildBreadcrumbSchema } from '../src/lib/seo';
import { calculateReadingTime } from '../src/lib/reading-time';
import type { BusinessSettings } from '../src/lib/types';

describe('Milestone M6: UI/UX Redesign, Blog & Local SEO', () => {
  describe('Direction A Design System Tokens & Styles', () => {
    it('verifies design-tokens.css defines Direction A industrial palette and accessible focus', async () => {
      const css = await fs.readFile('src/styles/design-tokens.css', 'utf-8');

      // Industrial Navy & Steel Blue
      expect(css).toContain('--color-navy-700: #1e3a8a');
      expect(css).toContain('--color-steel-600: #2563eb');

      // Action Amber/Orange
      expect(css).toContain('--color-action: #ea580c');
      expect(css).toContain('--color-action-hover: #c2410c');

      // Touch target minimum (48px)
      expect(css).toContain('min-height: 48px');

      // Keyboard focus visibility
      expect(css).toContain(':focus-visible');
      expect(css).toContain('outline: 3px solid');
    });

    it('verifies BaseLayout.astro imports design-tokens.css and provides Schema.org JSON-LD', async () => {
      const layout = await fs.readFile('src/layouts/BaseLayout.astro', 'utf-8');

      expect(layout).toContain("import '../styles/design-tokens.css'");
      expect(layout).toContain('<script type="application/ld+json"');
      expect(layout).toContain('buildLocalBusinessSchema');
      expect(layout).toContain('copy.nav.blog');
    });
  });

  describe('Local SEO & Schema.org Structured Data', () => {
    const mockSettings: BusinessSettings = {
      business_name_en: 'HSR Hydro Testing',
      business_name_hi: 'एचएसआर हाइड्रो टेस्टिंग',
      city: 'Rewari',
      address_line: 'Near Industrial Area, Rewari, Haryana',
      map_url: 'https://maps.google.com/?cid=12345',
      contact_phone: '+919910055355',
      whatsapp_number: '+919910055355',
      contact_email: 'info@hsr.test',
      vpa_id: 'hsr@upi',
      vpa_payee_name: 'HSR Green Energy',
      hold_minutes: 15,
      flat_advance_paise: 50000,
      r2_enabled: 0,
      evidence_budget_bytes: 10485760,
      timezone: 'Asia/Kolkata',
      seo_title_en: 'HSR CNG Testing Rewari',
      seo_title_hi: 'एचएसआर सीएनजी टेस्टिंग रेवाड़ी',
      seo_desc_en: 'Certified CNG Cylinder Testing in Rewari',
      seo_desc_hi: 'रेवाड़ी में प्रमाणित सीएनजी टेस्टिंग',
    };

    it('builds valid Schema.org AutoRepair schema with populated address and phone', () => {
      const schema: any = buildLocalBusinessSchema({
        settings: mockSettings,
        locale: 'en',
        currentUrl: 'https://hsr-cng.com/en/',
      });

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('AutoRepair');
      expect(schema.name).toBe('HSR Hydro Testing');
      expect(schema.address).toBeDefined();
      expect(schema.address.addressLocality).toBe('Rewari');
      expect(schema.address.addressRegion).toBe('Haryana');
      expect(schema.address.streetAddress).toBe('Near Industrial Area, Rewari, Haryana');
      expect(schema.telephone).toBe('+919910055355');
      expect(schema.hasMap).toBe('https://maps.google.com/?cid=12345');
      expect(schema.priceRange).toBe('₹₹');
    });

    it('omits SETUP_REQUIRED fields from Schema.org output without inventing unverified details', () => {
      const pendingSettings: BusinessSettings = {
        ...mockSettings,
        city: 'SETUP_REQUIRED',
        address_line: 'SETUP_REQUIRED',
        contact_phone: 'SETUP_REQUIRED',
        map_url: 'SETUP_REQUIRED',
      };

      const schema: any = buildLocalBusinessSchema({
        settings: pendingSettings,
        locale: 'en',
        currentUrl: 'https://hsr-cng.com/en/',
      });

      expect(schema.telephone).toBeUndefined();
      expect(schema.hasMap).toBeUndefined();
      expect(schema.address?.streetAddress).toBeUndefined();
    });

    it('builds valid Schema.org BreadcrumbList schema', () => {
      const breadcrumb: any = buildBreadcrumbSchema([
        { name: 'Home', url: 'https://hsr-cng.com/en/' },
        { name: 'Technical Guides', url: 'https://hsr-cng.com/en/blog/' },
        { name: 'Testing Rules', url: 'https://hsr-cng.com/en/blog/cng-testing-rules/' },
      ]);

      expect(breadcrumb['@type']).toBe('BreadcrumbList');
      expect(breadcrumb.itemListElement).toHaveLength(3);
      expect(breadcrumb.itemListElement[0].name).toBe('Home');
      expect(breadcrumb.itemListElement[2].position).toBe(3);
    });
  });

  describe('Reading Time Calculation', () => {
    it('estimates reading time accurately in English', () => {
      const shortText = 'One two three four five';
      expect(calculateReadingTime(shortText, 'en')).toBe('1 min read');

      const longText = new Array(500).fill('word').join(' ');
      expect(calculateReadingTime(longText, 'en')).toBe('3 min read');
    });

    it('estimates reading time accurately in Hindi', () => {
      const shortText = 'एक दो तीन चार पाँच';
      expect(calculateReadingTime(shortText, 'hi')).toBe('1 मिनट पठन');

      const longText = new Array(650).fill('शब्द').join(' ');
      expect(calculateReadingTime(longText, 'hi')).toBe('4 मिनट पठन');
    });
  });

  describe('Astro Content Collections (Blog)', () => {
    it('verifies content.config.ts defines blog collection schema', async () => {
      const config = await fs.readFile('src/content.config.ts', 'utf-8');
      expect(config).toContain("defineCollection({");
      expect(config).toContain("loader: glob({ pattern: '**/*.{md,mdx}'");
      expect(config).toContain('pubDate: z.coerce.date()');
      expect(config).toContain("locale: z.enum(['en', 'hi'])");
    });

    it('verifies initial English and Hindi blog articles exist with valid frontmatter', async () => {
      const enArticle = await fs.readFile('src/content/blog/en/cng-cylinder-testing-rules-frequency-peso.md', 'utf-8');
      expect(enArticle).toContain('title: "CNG Cylinder Hydro Testing Rules & Frequency in India: Complete Guide"');
      expect(enArticle).toContain('locale: "en"');
      expect(enArticle).toContain('tags:');

      const hiArticle = await fs.readFile('src/content/blog/hi/cng-cylinder-hydro-testing-niyam-samay-seemaye.md', 'utf-8');
      expect(hiArticle).toContain('title: "भारत में सीएनजी सिलेंडर हाइड्रो टेस्टिंग के नियम और समय सीमा"');
      expect(hiArticle).toContain('locale: "hi"');
    });
  });

  describe('Bilingual RSS Feeds', () => {
    it('verifies English RSS route handler exports valid GET', async () => {
      const rssSource = await fs.readFile('src/pages/en/rss.xml.ts', 'utf-8');
      expect(rssSource).toContain("import rss from '@astrojs/rss'");
      expect(rssSource).toContain("getCollection('blog'");
      expect(rssSource).toContain("data.locale === 'en'");
    });

    it('verifies Hindi RSS route handler exports valid GET', async () => {
      const rssSource = await fs.readFile('src/pages/hi/rss.xml.ts', 'utf-8');
      expect(rssSource).toContain("import rss from '@astrojs/rss'");
      expect(rssSource).toContain("getCollection('blog'");
      expect(rssSource).toContain("data.locale === 'hi'");
    });
  });
});
