import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const body = `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', url.origin).toString()}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
