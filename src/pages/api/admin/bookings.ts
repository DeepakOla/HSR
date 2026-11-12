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
  const fromDate = url.searchParams.get('fromDate');
  const db = getDb({ locals } as any);
  const rows = await db
    .prepare(
      `SELECT
        b.booking_code AS bookingCode,
        b.service_date AS serviceDate,
        b.slot_start_snapshot AS slotStart,
        b.slot_end_snapshot AS slotEnd,
        b.reservation_state AS reservationState,
        b.payment_state AS paymentState,
        b.payment_utr_normalized AS utr,
        b.source AS source,
        b.cylinder_count_snapshot AS cylinderCount,
        b.base_price_paise_snapshot AS basePricePaise,
        b.gst_amount_paise_snapshot AS gstAmountPaise,
        b.total_price_paise_snapshot AS totalPricePaise,
        b.amount_paid_paise AS amountPaidPaise,
        b.advance_paise_snapshot AS advancePaise,
        b.balance_paise_snapshot AS balancePaise,
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
        AND (?2 IS NULL OR b.service_date = ?2)
      ORDER BY b.service_date ASC, b.slot_start_snapshot ASC, b.created_at DESC
      LIMIT 200`
    )
    .bind(q ?? null, fromDate ?? null)
    .all();

  return jsonResponse({ rows: rows.results ?? [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = adminBookingStateSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid payload', 400);

  const transitionByAction: Record<string, { reservation: string; payment?: string; from: string }> = {
    VERIFY_PAYMENT: {
      reservation: 'CONFIRMED',
      payment: 'ADVANCE_VERIFIED',
      from: "reservation_state = 'PENDING_VERIFICATION' AND payment_state = 'EVIDENCE_SUBMITTED'",
    },
    MARK_PAID_AT_COUNTER: {
      reservation: 'CONFIRMED',
      payment: 'PAID_AT_COUNTER',
      from: "reservation_state = 'CONFIRMED' AND payment_state IN ('ADVANCE_PENDING','ADVANCE_VERIFIED')",
    },
    REJECT: {
      reservation: 'REJECTED',
      from: "reservation_state = 'PENDING_VERIFICATION' AND payment_state = 'EVIDENCE_SUBMITTED'",
    },
    CANCEL: {
      reservation: 'CANCELLED',
      from: "reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED')",
    },
    CHECK_IN: {
      reservation: 'CHECKED_IN',
      from: "reservation_state = 'CONFIRMED'",
    },
    START: {
      reservation: 'IN_PROGRESS',
      from: "reservation_state = 'CHECKED_IN'",
    },
    COMPLETE: {
      reservation: 'COMPLETED',
      from: "reservation_state = 'IN_PROGRESS'",
    },
  };

  const target = transitionByAction[parsed.data.action];
  if (!target) return errorResponse('Unsupported action', 400);

  const db = getDb({ locals } as any);
  const timestamp = nowIso();
  const paymentAssignment = target.payment ? ", payment_state = ?" : '';
  const updateBindings = target.payment
    ? [target.reservation, target.payment, parsed.data.action, parsed.data.action, timestamp, parsed.data.bookingCode]
    : [target.reservation, parsed.data.action, parsed.data.action, timestamp, parsed.data.bookingCode];

  const results = await db.batch([
    db.prepare(
      `UPDATE bookings
       SET reservation_state = ?${paymentAssignment},
           amount_paid_paise = CASE WHEN ? = 'MARK_PAID_AT_COUNTER' THEN total_price_paise_snapshot WHEN ? = 'VERIFY_PAYMENT' THEN COALESCE(advance_paise_snapshot, 0) ELSE amount_paid_paise END,
           updated_at = ?
       WHERE booking_code = ? AND ${target.from}`
    ).bind(...updateBindings),
    db.prepare(
      `INSERT INTO booking_audit_events(
        booking_id, event_type, actor_type, actor_id, event_payload_json
      )
      SELECT id, ?, 'STAFF', ?, ?
      FROM bookings
      WHERE booking_code = ? AND changes() > 0`
    ).bind(
      `STATE_${parsed.data.action}`,
      auth.staff.email,
      JSON.stringify({ note: parsed.data.note ?? null, role: auth.staff.role }),
      parsed.data.bookingCode
    ),
  ]);

  if ((results[0]?.meta.changes ?? 0) !== 1) {
    return errorResponse('Booking cannot make this status transition. Refresh the booking and check its current status.', 409, 'INVALID_STATE_TRANSITION');
  }

  return jsonResponse({
    bookingCode: parsed.data.bookingCode,
    reservationState: target.reservation,
    paymentState: target.payment ?? null,
  });
};
