import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { errorResponse, jsonResponse } from '../../../lib/utils';

const cmsPostSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().min(3).max(100),
  title_en: z.string().trim().min(3).max(200),
  title_hi: z.string().trim().min(3).max(200),
  summary_en: z.string().trim().max(500).optional(),
  summary_hi: z.string().trim().max(500).optional(),
  content_markdown_en: z.string().trim().min(10),
  content_markdown_hi: z.string().trim().min(10),
  category: z.enum(['SAFETY_GUIDE', 'NEWS_ANNOUNCEMENT', 'VIDEO_TUTORIAL', 'COMMERCIAL_FLEET']).default('SAFETY_GUIDE'),
  cover_image_r2_key: z.string().trim().optional(),
  video_url: z.string().trim().url().optional().or(z.literal('')),
  is_published: z.number().int().min(0).max(1).default(1),
  instagram_media_id: z.string().trim().optional(),
  author_name: z.string().trim().default('HSR Technical Team'),
});

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const db = getDb({ locals } as any);

  if (slug) {
    const post = await db.prepare('SELECT * FROM cms_posts WHERE slug = ?').bind(slug).first();
    return jsonResponse({ post });
  }

  const posts = await db.prepare('SELECT * FROM cms_posts ORDER BY published_at DESC').all();
  return jsonResponse({ posts: posts.results || [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = cmsPostSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid post payload. Check all fields.', 400);
  }

  const p = parsed.data;
  const db = getDb({ locals } as any);
  const now = new Date().toISOString();

  if (p.id) {
    await db.prepare(`
      UPDATE cms_posts SET
        slug = ?, title_en = ?, title_hi = ?, summary_en = ?, summary_hi = ?,
        content_markdown_en = ?, content_markdown_hi = ?, category = ?,
        cover_image_r2_key = ?, video_url = ?, is_published = ?,
        instagram_media_id = ?, author_name = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      p.slug, p.title_en, p.title_hi, p.summary_en || null, p.summary_hi || null,
      p.content_markdown_en, p.content_markdown_hi, p.category,
      p.cover_image_r2_key || null, p.video_url || null, p.is_published,
      p.instagram_media_id || null, p.author_name, now, p.id
    ).run();

    return jsonResponse({ updated: true, id: p.id });
  } else {
    const newId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO cms_posts (
        id, slug, title_en, title_hi, summary_en, summary_hi,
        content_markdown_en, content_markdown_hi, category,
        cover_image_r2_key, video_url, is_published, instagram_media_id,
        author_name, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId, p.slug, p.title_en, p.title_hi, p.summary_en || null, p.summary_hi || null,
      p.content_markdown_en, p.content_markdown_hi, p.category,
      p.cover_image_r2_key || null, p.video_url || null, p.is_published,
      p.instagram_media_id || null, p.author_name, now, now, now
    ).run();

    return jsonResponse({ created: true, id: newId });
  }
};
