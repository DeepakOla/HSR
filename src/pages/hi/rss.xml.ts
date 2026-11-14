import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  const posts = await getCollection('blog', ({ data }) => !data.draft && data.locale === 'hi');
  posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'एचएसआर सीएनजी सिलेंडर हाइड्रो परीक्षण तकनीकी फ़ीड',
    description: 'भारत में सीएनजी सिलेंडर हाइड्रो टेस्टिंग के आधिकारिक नियम, सुरक्षा मानक और तकनीकी लेख।',
    site: context.site || 'https://hsr-cng.com',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/hi/blog/${post.id.replace(/^hi\//, '').replace(/\.(md|mdx)$/, '')}/`,
    })),
  });
};
