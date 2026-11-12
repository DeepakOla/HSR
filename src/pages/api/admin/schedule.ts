import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeSchema = z.string().regex(timePattern);
const slotSchema = z.object({
  labelEn: z.string().trim().min(3).max(50),
  labelHi: z.string().trim().min(3).max(50),
  startTime: timeSchema,
  endTime: timeSchema,
  capacity: z.number().int().min(0).max(1000),
});
const saveSchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  openTime: timeSchema,
  closeTime: timeSchema,
  breakStart: timeSchema.nullable(),
  breakEnd: timeSchema.nullable(),
  dailyCapacity: z.number().int().min(1).max(1000),
  slotDurationMinutes: z.number().int().min(30).max(240),
  slots: z.array(slotSchema).min(1).max(24),
}).strict();

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function minutes(value: string) {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const versionRow = await db.prepare('SELECT COALESCE(MAX(config_version), 1) AS version FROM slot_templates').first<{version:number}>();
  const version = versionRow?.version ?? 1;
  const [days, templates] = await Promise.all([
    db.prepare(
      `SELECT weekday, is_open AS isOpen, open_time AS openTime, close_time AS closeTime,
        break_start AS breakStart, break_end AS breakEnd,
        daily_capacity AS dailyCapacity, slot_duration_minutes AS slotDurationMinutes
       FROM weekly_schedule WHERE config_version = ? ORDER BY weekday ASC`
    ).bind(version).all(),
    db.prepare(
      `SELECT slot_label_en AS labelEn, slot_label_hi AS labelHi,
        start_time AS startTime, end_time AS endTime, slot_capacity AS capacity
       FROM slot_templates WHERE config_version = ? ORDER BY sort_order ASC`
    ).bind(version).all(),
  ]);

  const scheduleRows = days.results ?? [];
  const firstOpen = scheduleRows.find((row: any) => row.isOpen === 1) as any;
  return jsonResponse({
    configVersion: version,
    workingDays: scheduleRows.filter((row: any) => row.isOpen === 1).map((row: any) => row.weekday),
    openTime: firstOpen?.openTime ?? '06:00',
    closeTime: firstOpen?.closeTime ?? '14:00',
    breakStart: firstOpen?.breakStart ?? null,
    breakEnd: firstOpen?.breakEnd ?? null,
    dailyCapacity: firstOpen?.dailyCapacity ?? 25,
    slotDurationMinutes: firstOpen?.slotDurationMinutes ?? 120,
    slots: templates.results ?? [],
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid operating schedule', 400);
  const cfg = parsed.data;

  const open = minutes(cfg.openTime);
  const close = minutes(cfg.closeTime);
  if (close <= open) return errorResponse('Closing time must be after opening time', 400);

  const hasBreak = cfg.breakStart !== null || cfg.breakEnd !== null;
  if (hasBreak && (!cfg.breakStart || !cfg.breakEnd)) {
    return errorResponse('Both break start and break end are required', 400);
  }
  if (cfg.breakStart && cfg.breakEnd) {
    const b1 = minutes(cfg.breakStart), b2 = minutes(cfg.breakEnd);
    if (b1 < open || b2 > close || b2 <= b1) return errorResponse('Break must be inside operating hours', 400);
  }

  let previousEnd = open;
  let capacitySum = 0;
  for (const slot of cfg.slots) {
    const start = minutes(slot.startTime), end = minutes(slot.endTime);
    if (start < open || end > close || end <= start || start < previousEnd) {
      return errorResponse('Slots must be ordered, non-overlapping and inside operating hours', 400);
    }
    if (cfg.breakStart && cfg.breakEnd && start < minutes(cfg.breakEnd) && end > minutes(cfg.breakStart)) {
      return errorResponse('A slot cannot overlap the break period', 400);
    }
    if (end - start > cfg.slotDurationMinutes) {
      return errorResponse('A slot cannot exceed the configured slot duration', 400);
    }
    previousEnd = end;
    capacitySum += slot.capacity;
  }
  if (capacitySum !== cfg.dailyCapacity) {
    return errorResponse('The sum of slot capacities must equal the daily cylinder capacity', 400);
  }

  const db = getDb({ locals } as any);
  const today = todayInIndia();
  const tomorrow = addDays(today, 1);
  const lastReserved = await db.prepare(
    `SELECT MAX(service_date) AS lastDate FROM bookings
     WHERE reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')`
  ).first<{lastDate:string | null}>();
  const afterLastBooking = lastReserved?.lastDate ? addDays(lastReserved.lastDate, 1) : tomorrow;
  const effectiveFrom = afterLastBooking > tomorrow ? afterLastBooking : tomorrow;
  const horizonEnd = addDays(effectiveFrom, 44);
  const versionRow = await db.prepare('SELECT COALESCE(MAX(config_version), 1) AS version FROM slot_templates').first<{version:number}>();
  const nextVersion = (versionRow?.version ?? 1) + 1;

  const statements = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const isOpen = cfg.workingDays.includes(weekday) ? 1 : 0;
    statements.push(db.prepare(
      `INSERT INTO weekly_schedule(
        weekday, is_open, open_time, close_time, break_start, break_end,
        daily_capacity, slot_duration_minutes, config_version
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(weekday, isOpen, cfg.openTime, cfg.closeTime, cfg.breakStart, cfg.breakEnd, cfg.dailyCapacity, cfg.slotDurationMinutes, nextVersion));
  }
  cfg.slots.forEach((slot, index) => {
    statements.push(db.prepare(
      `INSERT INTO slot_templates(
        config_version, slot_label_en, slot_label_hi, start_time, end_time, slot_capacity, sort_order
      ) VALUES(?, ?, ?, ?, ?, ?, ?)`
    ).bind(nextVersion, slot.labelEn, slot.labelHi, slot.startTime, slot.endTime, slot.capacity, index + 1));
  });

  statements.push(db.prepare(
    `UPDATE daily_slot_snapshots SET is_closed = 1
     WHERE service_date >= ?`
  ).bind(effectiveFrom));

  statements.push(db.prepare(
    `WITH RECURSIVE days(service_date) AS (
       SELECT date(?)
       UNION ALL
       SELECT date(service_date, '+1 day') FROM days WHERE service_date < date(?)
     )
     INSERT INTO daily_slot_snapshots(
       service_date, weekday, slot_template_id, config_version,
       slot_label_en, slot_label_hi, start_time, end_time,
       slot_capacity, daily_capacity, is_closed
     )
     SELECT days.service_date,
       CAST(strftime('%w', days.service_date) AS INTEGER),
       st.id, st.config_version, st.slot_label_en, st.slot_label_hi,
       st.start_time, st.end_time, st.slot_capacity, ws.daily_capacity,
       COALESCE(ov.is_closed, 0)
     FROM days
     JOIN weekly_schedule ws
       ON ws.weekday = CAST(strftime('%w', days.service_date) AS INTEGER)
      AND ws.config_version = ? AND ws.is_open = 1
     JOIN slot_templates st ON st.config_version = ?
     LEFT JOIN date_overrides ov ON ov.service_date = days.service_date`
  ).bind(effectiveFrom, horizonEnd, nextVersion, nextVersion));

  statements.push(db.prepare(
    `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
     VALUES(NULL, 'SCHEDULE_UPDATED', 'STAFF', ?, ?)`
  ).bind(auth.staff.email, JSON.stringify({ configVersion: nextVersion, effectiveFrom, horizonEnd, dailyCapacity: cfg.dailyCapacity })));

  try {
    await db.batch(statements);
  } catch {
    return errorResponse('Schedule update failed. Existing bookings were preserved; review the slot and capacity settings.', 409, 'SCHEDULE_UPDATE_FAILED');
  }

  return jsonResponse({ saved: true, configVersion: nextVersion, effectiveFrom, horizonEnd });
};
