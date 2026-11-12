import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const bookingCode = url.searchParams.get('bookingCode');
  if (!bookingCode) return errorResponse('bookingCode is required', 400);

  const db = getDb({ locals } as any);
  const evidence = await db
    .prepare(
      `SELECT pe.object_key AS objectKey, pe.mime_type AS mimeType
       FROM payment_evidence pe
       JOIN bookings b ON b.id = pe.booking_id
       WHERE b.booking_code = ?
       ORDER BY pe.uploaded_at DESC
       LIMIT 1`
    )
    .bind(bookingCode)
    .first<{ objectKey: string; mimeType: string }>();

  if (!evidence) return errorResponse('No evidence found', 404);

  const bucket = getRuntimeEnv(locals).EVIDENCE_BUCKET;
  if (!bucket) return errorResponse('R2 bucket not configured', 503);

  const object = await bucket.get(evidence.objectKey);
  if (!object) return errorResponse('Evidence object missing', 404);

  return new Response(object.body, {
    headers: {
      'content-type': evidence.mimeType,
      'cache-control': 'private, max-age=60',
    },
  });
};
