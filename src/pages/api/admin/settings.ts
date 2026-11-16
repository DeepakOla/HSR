import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getBusinessSettings, getDb } from '../../../lib/db';
import { errorResponse, jsonResponse, nowIso } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';

const editableSchema = z.object({
  business_name_en: z.string().trim().min(2).max(120).optional(),
  business_name_hi: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  address_line: z.string().trim().min(3).max(300).optional(),
  map_url: z.string().trim().max(500).refine((value) => value === 'SETUP_REQUIRED' || /^https:\/\//i.test(value), 'Map URL must use HTTPS').optional(),
  contact_phone: z.string().trim().min(7).max(20).optional(),
  whatsapp_number: z.string().trim().min(7).max(20).optional(),
  contact_email: z.union([z.literal('SETUP_REQUIRED'), z.email().max(160)]).optional(),
  vpa_id: z.string().trim().min(3).max(120).optional(),
  vpa_payee_name: z.string().trim().min(2).max(120).optional(),
  hold_minutes: z.number().int().min(5).max(120).optional(),
  flat_advance_paise: z.number().int().min(0).max(10_000_000).optional(),
  hide_pricing_until_vehicle_details: z.number().int().min(0).max(1).optional(),
  enable_public_reminders: z.number().int().min(0).max(1).optional(),
  r2_enabled: z.number().int().min(0).max(1).optional(),
  whatsapp_mode: z.enum(['STANDARD', 'CLOUD_API']).optional(),
  whatsapp_api_key: z.string().trim().max(500).optional(),
  whatsapp_phone_number_id: z.string().trim().max(100).optional(),
  whatsapp_template_name: z.string().trim().max(100).optional(),
  promo_code: z.string().trim().max(50).optional(),
  promo_discount_type: z.enum(['FLAT', 'PERCENT']).optional(),
  promo_discount_value: z.number().int().min(0).max(100_000).optional(),
  promo_banner_text: z.string().trim().max(500).optional(),
  promo_banner_active: z.number().int().min(0).max(1).optional(),
  promo_auto_apply: z.number().int().min(0).max(1).optional(),
  show_floating_whatsapp: z.number().int().min(0).max(1).optional(),
  social_facebook: z.string().trim().max(300).optional(),
  social_instagram: z.string().trim().max(300).optional(),
  social_youtube: z.string().trim().max(300).optional(),
  social_twitter: z.string().trim().max(300).optional(),
  social_whatsapp: z.string().trim().max(300).optional(),
  show_social_media: z.number().int().min(0).max(1).optional(),
  voucher_amount_paise: z.number().int().min(0).max(10_000_000).optional(),
  voucher_enabled: z.number().int().min(0).max(1).optional(),
  brand_logo_url: z.string().trim().max(500).optional(),
  seo_title_en: z.string().trim().min(3).max(160).optional(),
  seo_title_hi: z.string().trim().min(3).max(160).optional(),
  seo_desc_en: z.string().trim().min(10).max(320).optional(),
  seo_desc_hi: z.string().trim().min(10).max(320).optional(),
}).strict();

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;
  const settings = await getBusinessSettings(getDb({ locals } as any));
  return jsonResponse({ settings });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = editableSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid business settings. Check all fields and try again.', 400);
  const payload = parsed.data;
  const keys = Object.keys(payload) as (keyof typeof payload)[];
  if (keys.length === 0) return errorResponse('No settings were supplied', 400);

  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => payload[key]);
  const db = getDb({ locals } as any);
  const timestamp = nowIso();

  await db.batch([
    db.prepare(`UPDATE business_settings SET ${assignments}, updated_at = ? WHERE id = 1`).bind(...values, timestamp),
    db.prepare(
      `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
       VALUES(NULL, 'BUSINESS_SETTINGS_UPDATED', 'STAFF', ?, ?)`
    ).bind(auth.staff.email, JSON.stringify({ fields: keys })),
  ]);

  return jsonResponse({ updated: true, fields: keys });
};
