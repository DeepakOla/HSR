import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse, nowIso, sha256 } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'upload-evidence'), 10, 60_000)) {
    return errorResponse('Too many uploads, try again later', 429, 'RATE_LIMITED');
  }

  if (!env.EVIDENCE_BUCKET) {
    return errorResponse('Website screenshot upload is unavailable. Use full UTR and WhatsApp fallback.', 503, 'R2_UNAVAILABLE');
  }

  const form = await request.formData();
  const bookingCode = form.get('bookingCode');
  const statusToken = form.get('statusToken');
  const file = form.get('file');

  if (typeof bookingCode !== 'string' || typeof statusToken !== 'string' || statusToken.length < 24 || !(file instanceof File)) {
    return errorResponse('Booking reference, secure status token and image file are required', 400);
  }
  if (!ALLOWED_MIME.has(file.type)) return errorResponse('Unsupported image format', 400);

  const maxBytes = Number(env.R2_MAX_EVIDENCE_BYTES ?? '1048576');
  if (!Number.isFinite(maxBytes) || maxBytes < 1 || file.size < 1 || file.size > maxBytes) {
    return errorResponse('Image exceeds the upload size limit', 413, 'FILE_TOO_LARGE');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime || detectedMime !== file.type) {
    return errorResponse('Image content does not match its declared file type', 400, 'INVALID_FILE_CONTENT');
  }

  const db = getDb({ locals } as any);
  const settings = await db
    .prepare('SELECT evidence_budget_bytes AS budgetBytes FROM business_settings WHERE id = 1')
    .first<{ budgetBytes: number }>();
  if (!settings) return errorResponse('Business settings are not initialized', 503);

  const currentUsage = await db.prepare('SELECT COALESCE(SUM(byte_size), 0) AS total FROM payment_evidence')
    .first<{ total: number }>();
  const totalUsed = currentUsage?.total ?? 0;
  if (totalUsed + file.size > settings.budgetBytes) {
    return errorResponse('Evidence storage budget reached. Use UTR and WhatsApp fallback.', 507, 'STORAGE_GUARDRAIL');
  }

  const submittedAt = nowIso();
  const booking = await db.prepare(
    `SELECT id FROM bookings
     WHERE booking_code = ?
       AND status_token_hash = ?
       AND reservation_state = 'HELD'
       AND payment_state = 'ADVANCE_PENDING'
       AND hold_expires_at > ?`
  ).bind(bookingCode, sha256(statusToken), submittedAt).first<{ id: number }>();
  if (!booking) return errorResponse('Booking not found, expired, or no longer accepting evidence', 404);

  const key = `evidence/${submittedAt.slice(0, 10)}/${crypto.randomUUID()}-${bookingCode}`;
  await env.EVIDENCE_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: detectedMime },
    customMetadata: { bookingCode },
  });

  try {
    const results = await db.batch([
      db.prepare(
        `UPDATE bookings
         SET payment_state = 'EVIDENCE_SUBMITTED',
             reservation_state = 'PENDING_VERIFICATION',
             payment_submitted_at = ?,
             updated_at = ?
         WHERE id = ?
           AND status_token_hash = ?
           AND reservation_state = 'HELD'
           AND payment_state = 'ADVANCE_PENDING'
           AND hold_expires_at > ?`
      ).bind(submittedAt, submittedAt, booking.id, sha256(statusToken), submittedAt),
      db.prepare(
        `INSERT INTO payment_evidence(booking_id, object_key, mime_type, byte_size, sha256, uploaded_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM bookings
           WHERE id = ? AND reservation_state = 'PENDING_VERIFICATION'
             AND payment_state = 'EVIDENCE_SUBMITTED' AND payment_submitted_at = ?
         )`
      ).bind(booking.id, key, detectedMime, file.size, await crypto.subtle.digest('SHA-256', bytes), submittedAt, booking.id, submittedAt),
      db.prepare(
        `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
         SELECT ?, 'PAYMENT_SCREENSHOT_SUBMITTED', 'CUSTOMER', 'WEB', ?
         WHERE EXISTS (
           SELECT 1 FROM bookings
           WHERE id = ? AND reservation_state = 'PENDING_VERIFICATION'
             AND payment_state = 'EVIDENCE_SUBMITTED' AND payment_submitted_at = ?
         )`
      ).bind(booking.id, JSON.stringify({ mimeType: detectedMime, byteSize: file.size }), booking.id, submittedAt),
    ]);

    if ((results[0]?.meta.changes ?? 0) !== 1) {
      await env.EVIDENCE_BUCKET.delete(key);
      return errorResponse('Booking changed or expired before evidence was submitted', 409, 'BOOKING_STATE_CHANGED');
    }
    return jsonResponse({ uploaded: true, paymentState: 'EVIDENCE_SUBMITTED', reservationState: 'PENDING_VERIFICATION' });
  } catch {
    await env.EVIDENCE_BUCKET.delete(key);
    return errorResponse('Could not save payment evidence. Please try again or use WhatsApp.', 500, 'EVIDENCE_SAVE_FAILED');
  }
};
