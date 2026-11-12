import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse, sha256 } from '../../../lib/utils';

export const GET: APIRoute = async ({ params, url, locals }) => {
  const bookingCode = params.bookingCode;
  const token = url.searchParams.get('token');
  if (!bookingCode || !token) return errorResponse('Missing booking reference/token', 400);

  const db = getDb({ locals } as any);
  const row = await db
    .prepare(
      `SELECT
        booking_code AS bookingCode,
        reservation_state AS reservationState,
        payment_state AS paymentState,
        service_date AS serviceDate,
        slot_label_en_snapshot AS slotLabelEn,
        slot_label_hi_snapshot AS slotLabelHi,
        cylinder_count_snapshot AS cylinderCount
      FROM bookings
      WHERE booking_code = ? AND status_token_hash = ?`
    )
    .bind(bookingCode, sha256(token))
    .first<{
      bookingCode: string;
      reservationState: string;
      paymentState: string;
      serviceDate: string;
      slotLabelEn: string;
      slotLabelHi: string;
      cylinderCount: number;
    }>();

  if (!row) return errorResponse('Booking not found', 404, 'NOT_FOUND');

  const locale = url.searchParams.get('locale') === 'hi' ? 'hi' : 'en';
  return jsonResponse({
    bookingCode: row.bookingCode,
    reservationState: row.reservationState,
    paymentState: row.paymentState,
    serviceDate: row.serviceDate,
    slotLabel: locale === 'hi' ? row.slotLabelHi : row.slotLabelEn,
    cylinderCount: row.cylinderCount,
  });
};
