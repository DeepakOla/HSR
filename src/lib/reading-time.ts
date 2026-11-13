import type { Locale } from './constants';

export function calculateReadingTime(text: string, locale: Locale = 'en'): string {
  if (!text) return locale === 'hi' ? '1 मिनट पठन' : '1 min read';

  // Average reading speed: ~200 words per minute
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 200));

  if (locale === 'hi') {
    return `${minutes} मिनट पठन`;
  }
  return `${minutes} min read`;
}
