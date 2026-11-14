import type { APIRoute } from 'astro';
import { getStaffContext } from '../../../../lib/auth';
import { jsonResponse, errorResponse } from '../../../../lib/utils';
import { getRuntimeEnv } from '../../../../lib/runtime-env';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  if (!env?.DB) return errorResponse('DB unavailable', 500, 'DB_UNAVAILABLE');

  const staff = await getStaffContext(request, env);
  if (!staff) return errorResponse('Staff authentication required', 401, 'UNAUTHORIZED');

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const bookingId = (body.bookingId || '').trim();
    const pesoCertNo = (body.pesoCertificateNumber || '').trim() || `PESO-HR-${Date.now().toString().slice(-6)}`;
    const fileName = body.fileName || `PESO_Certificate_${pesoCertNo}.pdf`;

    if (!bookingId) return errorResponse('Booking ID is required', 400, 'MISSING_BOOKING_ID');

    // Attach document record
    const docId = `doc_${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO documents (
        id, booking_id, doc_type, r2_object_key, file_name, mime_type, uploaded_by_staff_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        docId,
        bookingId,
        'PESO_CERTIFICATE_PDF',
        `certificates/${new Date().getFullYear()}/${bookingId}_${pesoCertNo}.pdf`,
        fileName,
        'application/pdf',
        staff.email
      )
      .run();

    // Update cylinder test records certificate number
    await env.DB.prepare(
      'UPDATE cylinder_test_records SET peso_certificate_number = ?, updated_at = strftime("%Y-%m-%dT%H:%M:%SZ", "now") WHERE booking_id = ?'
    )
      .bind(pesoCertNo, bookingId)
      .run();

    // Update booking status to CERTIFIED_READY and COMPLETED / RELEASED
    await env.DB.prepare(
      `UPDATE bookings 
       SET testing_status = 'RELEASED', booking_status = 'COMPLETED', released_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`
    )
      .bind(bookingId)
      .run();

    // Free the station bay
    await env.DB.prepare(
      `UPDATE station_resources 
       SET status = 'ONLINE', current_booking_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE current_booking_id = ?`
    )
      .bind(bookingId)
      .run();

    // Schedule 3-year reminder
    const bookingRow = await env.DB.prepare(
      'SELECT vehicle_id, rc_owner_party_id FROM bookings WHERE id = ?'
    )
      .bind(bookingId)
      .first<{ vehicle_id: string; rc_owner_party_id: string }>();

    if (bookingRow?.vehicle_id && bookingRow?.rc_owner_party_id) {
      const retestDate = new Date();
      retestDate.setFullYear(retestDate.getFullYear() + 3);

      await env.DB.prepare(
        'UPDATE vehicles SET last_test_date = date("now"), next_test_due_date = ?, updated_at = strftime("%Y-%m-%dT%H:%M:%SZ", "now") WHERE id = ?'
      )
        .bind(retestDate.toISOString().slice(0, 10), bookingRow.vehicle_id)
        .run();
    }

    return jsonResponse(
      {
        success: true,
        documentId: docId,
        pesoCertificateNumber: pesoCertNo,
        bookingStatus: 'COMPLETED',
        testingStatus: 'RELEASED',
      },
      200
    );
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to upload certificate', 500, 'SERVER_ERROR');
  }
};
