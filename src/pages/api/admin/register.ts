import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { calculateNextRetestDate } from '../../../lib/expiry';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

const schema = z.object({
  bookingCode: z.string().min(8),
  vehicleRegistration: z.string().min(4),
  cylinderSerial: z.string().min(2),
  manufacturer: z.string().optional(),
  specification: z.string().optional(),
  actualPeriodicTestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  testPressureBar: z.string().optional(),
  testResult: z.enum(['PASS', 'FAIL', 'REQUIRES_REWORK']),
  certificateReference: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid register payload', 400);

  const db = getDb({ locals } as any);
  const booking = await db
    .prepare('SELECT id, vehicle_id AS vehicleId FROM bookings WHERE booking_code = ?')
    .bind(parsed.data.bookingCode)
    .first<{ id: number; vehicleId: number }>();
  if (!booking) return errorResponse('Booking not found', 404);

  const nextDue = calculateNextRetestDate(parsed.data.actualPeriodicTestDate);
  await db
    .prepare(
      `INSERT INTO cylinder_register(
        booking_id, vehicle_id, cylinder_serial, manufacturer, specification,
        actual_periodic_test_date, test_pressure_bar, test_result, certificate_reference,
        next_retest_due_date
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      booking.id,
      booking.vehicleId,
      parsed.data.cylinderSerial,
      parsed.data.manufacturer ?? null,
      parsed.data.specification ?? null,
      parsed.data.actualPeriodicTestDate,
      parsed.data.testPressureBar ?? null,
      parsed.data.testResult,
      parsed.data.certificateReference ?? null,
      nextDue
    )
    .run();

  return jsonResponse({ nextRetestDueDate: nextDue }, 201);
};
