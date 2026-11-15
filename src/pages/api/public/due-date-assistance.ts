import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { validateVehicleRegistration } from '../../../lib/vehicle-registration';

export const POST: APIRoute = async ({ request, locals }) => {
  const originError = validateOrigin(request);
  if (originError) return originError;

  if (!checkRateLimit(limitKey(request, 'due-date-assistance'), 15, 60_000)) {
    return errorResponse('Too many requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const body = (await request.json().catch(() => null)) as {
    vehicleRegistration?: string;
    mobile?: string;
    email?: string;
    cylinderInfo?: string;
    locale?: string;
  } | null;

  if (!body) return errorResponse('Invalid request payload', 400);

  const { vehicleRegistration, mobile, email, cylinderInfo = '', locale = 'en' } = body;
  const hindi = locale === 'hi';

  if (!vehicleRegistration) {
    return errorResponse(
      hindi ? 'वाहन पंजीकरण संख्या आवश्यक है।' : 'Vehicle registration number is required.',
      400,
      'MISSING_REGISTRATION'
    );
  }

  // Validate registration
  const regCheck = validateVehicleRegistration(vehicleRegistration, hindi ? 'hi' : 'en');
  if (!regCheck.valid) {
    return errorResponse(
      regCheck.error || (hindi ? 'अमान्य वाहन रजिस्ट्रेशन संख्या' : 'Invalid vehicle registration number'),
      400,
      'INVALID_REGISTRATION'
    );
  }

  const cleanPhone = mobile ? mobile.replace(/\D/g, '') : null;
  const cleanEmail = email ? email.trim().toLowerCase() : null;

  if (!cleanPhone && !cleanEmail) {
    return errorResponse(
      hindi ? 'कृपया मोबाइल नंबर या ईमेल आईडी दर्ज करें।' : 'Please provide either mobile number or email address.',
      400,
      'MISSING_CONTACT'
    );
  }

  if (cleanPhone && (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone))) {
    return errorResponse(
      hindi ? 'कृपया 10-अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit Indian mobile number.',
      400,
      'INVALID_PHONE'
    );
  }

  const db = getDb({ locals } as any);

  try {
    // Generate a unique 4-character voucher suffix
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const voucherCode = `HSR200-${randomSuffix}`;
    const id = `ast_${crypto.randomUUID()}`;

    // Insert assistance request
    await db.prepare(
      `INSERT INTO due_date_assistance_requests 
        (id, vehicle_registration, display_reg_no, mobile, email, cylinder_info, voucher_code, voucher_discount_paise, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 20000, 'PENDING_ASSISTANCE', ?)`
    ).bind(
      id,
      regCheck.normalized,
      regCheck.normalized,
      cleanPhone,
      cleanEmail,
      cylinderInfo.trim().slice(0, 500),
      voucherCode,
      `Requested assistance finding hydro test date from plate/docs. Locale: ${locale}`
    ).run();

    // If mobile is provided, also register a provisional retest reminder
    if (cleanPhone) {
      try {
        await db.prepare(
          `INSERT INTO retest_reminders 
            (vehicle_registration, mobile, last_test_date, due_date, reminder_channel, status, locale)
           VALUES (?, ?, NULL, date('now', '+30 days'), 'WHATSAPP', 'PENDING', ?)`
        ).bind(
          regCheck.normalized,
          cleanPhone,
          hindi ? 'hi' : 'en'
        ).run();
      } catch {
        // Safe ignore duplicate reminder entry
      }
    }

    return jsonResponse({
      success: true,
      message: hindi
        ? `सहायता अनुरोध प्राप्त हुआ! हमारा तकनीकी स्टाफ आपके वाहन ${regCheck.normalized} के सिलेंडर रिकॉर्ड की जांच करके संपर्क करेगा।`
        : `Assistance request received! Our technical team will verify cylinder records for ${regCheck.normalized} and assist you.`,
      vehicleRegistration: regCheck.normalized,
      voucherCode,
      voucherDiscountPaise: 20000,
      voucherDiscountFormatted: '₹200',
      voucherTerms: hindi
        ? 'एचएसआर रेवाड़ी स्टेशन पर सीएनजी सिलेंडर हाइड्रो टेस्ट पर ₹200 की विशेष छूट।'
        : 'Flat ₹200 discount voucher redeemable on certified CNG cylinder hydro testing at HSR Rewari plant.',
    }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Could not process assistance request', 500);
  }
};
