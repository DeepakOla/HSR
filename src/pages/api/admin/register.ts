import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { calculateNextRetestDate, isValidIsoDate, todayInIndia } from '../../../lib/expiry';
import { errorResponse, jsonResponse, normalizeVehicleRegistration } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';

const schema = z.object({
  bookingCode: z.string().trim().min(8).max(40),
  vehicleRegistration: z.string().trim().min(4).max(20),
  cylinderSerial: z.string().trim().min(2).max(120),
  manufacturer: z.string().trim().max(120).optional(),
  specification: z.string().trim().max(120).optional(),
  actualPeriodicTestDate: z.string().refine(isValidIsoDate, 'Enter a real calendar date'),
  testPressureBar: z.string().trim().max(20).optional().refine(
    (value) => !value || (Number.isFinite(Number(value)) && Number(value) > 0),
    'Test pressure must be a positive number'
  ),
  testResult: z.enum(['PASS', 'FAIL', 'REQUIRES_REWORK']),
  certificateReference: z.string().trim().max(120).optional(),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid cylinder register details', 400);

  if (parsed.data.actualPeriodicTestDate > todayInIndia()) {
    return errorResponse('The actual periodic test date cannot be in the future', 400);
  }

  const db = getDb({ locals } as any);
  const booking = await db.prepare(
    `SELECT b.id, b.vehicle_id AS vehicleId, v.registration_normalized AS registration
     FROM bookings b
     JOIN vehicles v ON v.id = b.vehicle_id
     WHERE b.booking_code = ? AND b.reservation_state = 'COMPLETED'`
  ).bind(parsed.data.bookingCode).first<{
    id: number;
    vehicleId: number;
    registration: string;
  }>();

  if (!booking) {
    return errorResponse('A register entry can only be created against a completed booking', 409, 'BOOKING_NOT_COMPLETED');
  }

  const normalizedRegistration = normalizeVehicleRegistration(parsed.data.vehicleRegistration);
  if (normalizedRegistration !== booking.registration) {
    return errorResponse('Vehicle registration does not match the selected booking', 409, 'VEHICLE_MISMATCH');
  }

  const staff = await db.prepare(
    'SELECT id FROM staff_users WHERE lower(email) = ? AND is_active = 1'
  ).bind(auth.staff.email).first<{ id: number }>();
  if (!staff) return errorResponse('Active staff record not found', 403, 'STAFF_NOT_REGISTERED');

  const nextDue = parsed.data.testResult === 'PASS'
    ? calculateNextRetestDate(parsed.data.actualPeriodicTestDate)
    : null;
  const payload = {
    cylinderSerial: parsed.data.cylinderSerial,
    testResult: parsed.data.testResult,
    nextRetestDueDate: nextDue,
  };

  await db.batch([
    db.prepare(
      `INSERT INTO cylinder_register(
        booking_id, vehicle_id, cylinder_serial, manufacturer, specification,
        actual_periodic_test_date, test_pressure_bar, test_result, certificate_reference,
        next_retest_due_date, created_by_staff_id
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      booking.id,
      booking.vehicleId,
      parsed.data.cylinderSerial,
      parsed.data.manufacturer || null,
      parsed.data.specification || null,
      parsed.data.actualPeriodicTestDate,
      parsed.data.testPressureBar || null,
      parsed.data.testResult,
      parsed.data.certificateReference || null,
      nextDue,
      staff.id
    ),
    db.prepare(
      `INSERT INTO booking_audit_events(
        booking_id, event_type, actor_type, actor_id, event_payload_json
      ) VALUES(?, 'CYLINDER_REGISTERED', 'STAFF', ?, ?)`
    ).bind(booking.id, auth.staff.email, JSON.stringify(payload)),
  ]);

  return jsonResponse({ saved: true, nextRetestDueDate: nextDue }, 201);
};
