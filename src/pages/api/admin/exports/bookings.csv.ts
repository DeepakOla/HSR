import type { APIRoute } from 'astro';
import { requireRole } from '../../../../lib/auth';
import { getDb } from '../../../../lib/db';
import { getRuntimeEnv } from '../../../../lib/runtime-env';

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const rows = await db
    .prepare(
      `SELECT
        b.booking_code AS booking_code,
        b.source,
        b.service_date,
        b.slot_label_en_snapshot AS slot_label,
        b.cylinder_count_snapshot AS cylinders,
        b.base_price_paise_snapshot AS base_price_paise,
        b.gst_rate_bps_snapshot AS gst_rate_bps,
        b.gst_amount_paise_snapshot AS gst_amount_paise,
        b.total_price_paise_snapshot AS total_price_paise,
        b.amount_paid_paise AS amount_paid_paise,
        b.advance_paise_snapshot AS advance_paise,
        MAX(b.total_price_paise_snapshot - b.amount_paid_paise, 0) AS balance_paise,
        b.reservation_state,
        b.payment_state,
        c.name AS customer_name,
        c.mobile_e164 AS customer_mobile,
        v.registration_display AS vehicle_registration
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      JOIN vehicles v ON v.id = b.vehicle_id
      ORDER BY b.created_at DESC`
    )
    .all();

  const header = [
    'booking_code','source','service_date','slot_label','cylinders','base_price_paise','gst_rate_bps','gst_amount_paise','total_price_paise','amount_paid_paise','advance_paise','balance_paise','reservation_state','payment_state','customer_name','customer_mobile','vehicle_registration'
  ];

  const lines = [header.join(',')];
  for (const row of rows.results ?? []) {
    lines.push(
      header
        .map((key) => {
          const value = (row as Record<string, unknown>)[key] ?? '';
          const escaped = String(value).replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(',')
    );
  }

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="bookings.csv"',
      'cache-control': 'private, no-store',
    },
  });
};
