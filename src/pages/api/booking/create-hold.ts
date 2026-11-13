import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { createHold } from '../../../lib/booking-engine';
import { getBusinessSettings, getDb, querySingle } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { createHoldSchema } from '../../../lib/schemas';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateVehicleRegistration } from '../../../lib/vehicle-registration';

const DEFAULT_SUPPORT_PHONE = '+919910055355';
const DEFAULT_SUPPORT_WHATSAPP = '+919910055355';

function buildUpiUrl(pa: string, pn: string, amountPaise: number | null, bookingCode: string) {
  const params = new URLSearchParams({ pa, pn, cu: 'INR', tn: bookingCode });
  if (amountPaise != null) params.set('am', (amountPaise / 100).toFixed(2));
  return `upi://pay?${params.toString()}`;
}

function resolveContact(settings?: { contact_phone?: string; whatsapp_number?: string }) {
  const phone = settings?.contact_phone && settings.contact_phone !== 'SETUP_REQUIRED' && settings.contact_phone.trim() !== ''
    ? settings.contact_phone.trim()
    : DEFAULT_SUPPORT_PHONE;
  const whatsapp = settings?.whatsapp_number && settings.whatsapp_number !== 'SETUP_REQUIRED' && settings.whatsapp_number.trim() !== ''
    ? settings.whatsapp_number.trim()
    : DEFAULT_SUPPORT_WHATSAPP;
  const cleanDigits = whatsapp.replace(/\D/g, '');
  return {
    phone,
    whatsapp,
    whatsappUrl: `https://wa.me/${cleanDigits}`,
  };
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

  const { locale, vehicleRegistration, categoryId } = parsed.data;

  // 1. Vehicle Registration Validation & Normalization
  const regResult = validateVehicleRegistration(vehicleRegistration, locale);
  if (!regResult.valid) {
    return errorResponse(
      regResult.error || (locale === 'hi' ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'),
      400,
      'INVALID_VEHICLE_REGISTRATION'
    );
  }

  const db = getDb({ locals } as any);

  // 2. Pre-Write Payment Gate (Zero D1 writes if payment is unavailable)
  const settings = await getBusinessSettings(db);
  const vpaId = settings.vpa_id?.trim();
  const payeeName = settings.vpa_payee_name?.trim();
  const isPaymentConfigured = !!vpaId && vpaId !== 'SETUP_REQUIRED' && !!payeeName && payeeName !== 'SETUP_REQUIRED';

  if (!isPaymentConfigured) {
    const contact = resolveContact(settings);
    const message = locale === 'hi'
      ? 'ऑनलाइन अग्रिम भुगतान वर्तमान में सेटअप किया जा रहा है। कृपया फ़ोन या व्हाट्सएप द्वारा अपॉइंटमेंट बुक करें।'
      : 'Online advance payment is currently being configured. Please book your appointment by phone or WhatsApp.';

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'ONLINE_PAYMENT_UNAVAILABLE',
          message,
        },
        contact,
      }),
      {
        status: 422,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }
    );
  }

  // 3. Server-Side Public Cylinder Limit (Max 6 for source === 'WEB')
  const categoryRow = await querySingle<{ id: number; cylinderCount: number }>(
    db,
    'SELECT id, cylinder_count AS cylinderCount FROM vehicle_categories WHERE id = ? AND is_active = 1',
    [categoryId]
  ).catch(() => null);

  if (!categoryRow) {
    return errorResponse(locale === 'hi' ? 'अमान्य वाहन श्रेणी' : 'Invalid vehicle category', 400, 'INVALID_CATEGORY');
  }

  if (categoryRow.cylinderCount > 6) {
    const contact = resolveContact(settings);
    const message = locale === 'hi'
      ? 'ऑनलाइन बुकिंग अधिकतम 6 सिलेंडरों तक सीमित है। 6 से अधिक सिलेंडरों के लिए कृपया केंद्र से सीधे संपर्क करें।'
      : 'Online self-service booking is limited to a maximum of 6 cylinders. For more than 6 cylinders, please contact our centre directly.';

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PUBLIC_CYLINDER_LIMIT_EXCEEDED',
          message,
        },
        contact,
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }
    );
  }

  // 4. Atomic D1 Hold Creation
  try {
    const result = await createHold(db, {
      ...parsed.data,
      vehicleRegistration: regResult.normalized,
      source: 'WEB',
    });

    let upiUri: string | null = null;
    let upiQrDataUrl: string | null = null;

    if (result.pricing.advancePaise != null) {
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
        : locale === 'en'
          ? 'Website screenshot upload is not configured. Use the full UTR/reference number or WhatsApp fallback.'
          : 'वेबसाइट स्क्रीनशॉट अपलोड कॉन्फ़िगर नहीं है। पूरा UTR/रेफरेंस नंबर या WhatsApp विकल्प उपयोग करें।',
    };

    return jsonResponse(responsePayload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create hold';
    if (message.includes('ONLINE_PAYMENT_UNAVAILABLE')) {
      const contact = resolveContact(settings);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'ONLINE_PAYMENT_UNAVAILABLE', message },
          contact,
        }),
        { status: 422, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
      );
    }
    if (message.includes('PUBLIC_CYLINDER_LIMIT_EXCEEDED')) {
      const contact = resolveContact(settings);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'PUBLIC_CYLINDER_LIMIT_EXCEEDED', message },
          contact,
        }),
        { status: 400, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
      );
    }
    if (message.includes('Invalid vehicle registration')) {
      return errorResponse(message, 400, 'INVALID_VEHICLE_REGISTRATION');
    }
    const status = /capacity_exceeded|no longer has enough capacity|no longer has enough consecutive|not available|closed/i.test(message) ? 409 : 400;
    return errorResponse(message, status, status === 409 ? 'CAPACITY_CONFLICT' : 'HOLD_FAILED');
  }
};
