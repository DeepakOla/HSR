import type { Locale } from './constants';
import { getBusinessSettings } from './db';

export interface ContentSection {
  heading?: string;
  subheading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface StructuredPageContent {
  summary?: string;
  sections?: ContentSection[];
}

export interface ParsedPageContent {
  isStructured: boolean;
  isConfigured: boolean;
  summary?: string;
  sections: ContentSection[];
  paragraphs: string[];
}

export function parsePageContent(rawBody: string): ParsedPageContent {
  const trimmed = (rawBody || '').trim();
  const isConfigured = trimmed !== '' && trimmed !== 'SETUP_REQUIRED';

  if (!isConfigured) {
    return {
      isStructured: false,
      isConfigured: false,
      sections: [],
      paragraphs: [],
    };
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as StructuredPageContent;
      if (parsed && (Array.isArray(parsed.sections) || typeof parsed.summary === 'string')) {
        return {
          isStructured: true,
          isConfigured: true,
          summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : undefined,
          sections: Array.isArray(parsed.sections)
            ? parsed.sections.map((sec) => ({
                heading: typeof sec.heading === 'string' && sec.heading.trim() ? sec.heading.trim() : undefined,
                subheading: typeof sec.subheading === 'string' && sec.subheading.trim() ? sec.subheading.trim() : undefined,
                paragraphs: Array.isArray(sec.paragraphs) ? sec.paragraphs.filter((p) => typeof p === 'string' && p.trim()) : undefined,
                bullets: Array.isArray(sec.bullets) ? sec.bullets.filter((b) => typeof b === 'string' && b.trim()) : undefined,
              }))
            : [],
          paragraphs: [],
        };
      }
    } catch {
      // JSON parse failed; fall back to plain text
    }
  }

  // Plain text fallback: split on double newlines for paragraph segmentation
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    isStructured: false,
    isConfigured: true,
    sections: [],
    paragraphs: paragraphs.length > 0 ? paragraphs : [trimmed],
  };
}

export async function getPageContent(db: D1Database, locale: Locale, key: string): Promise<{ title: string; body: string }> {
  try {
    const row = await db
      .prepare('SELECT title, body FROM localized_content WHERE locale = ? AND page_key = ?')
      .bind(locale, key)
      .first<{ title: string; body: string }>();

    if (row) return row;
  } catch {
    // Safe fallback if table or row missing
  }

  // Safe fallback when a page key record has not been inserted
  return {
    title: key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '),
    body: 'SETUP_REQUIRED',
  };
}

export async function getSeoMeta(db: D1Database, locale: Locale) {
  const settings = await getBusinessSettings(db);
  return {
    title: locale === 'hi' ? settings.seo_title_hi : settings.seo_title_en,
    description: locale === 'hi' ? settings.seo_desc_hi : settings.seo_desc_en,
    businessName: locale === 'hi' ? settings.business_name_hi : settings.business_name_en,
    city: settings.city,
  };
}
