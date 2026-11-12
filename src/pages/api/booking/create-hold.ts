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
  const params = new URLSearchParams({ pa, pn, cu: 'INR', tn: bookingCode });
  if (amountPaise != null) params.set('am', (amountPaise / 100).toFixed(2));
  return `upi://pay?${params.toString()}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'create-hold'), 20, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = await request.json().catch(() => null);
  const parsed = createHoldSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid booking payload', 400);

  const db = getDb({ locals } as any);

  try {
    const result = await createHold(db, { ...parsed.data, source: 'WEB' });
    let upiUri: string | null = null;
    let upiQrDataUrl: string | null = null;

    if (
      result.paymentConfig.vpaId !== 'SETUP_REQUIRED' &&
      result.paymentConfig.payeeName !== 'SETUP_REQUIRED' &&
      result.pricing.advancePaise != null
    ) {
      upiUri = buildUpiUrl(result.paymentConfig.vpaId, result.paymentConfig.payeeName, result.pricing.advancePaise, result.bookingCode);
      upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 280, margin: 1 });
    }

    const responsePayload = {
      ...result,
      upiUri,
      upiQrDataUrl,
      uploadEnabled: result.paymentConfig.r2Enabled && !!env.EVIDENCE_BUCKET,
      uploadUnavailableReason: result.paymentConfig.r2Enabled && env.EVIDENCE_BUCKET
        ? null
        : parsed.data.locale === 'en'
          ? 'Website screenshot upload is not configured. Use the full UTR/reference number or WhatsApp fallback.'
          : 'वेबसाइट स्क्रीनशॉट अपलोड कॉन्फ़िगर नहीं है। पूरा UTR/रेफरेंस नंबर या WhatsApp विकल्प उपयोग करें।',
    };

    return jsonResponse(responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create hold';
    const status = /capacity_exceeded|no longer has enough capacity/i.test(message) ? 409 : 400;
    return errorResponse(message, status, status === 409 ? 'CAPACITY_CONFLICT' : 'HOLD_FAILED');
  }
};
