import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
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
        dss.interval_minutes AS intervalMinutes,
        dss.is_public AS isPublic,
        dss.is_closed AS isClosed,
        CASE WHEN EXISTS (
          SELECT 1 FROM booking_slot_allocations allocation
          WHERE allocation.slot_snapshot_id = dss.id
        ) THEN 1 ELSE 0 END AS reserved
      FROM daily_slot_snapshots dss
      WHERE dss.service_date = ? AND dss.is_closed = 0
      ORDER BY dss.start_time ASC`
    ).bind(date).all(),
    db.prepare(
      `SELECT
        COUNT(*) AS dailyCapacity,
        (SELECT COUNT(*)
         FROM booking_slot_allocations allocation
         JOIN daily_slot_snapshots ds ON ds.id = allocation.slot_snapshot_id
         WHERE ds.service_date = ? AND ds.is_closed = 0) AS reserved
       FROM daily_slot_snapshots
       WHERE service_date = ? AND is_closed = 0`
    ).bind(date, date).first<{ dailyCapacity: number; reserved: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS count FROM bookings
       WHERE service_date = ? AND reservation_state = 'PENDING_VERIFICATION'`
    ).bind(date).first<{ count: number }>(),
  ]);

  const slots = (slotResult.results ?? []).map((row: any) => ({
    slotSnapshotId: row.slotSnapshotId,
    labelEn: row.labelEn,
    labelHi: row.labelHi,
    startTime: row.startTime,
    endTime: row.endTime,
    intervalMinutes: row.intervalMinutes,
    capacity: 1,
    reserved: row.reserved,
    remaining: row.reserved ? 0 : 1,
    isPublic: row.isPublic === 1,
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
