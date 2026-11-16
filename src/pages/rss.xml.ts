import type { APIRoute } from 'astro';
import { getDb } from '../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb({ locals } as any);
  let posts: any[] = [];

  try {
    const res = await db.prepare(
      'SELECT slug, title_en, summary_en, published_at FROM cms_posts WHERE is_published = 1 ORDER BY published_at DESC LIMIT 25'
    ).all();
    posts = res.results || [];
  } catch {
    // Graceful fallback
  }

  if (posts.length === 0) {
    posts = [
      {
        slug: 'cng-cylinder-hydro-testing-safety-guide',
        title_en: 'Rule 35 Hydro Testing Safety Guide for Motorists',
        summary_en: 'Statutory guidelines and safety inspection standards for automotive CNG cylinders under Gas Cylinders Rules (2016).',
        published_at: new Date().toUTCString(),
      },
      {
        slug: '300-bar-water-jacket-stretch-test',
        title_en: 'How the 300 Bar Water Jacket Test Measures Cylinder Safety',
        summary_en: 'Understanding permanent expansion and hydrostatic volumetric stretch testing in certified water jacket rigs.',
        published_at: new Date().toUTCString(),
      },
    ];
  }

  const itemsXml = posts
    .map(
      (p) => `
    <item>
      <title><![CDATA[${p.title_en}]]></title>
      <link>https://hsrgreenenergy.in/blog/${p.slug}/</link>
      <guid>https://hsrgreenenergy.in/blog/${p.slug}/</guid>
      <description><![CDATA[${p.summary_en || ''}]]></description>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
    </item>`
    )
    .join('');

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>HSR Green Energy — CNG Hydro Testing Updates</title>
    <link>https://hsrgreenenergy.in/</link>
    <description>PESO Form GCT certified automotive CNG cylinder hydro testing laboratory news, safety guides, and corridor updates.</description>
    <language>en-in</language>
    <atom:link href="https://hsrgreenenergy.in/rss.xml" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
