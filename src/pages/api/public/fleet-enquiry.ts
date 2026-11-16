import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const originError = validateOrigin(request);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'fleet-enquiry'), 10, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = (await request.json().catch(() => null)) as {
    contactName?: string;
    contactPhone?: string;
    fleetDate?: string;
    vehicles?: Array<{ id: string; vehicleType: string; cylinderCount: number; registration: string }>;
    locale?: string;
  } | null;

  if (!body) return errorResponse('Invalid request payload', 400);

  const { contactName, contactPhone, fleetDate, vehicles = [], locale = 'en' } = body;
  const hindi = locale === 'hi';

  const cleanPhone = contactPhone ? contactPhone.replace(/\D/g, '') : '';
  if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return errorResponse(
      hindi ? 'कृपया 10-अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit Indian mobile number.',
      400,
      'INVALID_PHONE'
    );
  }

  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    return errorResponse(
      hindi ? 'कम से कम एक वाहन जोड़ें।' : 'Please add at least one vehicle to the fleet request.',
      400,
      'EMPTY_VEHICLES'
    );
  }

  if (vehicles.length > 6) {
    return errorResponse(
      hindi ? 'ऑनलाइन फ्लीट अनुरोध में अधिकतम 6 वाहन अनुमत हैं।' : 'Maximum 6 vehicles allowed per online fleet request.',
      400,
      'MAX_VEHICLES_EXCEEDED'
    );
  }

  try {
    const enquiryPayload = {
      contactName: (contactName || '').trim(),
      contactPhone: cleanPhone,
      requestedDate: fleetDate || null,
      vehicleCount: vehicles.length,
      vehicles: vehicles.map((v) => ({
        registration: (v.registration || '').trim().toUpperCase(),
        vehicleType: v.vehicleType,
        cylinderCount: v.cylinderCount,
      })),
      source: 'WEB_FLEET_FORM',
      submittedAt: new Date().toISOString(),
    };

    if (env.DB) {
      await env.DB
        .prepare(
          `INSERT INTO booking_audit_events (booking_id, event_type, actor_type, actor_id, event_payload_json)
           VALUES (NULL, 'FLEET_ENQUIRY', 'CUSTOMER', ?, ?)`
        )
        .bind(cleanPhone, JSON.stringify(enquiryPayload))
        .run();
    }

    return jsonResponse({
      message: hindi
        ? `आपके ${vehicles.length} वाहनों के लिए फ्लीट अनुरोध सफलतापूर्वक दर्ज कर लिया गया है।`
        : `Fleet enquiry for ${vehicles.length} vehicle(s) successfully recorded.`,
      vehicleCount: vehicles.length,
      contactPhone: cleanPhone,
    });
  } catch (err: any) {
    return errorResponse(err instanceof Error ? err.message : 'Could not process fleet enquiry', 500);
  }
};
