import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { adminBookingStateSchema } from '../../../lib/schemas';
import { errorResponse, jsonResponse, nowIso } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const q = url.searchParams.get('q')?.trim();
  const db = getDb({ locals } as any);
  const rows = await db
    .prepare(
      `SELECT
        b.booking_code AS bookingCode,
        b.service_date AS serviceDate,
        b.reservation_state AS reservationState,
        b.payment_state AS paymentState,
        b.cylinder_count_snapshot AS cylinderCount,
        b.total_price_paise_snapshot AS totalPricePaise,
        c.name AS customerName,
        c.mobile_e164 AS mobile,
        v.registration_display AS vehicleRegistration
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      JOIN vehicles v ON v.id = b.vehicle_id
      WHERE (?1 IS NULL
             OR b.booking_code LIKE '%' || ?1 || '%'
             OR c.mobile_e164 LIKE '%' || ?1 || '%'
             OR v.registration_normalized LIKE '%' || upper(replace(?1, ' ', '')) || '%')
      ORDER BY b.created_at DESC
      LIMIT 200`
    )
    .bind(q ?? null)
    .all();

  return jsonResponse({ rows: rows.results ?? [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = adminBookingStateSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid payload', 400);

  const stateByAction: Record<string, { reservation: string; payment?: string }> = {
    VERIFY_PAYMENT: { reservation: 'CONFIRMED', payment: 'ADVANCE_VERIFIED' },
    REJECT: { reservation: 'REJECTED', payment: 'ADVANCE_PENDING' },
    CANCEL: { reservation: 'CANCELLED', payment: 'ADVANCE_PENDING' },
    CHECK_IN: { reservation: 'CHECKED_IN' },
    START: { reservation: 'IN_PROGRESS' },
    COMPLETE: { reservation: 'COMPLETED' },
  };

  const target = stateByAction[parsed.data.action];
  if (!target) return errorResponse('Unsupported action', 400);

  const db = getDb({ locals } as any);
  const update = await db
    .prepare(
      `UPDATE bookings
       SET reservation_state = ?,
           payment_state = COALESCE(?, payment_state),
           updated_at = ?
       WHERE booking_code = ?`
    )
    .bind(target.reservation, target.payment ?? null, nowIso(), parsed.data.bookingCode)
    .run();

  if ((update.meta.changes ?? 0) < 1) return errorResponse('Booking not found', 404);

  const booking = await db.prepare('SELECT id FROM bookings WHERE booking_code = ?').bind(parsed.data.bookingCode).first<{ id: number }>();
  if (booking) {
    await db
      .prepare('INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json) VALUES(?, ?, ?, ?, ?)')
      .bind(booking.id, `STATE_${parsed.data.action}`, 'STAFF', auth.staff.email, JSON.stringify({ note: parsed.data.note ?? null, role: auth.staff.role }))
      .run();
  }

  return jsonResponse({ bookingCode: parsed.data.bookingCode, reservationState: target.reservation, paymentState: target.payment ?? null });
};
