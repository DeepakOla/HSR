import type { APIRoute } from 'astro';
import { submitPaymentEvidence } from '../../../lib/booking-engine';
import { getDb } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { submitEvidenceSchema } from '../../../lib/schemas';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request, env);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'submit-evidence'), 30, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = await request.json().catch(() => null);
  const parsed = submitEvidenceSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid evidence payload', 400);

  try {
    const db = getDb({ locals } as any);
    const result = await submitPaymentEvidence(db, parsed.data.bookingCode, { utr: parsed.data.utr, source: parsed.data.source });
    return jsonResponse(result, 200);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not submit payment evidence', 400, 'EVIDENCE_FAILED');
  }
};
