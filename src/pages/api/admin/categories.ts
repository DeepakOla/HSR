import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse, nowIso } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';

const categorySchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  sortOrder: z.number().int().min(0).max(500),
  nameEn: z.string().trim().min(2).max(100),
  nameHi: z.string().trim().min(2).max(100),
  cylinderCount: z.number().int().min(1).max(12),
  basePricePaise: z.number().int().min(0).max(100_000_000),
  gstRateBps: z.literal(1800),
  advancePaise: z.number().int().min(0).max(100_000_000).nullable(),
  isActive: z.boolean(),
});

const saveSchema = z.object({
  categories: z.array(categorySchema).length(12),
}).strict().superRefine((value, context) => {
  for (const [index, item] of value.categories.entries()) {
    const gst = Math.round((item.basePricePaise * item.gstRateBps) / 10_000);
    const total = item.basePricePaise + gst;
    if (item.advancePaise !== null && item.advancePaise > total) {
      context.addIssue({ code: 'custom', path: ['categories', index, 'advancePaise'], message: 'Advance cannot exceed the total price' });
    }
  }
});

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const rows = await db.prepare(
    `SELECT id, code, sort_order AS sortOrder, name_en AS nameEn, name_hi AS nameHi,
      cylinder_count AS cylinderCount, base_price_paise AS basePricePaise,
      gst_rate_bps AS gstRateBps, advance_paise AS advancePaise, is_active AS isActive
     FROM vehicle_categories WHERE code LIKE 'CYL_%' ORDER BY sort_order ASC, id ASC`
  ).all();
  return jsonResponse({ categories: rows.results ?? [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid vehicle category settings', 400);

  const active = parsed.data.categories.filter((item) => item.isActive);
  if (!active.length) return errorResponse('At least one vehicle category must remain active', 400);
  const codes = new Set(parsed.data.categories.map((item) => item.code));
  const counts = new Set(parsed.data.categories.map((item) => item.cylinderCount));
  if (codes.size !== 12 || counts.size !== 12 || Array.from({ length: 12 }, (_, i) => i + 1).some((n) => !counts.has(n))) {
    return errorResponse('Exactly one pricing row is required for each cylinder count from 1 to 12', 400);
  }

  const db = getDb({ locals } as any);
  const statements = parsed.data.categories.map((item) => db.prepare(
    `INSERT INTO vehicle_categories(
      code, sort_order, name_en, name_hi, cylinder_count, base_price_paise,
      gst_rate_bps, advance_paise, is_active, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      sort_order = excluded.sort_order,
      name_en = excluded.name_en,
      name_hi = excluded.name_hi,
      cylinder_count = excluded.cylinder_count,
      base_price_paise = excluded.base_price_paise,
      gst_rate_bps = excluded.gst_rate_bps,
      advance_paise = excluded.advance_paise,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at`
  ).bind(
    item.code, item.sortOrder, item.nameEn, item.nameHi, item.cylinderCount,
    item.basePricePaise, item.gstRateBps, item.advancePaise, item.isActive ? 1 : 0, nowIso()
  ));

  await db.batch(statements);
  return jsonResponse({ saved: parsed.data.categories.length });
};
