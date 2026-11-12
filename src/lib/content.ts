import type { Locale } from './constants';
import { getBusinessSettings, querySingle } from './db';

export async function getPageContent(db: D1Database, locale: Locale, key: string) {
  return querySingle<{ title: string; body: string }>(
    db,
    'SELECT title, body FROM localized_content WHERE locale = ? AND page_key = ?',
    [locale, key]
  );
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
