import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse, nowIso } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';

const contentItemSchema = z.object({
  pageKey: z.string().trim().min(2).max(60),
  locale: z.enum(['en', 'hi']),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(30000),
});

const contentBatchSchema = z.object({
  items: z.array(contentItemSchema).min(1).max(20),
});

const contentPayloadSchema = z.union([
  contentItemSchema,
  contentBatchSchema,
]);

export interface LocalizedContentRecord {
  id: number;
  locale: 'en' | 'hi';
  page_key: string;
  title: string;
  body: string;
  updated_at: string;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const { results } = await db
    .prepare('SELECT id, locale, page_key, title, body, updated_at FROM localized_content ORDER BY page_key ASC, locale ASC')
    .all<LocalizedContentRecord>();

  return jsonResponse({ content: results ?? [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const rawBody = await request.json().catch(() => null);
  const parsed = contentPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse('Invalid content payload. Check page key, locale, title, and body.', 400);
  }

  const items = 'items' in parsed.data ? parsed.data.items : [parsed.data];
  const db = getDb({ locals } as any);
  const timestamp = nowIso();

  const statements = items.map((item) =>
    db
      .prepare(
        `INSERT INTO localized_content (locale, page_key, title, body, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(locale, page_key) DO UPDATE SET
           title = excluded.title,
           body = excluded.body,
           updated_at = excluded.updated_at`
      )
      .bind(item.locale, item.pageKey, item.title, item.body, timestamp)
  );

  const auditStatement = db
    .prepare(
      `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
       VALUES(NULL, 'CONTENT_UPDATED', 'STAFF', ?, ?)`
    )
    .bind(
      auth.staff.email,
      JSON.stringify({
        updatedCount: items.length,
        items: items.map((i) => ({ pageKey: i.pageKey, locale: i.locale })),
      })
    );

  await db.batch([...statements, auditStatement]);

  return jsonResponse({
    ok: true,
    count: items.length,
    updatedAt: timestamp,
  });
};
