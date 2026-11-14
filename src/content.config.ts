import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('HSR Technical Team'),
    tags: z.array(z.string()).default([]),
    locale: z.enum(['en', 'hi']).default('en'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
