import crypto from 'node:crypto';
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse, nowIso } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request, env);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'upload-evidence'), 10, 60_000)) {
    return errorResponse('Too many uploads, try again later', 429, 'RATE_LIMITED');
  }

  const db = getDb({ locals } as any);
  const settings = await db
    .prepare('SELECT r2_enabled AS r2Enabled, evidence_budget_bytes AS budgetBytes FROM business_settings WHERE id = 1')
    .first<{ r2Enabled: number; budgetBytes: number }>();

  if (!settings || settings.r2Enabled !== 1 || !env.EVIDENCE_BUCKET) {
    return errorResponse('Website screenshot upload is unavailable. Use UTR and WhatsApp fallback.', 503, 'R2_UNAVAILABLE');
  }

  const form = await request.formData();
  const bookingCode = form.get('bookingCode');
  const file = form.get('file');

  if (typeof bookingCode !== 'string' || !(file instanceof File)) {
    return errorResponse('bookingCode and file are required', 400);
  }

  if (!ALLOWED_MIME.has(file.type)) return errorResponse('Unsupported file type', 400);

  const maxBytes = Number(env.R2_MAX_EVIDENCE_BYTES ?? '1048576');
  if (file.size > maxBytes) return errorResponse('File exceeds upload limit', 413, 'FILE_TOO_LARGE');

  const currentUsage = await db.prepare('SELECT COALESCE(SUM(byte_size), 0) AS total FROM payment_evidence').first<{ total: number }>();
  const totalUsed = currentUsage?.total ?? 0;
  if (totalUsed + file.size > settings.budgetBytes) {
    return errorResponse('Evidence storage budget reached. Use UTR/WhatsApp fallback.', 507, 'STORAGE_GUARDRAIL');
  }

  const booking = await db
    .prepare('SELECT id FROM bookings WHERE booking_code = ?')
    .bind(bookingCode)
    .first<{ id: number }>();
  if (!booking) return errorResponse('Booking not found', 404);

  const key = `evidence/${nowIso().slice(0, 10)}/${crypto.randomUUID()}-${bookingCode}`;
  const bytes = await file.arrayBuffer();
  await env.EVIDENCE_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { bookingCode },
  });

  await db
    .prepare('INSERT INTO payment_evidence(booking_id, object_key, mime_type, byte_size, uploaded_at) VALUES(?, ?, ?, ?, ?)')
    .bind(booking.id, key, file.type, file.size, nowIso())
    .run();

  await db
    .prepare(
      `UPDATE bookings
       SET payment_state = 'EVIDENCE_SUBMITTED',
           reservation_state = 'PENDING_VERIFICATION',
           payment_submitted_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(nowIso(), nowIso(), booking.id)
    .run();

  return jsonResponse({ uploaded: true });
};
