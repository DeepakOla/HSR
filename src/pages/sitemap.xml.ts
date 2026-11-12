import type { APIRoute } from 'astro';

const paths = [
  '/en/',
  '/en/services/',
  '/en/how-it-works/',
  '/en/check-expiry/',
  '/en/book/',
  '/en/contact/',
  '/en/about/',
  '/hi/',
  '/hi/services/',
  '/hi/how-it-works/',
  '/hi/check-expiry/',
  '/hi/book/',
  '/hi/contact/',
  '/hi/about/',
];

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://SETUP_REQUIRED.example');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((path) => `  <url><loc>${new URL(path, base).toString()}</loc></url>`)
    .join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
