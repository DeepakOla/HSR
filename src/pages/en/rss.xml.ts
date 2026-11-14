import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  const posts = await getCollection('blog', ({ data }) => !data.draft && data.locale === 'en');
  posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'HSR CNG Cylinder Hydro Testing Technical Feed',
    description: 'Official guides, safety standards, and technical articles for CNG cylinder hydro testing in India.',
    site: context.site || 'https://hsr-cng.com',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/en/blog/${post.id.replace(/^en\//, '').replace(/\.(md|mdx)$/, '')}/`,
    })),
  });
};
