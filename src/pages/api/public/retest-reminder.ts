import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { validateVehicleRegistration } from '../../../lib/vehicle-registration';

export const POST: APIRoute = async ({ request, locals }) => {
  const originError = validateOrigin(request);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'retest-reminder'), 15, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = (await request.json().catch(() => null)) as {
    vehicleRegistration?: string;
    mobile?: string;
    lastTestDate?: string;
    dueDate?: string;
    reminderChannel?: string;
    locale?: string;
  } | null;

  if (!body) return errorResponse('Invalid request payload', 400);

  const { vehicleRegistration, mobile, lastTestDate, dueDate, reminderChannel = 'WHATSAPP', locale = 'en' } = body;

  if (!vehicleRegistration || !mobile || !dueDate) {
    return errorResponse(
      locale === 'hi' ? 'वाहन रजिस्ट्रेशन, मोबाइल और देय तिथि आवश्यक हैं।' : 'Vehicle registration, mobile number and due date are required.',
      400,
      'MISSING_REQUIRED_FIELDS'
    );
  }

  // Validate Indian vehicle registration
  const regCheck = validateVehicleRegistration(vehicleRegistration, locale as 'en' | 'hi');
  if (!regCheck.valid) {
    return errorResponse(
      regCheck.error || (locale === 'hi' ? 'अमान्य वाहन रजिस्ट्रेशन संख्या' : 'Invalid vehicle registration number'),
      400,
      'INVALID_REGISTRATION'
    );
  }

  // Validate 10-digit Indian mobile number
  const cleanPhone = mobile.replace(/\D/g, '');
  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return errorResponse(
      locale === 'hi' ? 'कृपया 10-अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit Indian mobile number.',
      400,
      'INVALID_PHONE'
    );
  }

  const channel = ['SMS', 'WHATSAPP', 'BOTH'].includes(reminderChannel.toUpperCase())
    ? reminderChannel.toUpperCase()
    : 'WHATSAPP';

  const db = getDb({ locals } as any);

  try {
    // Check if reminder form is enabled in business_settings
    const settings = await db.prepare('SELECT enable_public_reminders FROM business_settings WHERE id = 1').first<{ enable_public_reminders: number }>();
    if (settings && settings.enable_public_reminders === 0) {
      return errorResponse(
        locale === 'hi' ? 'सार्वजनिक रिमाइंडर वर्तमान में बंद है।' : 'Public retest reminders are currently disabled by administration.',
        403,
        'REMINDERS_DISABLED'
      );
    }

    // Insert reminder
    await db.prepare(
      `INSERT INTO retest_reminders (vehicle_registration, mobile, last_test_date, due_date, reminder_channel, status, locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'), datetime('now'))`
    ).bind(
      regCheck.normalized,
      cleanPhone,
      lastTestDate || null,
      dueDate,
      channel,
      locale === 'hi' ? 'hi' : 'en'
    ).run();

    return jsonResponse({
      success: true,
      message: locale === 'hi'
        ? `वाहन ${regCheck.normalized} के लिए रिमाइंडर सफलतापूर्वक दर्ज कर लिया गया है।`
        : `Retest reminder scheduled for vehicle ${regCheck.normalized}.`,
      vehicleRegistration: regCheck.normalized,
      dueDate,
      reminderChannel: channel,
    }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Could not save retest reminder', 500);
  }
};
