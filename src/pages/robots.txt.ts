import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://SETUP_REQUIRED.example');
  const body = `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', base).toString()}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
