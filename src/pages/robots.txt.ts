import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const body = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /staff/
Disallow: /app/
Disallow: /user/

Sitemap: ${new URL('/sitemap.xml', url.origin).toString()}
`;
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
