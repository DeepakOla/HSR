import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getBusinessSettings, getDb } from '../../../lib/db';
import { errorResponse, jsonResponse, nowIso } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

const updateSchema = z.object({
  business_name_en: z.string().min(2).optional(),
  business_name_hi: z.string().min(2).optional(),
  city: z.string().min(2).optional(),
  address_line: z.string().min(2).optional(),
  map_url: z.string().min(4).optional(),
  contact_phone: z.string().min(7).optional(),
  whatsapp_number: z.string().min(7).optional(),
  contact_email: z.union([z.literal('SETUP_REQUIRED'), z.string().trim()]).optional(),
  vpa_id: z.string().min(3).optional(),
  vpa_payee_name: z.string().min(2).optional(),
  hold_minutes: z.number().int().min(5).max(120).optional(),
  r2_enabled: z.number().int().min(0).max(1).optional(),
  seo_title_en: z.string().min(3).optional(),
  seo_title_hi: z.string().min(3).optional(),
  seo_desc_en: z.string().min(10).optional(),
  seo_desc_hi: z.string().min(10).optional(),
});

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const settings = await getBusinessSettings(db);
  return jsonResponse({ settings });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid settings payload', 400);
  const payload = parsed.data;
  if (Object.keys(payload).length === 0) return errorResponse('No settings provided', 400);

  const updates = Object.keys(payload)
    .map((key) => `${key} = ?`)
    .join(', ');

  const values = Object.values(payload);

  const db = getDb({ locals } as any);
  await db
    .prepare(`UPDATE business_settings SET ${updates}, updated_at = ? WHERE id = 1`)
    .bind(...values, nowIso())
    .run();

  return jsonResponse({ updated: true });
};
