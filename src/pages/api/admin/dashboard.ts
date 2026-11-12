import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

const ACTIVE_STATES = "('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')";

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const date = url.searchParams.get('date') ?? todayInIndia();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResponse('Invalid date', 400);

  const db = getDb({ locals } as any);
  const [slotResult, dayResult, pendingResult] = await Promise.all([
    db.prepare(
      `SELECT
        dss.id AS slotSnapshotId,
        dss.slot_label_en AS labelEn,
        dss.slot_label_hi AS labelHi,
        dss.start_time AS startTime,
        dss.end_time AS endTime,
        dss.slot_capacity AS capacity,
        dss.daily_capacity AS dailyCapacity,
        dss.is_closed AS isClosed,
        COALESCE(SUM(b.cylinder_count_snapshot), 0) AS reserved
      FROM daily_slot_snapshots dss
      LEFT JOIN bookings b
        ON b.slot_snapshot_id = dss.id
       AND b.reservation_state IN ${ACTIVE_STATES}
      WHERE dss.service_date = ?
      GROUP BY dss.id
      ORDER BY dss.start_time ASC`
    ).bind(date).all(),
    db.prepare(
      `SELECT
        COALESCE(MAX(daily_capacity), 0) AS dailyCapacity,
        COALESCE((SELECT SUM(cylinder_count_snapshot) FROM bookings WHERE service_date = ? AND reservation_state IN ${ACTIVE_STATES}), 0) AS reserved
      FROM daily_slot_snapshots
      WHERE service_date = ?`
    ).bind(date, date).first<{dailyCapacity:number;reserved:number}>(),
    db.prepare(
      `SELECT COUNT(*) AS count FROM bookings
       WHERE service_date = ? AND reservation_state = 'PENDING_VERIFICATION'`
    ).bind(date).first<{count:number}>(),
  ]);

  const slots = (slotResult.results ?? []).map((row: any) => ({
    slotSnapshotId: row.slotSnapshotId,
    label: row.labelEn,
    labelEn: row.labelEn,
    labelHi: row.labelHi,
    startTime: row.startTime,
    endTime: row.endTime,
    capacity: row.capacity,
    reserved: row.reserved,
    remaining: Math.max(0, row.capacity - row.reserved),
    isClosed: row.isClosed === 1,
  }));

  const dailyCapacity = dayResult?.dailyCapacity ?? 0;
  const dailyReserved = dayResult?.reserved ?? 0;
  return jsonResponse({
    date,
    dailyCapacity,
    dailyReserved,
    dailyRemaining: Math.max(0, dailyCapacity - dailyReserved),
    pendingVerificationCount: pendingResult?.count ?? 0,
    slots,
  });
};
