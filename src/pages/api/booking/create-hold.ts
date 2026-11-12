import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { createHold } from '../../../lib/booking-engine';
import { getDb } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { createHoldSchema } from '../../../lib/schemas';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

function buildUpiUrl(pa: string, pn: string, amountPaise: number | null, bookingCode: string) {
  const params = new URLSearchParams({
    pa,
    pn,
    cu: 'INR',
    tn: bookingCode,
  });
  if (amountPaise != null) {
    params.set('am', (amountPaise / 100).toFixed(2));
  }
  return `upi://pay?${params.toString()}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request, env);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'create-hold'), 20, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = await request.json().catch(() => null);
  const parsed = createHoldSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid booking payload', 400);

  const db = getDb({ locals } as any);

  const idempotencyExisting = await db
    .prepare('SELECT response_json AS responseJson FROM idempotency_keys WHERE idempotency_key = ? AND endpoint = ?')
    .bind(parsed.data.idempotencyKey, 'create-hold')
    .first<{ responseJson: string }>();

  if (idempotencyExisting) {
    return jsonResponse(JSON.parse(idempotencyExisting.responseJson));
  }

  try {
    const result = await createHold(db, parsed.data);

    let upiUri: string | null = null;
    let upiQrDataUrl: string | null = null;
    if (result.paymentConfig.vpaId !== 'SETUP_REQUIRED' && result.paymentConfig.payeeName !== 'SETUP_REQUIRED' && result.pricing.advancePaise != null) {
      upiUri = buildUpiUrl(result.paymentConfig.vpaId, result.paymentConfig.payeeName, result.pricing.advancePaise, result.bookingCode);
      upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 1 });
    }

    const responsePayload = {
      ...result,
      upiUri,
      upiQrDataUrl,
      uploadEnabled: result.paymentConfig.r2Enabled,
      uploadUnavailableReason: result.paymentConfig.r2Enabled
        ? null
        : parsed.data.locale === 'en'
          ? 'Website screenshot upload unavailable. Use full UTR and WhatsApp fallback.'
          : 'वेबसाइट स्क्रीनशॉट अपलोड उपलब्ध नहीं है। पूरा UTR और WhatsApp विकल्प उपयोग करें।',
    };

    await db
      .prepare('INSERT INTO idempotency_keys(idempotency_key, endpoint, response_json) VALUES(?, ?, ?)')
      .bind(parsed.data.idempotencyKey, 'create-hold', JSON.stringify(responsePayload))
      .run();

    return jsonResponse(responsePayload, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not create hold', 409, 'HOLD_FAILED');
  }
};
