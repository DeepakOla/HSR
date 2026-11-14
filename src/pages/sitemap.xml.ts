import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const staticPaths = [
  '/en/', '/en/services/', '/en/how-it-works/', '/en/check-expiry/', '/en/book/', '/en/contact/', '/en/about/', '/en/blog/',
  '/hi/', '/hi/services/', '/hi/how-it-works/', '/hi/check-expiry/', '/hi/book/', '/hi/contact/', '/hi/about/', '/hi/blog/',
];

export const GET: APIRoute = async ({ url }) => {
  const posts = await getCollection('blog', ({ data }) => !data.draft);

  const blogPaths = posts.map((post) => {
    const isHi = post.data.locale === 'hi';
    const slug = post.id.replace(/^(en|hi)\//, '').replace(/\.(md|mdx)$/, '');
    return isHi ? `/hi/blog/${slug}/` : `/en/blog/${slug}/`;
  });

  const allPaths = Array.from(new Set([...staticPaths, ...blogPaths]));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPaths
  .map((path) => {
    const loc = new URL(path, url.origin).toString();
    const isBook = path.includes('/book/');
    const isHome = path === '/en/' || path === '/hi/';
    const priority = isBook ? '1.0' : isHome ? '0.9' : '0.8';
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
