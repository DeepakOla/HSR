import type { BusinessSettings } from './types';
import type { Locale } from './constants';

export interface LocalBusinessSchemaInput {
  settings: BusinessSettings;
  locale: Locale;
  currentUrl: string;
}

export function buildLocalBusinessSchema(input: LocalBusinessSchemaInput): Record<string, unknown> {
  const { settings, locale, currentUrl } = input;
  const businessName = locale === 'hi' ? settings.business_name_hi : settings.business_name_en;
  const description = locale === 'hi' ? settings.seo_desc_hi : settings.seo_desc_en;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: businessName || 'HSR CNG Cylinder Testing',
    url: currentUrl,
    description: description || 'Certified CNG Cylinder Hydro Testing and Compliance Verification',
    priceRange: '₹₹',
    currenciesAccepted: 'INR',
    paymentAccepted: 'UPI, Cash',
  };

  const isCityValid = settings.city && settings.city !== 'SETUP_REQUIRED';
  const isAddressValid = settings.address_line && settings.address_line !== 'SETUP_REQUIRED';

  if (isCityValid || isAddressValid) {
    schema.address = {
      '@type': 'PostalAddress',
      addressLocality: isCityValid ? settings.city : 'Rewari',
      addressRegion: 'Haryana',
      addressCountry: 'IN',
      ...(isAddressValid ? { streetAddress: settings.address_line } : {}),
    };
  }

  if (settings.contact_phone && settings.contact_phone !== 'SETUP_REQUIRED') {
    schema.telephone = settings.contact_phone;
  }

  if (settings.map_url && settings.map_url !== 'SETUP_REQUIRED' && settings.map_url.startsWith('https://')) {
    schema.hasMap = settings.map_url;
  }

  return schema;
}

export function buildBreadcrumbSchema(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
