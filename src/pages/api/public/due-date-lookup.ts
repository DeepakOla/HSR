import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, queryAll, querySingle } from '../../../lib/db';
import { calculateNextRetestDate, calculateRemainingValidity, isValidIsoDate, todayInIndia } from '../../../lib/expiry';
import { checkRateLimit, limitKey } from '../../../lib/rate-limit';
import { validateVehicleRegistration } from '../../../lib/vehicle-registration';
import { errorResponse, jsonResponse, normalizePhoneIndian } from '../../../lib/utils';

const querySchema = z.object({
  locale: z.enum(['en', 'hi']).default('en'),
  regNumber: z.string().optional(),
  mobile: z.string().optional(),
  lastTestDate: z.string().optional(),
});

interface VehicleRegisterRecord {
  registrationDisplay: string;
  registrationNormalized: string;
  actualPeriodicTestDate: string | null;
  nextRetestDueDate: string | null;
  testResult: string | null;
  certificateReference: string | null;
  cylinderSerial: string | null;
  serviceDate?: string | null;
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  if (!checkRateLimit(limitKey(request, 'due-date-lookup'), 30, 60_000)) {
    return errorResponse('Too many lookup requests, try again shortly', 429, 'RATE_LIMITED');
  }

  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? 'en',
    regNumber: url.searchParams.get('regNumber') ?? undefined,
    mobile: url.searchParams.get('mobile') ?? undefined,
    lastTestDate: url.searchParams.get('lastTestDate') ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse('Invalid parameters', 400);
  }

  const { locale, regNumber, mobile, lastTestDate } = parsed.data;
  const db = getDb({ locals } as any);
  const today = todayInIndia();

  // Mode 1: Manual date calculation directly requested
  if (!regNumber && !mobile && lastTestDate) {
    if (!isValidIsoDate(lastTestDate)) {
      return errorResponse(
        locale === 'hi' ? 'अमान्य तारीख प्रारूप (YYYY-MM-DD)' : 'Invalid date format (YYYY-MM-DD)',
        400
      );
    }
    const nextDueDate = calculateNextRetestDate(lastTestDate);
    const validity = calculateRemainingValidity(nextDueDate, today, locale);

    return jsonResponse({
      found: true,
      mode: 'MANUAL_DATE',
      records: [
        {
          registration: 'N/A',
          lastTestDate,
          nextDueDate,
          daysRemaining: validity.daysRemaining,
          timeRemainingFormatted: validity.timeRemainingFormatted,
          status: validity.status,
          statusLabel: validity.statusLabel,
          certificateReference: null,
        },
      ],
    });
  }

  // Mode 2: Vehicle Registration Lookup
  if (regNumber) {
    const regResult = validateVehicleRegistration(regNumber, locale);
    if (!regResult.valid) {
      return errorResponse(
        regResult.error || (locale === 'hi' ? 'अमान्य वाहन पंजीकरण संख्या' : 'Invalid vehicle registration number'),
        400,
        'INVALID_VEHICLE_REGISTRATION'
      );
    }

    const record = await querySingle<VehicleRegisterRecord>(
      db,
      `SELECT
        v.registration_display AS registrationDisplay,
        v.registration_normalized AS registrationNormalized,
        cr.actual_periodic_test_date AS actualPeriodicTestDate,
        cr.next_retest_due_date AS nextRetestDueDate,
        cr.test_result AS testResult,
        cr.certificate_reference AS certificateReference,
        cr.cylinder_serial AS cylinderSerial
      FROM vehicles v
      JOIN cylinder_register cr ON cr.vehicle_id = v.id
      WHERE v.registration_normalized = ?
      ORDER BY cr.created_at DESC
      LIMIT 1`,
      [regResult.normalized]
    ).catch(() => null);

    if (record && record.nextRetestDueDate && isValidIsoDate(record.nextRetestDueDate)) {
      const validity = calculateRemainingValidity(record.nextRetestDueDate, today, locale);
      return jsonResponse({
        found: true,
        mode: 'VEHICLE_LOOKUP',
        records: [
          {
            registration: record.registrationDisplay || record.registrationNormalized,
            lastTestDate: record.actualPeriodicTestDate,
            nextDueDate: record.nextRetestDueDate,
            daysRemaining: validity.daysRemaining,
            timeRemainingFormatted: validity.timeRemainingFormatted,
            status: validity.status,
            statusLabel: validity.statusLabel,
            certificateReference: record.certificateReference,
          },
        ],
      });
    }

    // Check if vehicle has a completed booking without cylinder_register row
    const bookingRecord = await querySingle<{
      registrationDisplay: string;
      serviceDate: string;
    }>(
      db,
      `SELECT
        v.registration_display AS registrationDisplay,
        b.service_date AS serviceDate
      FROM vehicles v
      JOIN bookings b ON b.vehicle_id = v.id
      WHERE v.registration_normalized = ? AND b.reservation_state IN ('COMPLETED', 'CONFIRMED')
      ORDER BY b.service_date DESC
      LIMIT 1`,
      [regResult.normalized]
    ).catch(() => null);

    if (bookingRecord && isValidIsoDate(bookingRecord.serviceDate)) {
      const nextDueDate = calculateNextRetestDate(bookingRecord.serviceDate);
      const validity = calculateRemainingValidity(nextDueDate, today, locale);
      return jsonResponse({
        found: true,
        mode: 'VEHICLE_LOOKUP',
        records: [
          {
            registration: bookingRecord.registrationDisplay,
            lastTestDate: bookingRecord.serviceDate,
            nextDueDate,
            daysRemaining: validity.daysRemaining,
            timeRemainingFormatted: validity.timeRemainingFormatted,
            status: validity.status,
            statusLabel: validity.statusLabel,
            certificateReference: null,
          },
        ],
      });
    }

    // If manual date was also provided with unrecorded registration
    if (lastTestDate && isValidIsoDate(lastTestDate)) {
      const nextDueDate = calculateNextRetestDate(lastTestDate);
      const validity = calculateRemainingValidity(nextDueDate, today, locale);
      return jsonResponse({
        found: true,
        mode: 'MANUAL_DATE',
        unrecordedRegistration: regResult.normalized,
        records: [
          {
            registration: regResult.normalized,
            lastTestDate,
            nextDueDate,
            daysRemaining: validity.daysRemaining,
            timeRemainingFormatted: validity.timeRemainingFormatted,
            status: validity.status,
            statusLabel: validity.statusLabel,
            certificateReference: null,
          },
        ],
      });
    }

    return jsonResponse({
      found: false,
      mode: 'VEHICLE_LOOKUP',
      registration: regResult.normalized,
      message:
        locale === 'hi'
          ? `वाहन ${regResult.normalized} का पिछला टेस्टिंग रिकॉर्ड डेटाबेस में नहीं मिला। कृपया नीचे अंतिम टेस्ट की तारीख दर्ज करें या नया स्लॉट बुक करें।`
          : `No prior testing record found for ${regResult.normalized}. Please enter your cylinder's last test date below or book a new testing bay.`,
    });
  }

  // Mode 3: Mobile Number Lookup (for customers with 1 or multiple vehicles)
  if (mobile) {
    let normalizedPhone = '';
    try {
      normalizedPhone = normalizePhoneIndian(mobile);
    } catch {
      return errorResponse(
        locale === 'hi' ? 'कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.',
        400
      );
    }

    const records = await queryAll<VehicleRegisterRecord>(
      db,
      `SELECT
        v.registration_display AS registrationDisplay,
        v.registration_normalized AS registrationNormalized,
        COALESCE(cr.actual_periodic_test_date, b.service_date) AS actualPeriodicTestDate,
        COALESCE(cr.next_retest_due_date, date(b.service_date, '+3 years')) AS nextRetestDueDate,
        cr.test_result AS testResult,
        cr.certificate_reference AS certificateReference,
        cr.cylinder_serial AS cylinderSerial
      FROM customers c
      JOIN bookings b ON b.customer_id = c.id
      JOIN vehicles v ON v.id = b.vehicle_id
      LEFT JOIN cylinder_register cr ON cr.vehicle_id = v.id
      WHERE c.mobile_e164 = ? AND b.reservation_state != 'CANCELLED'
      GROUP BY v.registration_normalized
      ORDER BY b.created_at DESC
      LIMIT 10`,
      [normalizedPhone]
    ).catch(() => []);

    if (records.length > 0) {
      const formattedRecords = records.map((rec) => {
        const nextDue = rec.nextRetestDueDate && isValidIsoDate(rec.nextRetestDueDate)
          ? rec.nextRetestDueDate
          : (rec.actualPeriodicTestDate ? calculateNextRetestDate(rec.actualPeriodicTestDate) : today);
        const validity = calculateRemainingValidity(nextDue, today, locale);

        // Security / PII: Mask registration partially if multiple
        return {
          registration: rec.registrationDisplay || rec.registrationNormalized,
          lastTestDate: rec.actualPeriodicTestDate,
          nextDueDate: nextDue,
          daysRemaining: validity.daysRemaining,
          timeRemainingFormatted: validity.timeRemainingFormatted,
          status: validity.status,
          statusLabel: validity.statusLabel,
          certificateReference: rec.certificateReference,
        };
      });

      return jsonResponse({
        found: true,
        mode: 'MOBILE_LOOKUP',
        records: formattedRecords,
      });
    }

    return jsonResponse({
      found: false,
      mode: 'MOBILE_LOOKUP',
      message:
        locale === 'hi'
          ? 'इस मोबाइल नंबर से संबद्ध कोई वाहन रिकॉर्ड नहीं मिला। कृपया वाहन नंबर से खोजें या नया स्लॉट बुक करें।'
          : 'No vehicle records found associated with this mobile number. Please search by vehicle registration number or book an appointment.',
    });
  }

  return errorResponse('Provide vehicle registration number or mobile number', 400);
};
