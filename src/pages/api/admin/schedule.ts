import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';
import { generateAppointmentSlots } from '../../../lib/appointment-slots';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeSchema = z.string().regex(timePattern);
const saveSchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  openTime: timeSchema,
  closeTime: timeSchema,
  breakStart: timeSchema.nullable(),
  breakEnd: timeSchema.nullable(),
  slotIntervalMinutes: z.union([z.literal(15), z.literal(20)]),
  extendedHoursEnabled: z.boolean(),
  extendedHoursPublic: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.extendedHoursPublic && !value.extendedHoursEnabled) {
    context.addIssue({ code: 'custom', path: ['extendedHoursPublic'], message: 'Extra hours must be enabled before they can be shown online' });
  }
  if (new Set(value.workingDays).size !== value.workingDays.length) {
    context.addIssue({ code: 'custom', path: ['workingDays'], message: 'Working days must be unique' });
  }
});

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}
function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
        slot_interval_minutes AS slotIntervalMinutes,
        extended_hours_enabled AS extendedHoursEnabled,
        extended_hours_public AS extendedHoursPublic
       FROM weekly_schedule WHERE config_version = ? ORDER BY weekday ASC`
    ).bind(version).all(),
    db.prepare(
      `SELECT slot_label_en AS labelEn, slot_label_hi AS labelHi,
        start_time AS startTime, end_time AS endTime,
        interval_minutes AS intervalMinutes, is_extended AS isExtended
       FROM slot_templates WHERE config_version = ? ORDER BY sort_order ASC`
    ).bind(version).all(),
  ]);

  const rows = days.results ?? [];
  const firstOpen = rows.find((row: any) => row.isOpen === 1) as any;
  return jsonResponse({
    configVersion: version,
    workingDays: rows.filter((row: any) => row.isOpen === 1).map((row: any) => row.weekday),
    openTime: firstOpen?.openTime ?? '06:00',
    closeTime: firstOpen?.closeTime ?? '14:00',
    breakStart: firstOpen?.breakStart ?? null,
    breakEnd: firstOpen?.breakEnd ?? null,
    slotIntervalMinutes: firstOpen?.slotIntervalMinutes ?? 20,
    extendedHoursEnabled: firstOpen?.extendedHoursEnabled === 1,
    extendedHoursPublic: firstOpen?.extendedHoursPublic === 1,
    extendedMinutes: 60,
    slots: templates.results ?? [],
    standardSlotCount: (templates.results ?? []).filter((slot: any) => slot.isExtended === 0).length,
    extendedSlotCount: (templates.results ?? []).filter((slot: any) => slot.isExtended === 1).length,
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

  const templates = generateAppointmentSlots({
    openTime: cfg.openTime,
    closeTime: cfg.closeTime,
    intervalMinutes: cfg.slotIntervalMinutes,
    breakStart: cfg.breakStart,
    breakEnd: cfg.breakEnd,
    extendedHoursEnabled: cfg.extendedHoursEnabled,
    extendedHoursPublic: cfg.extendedHoursPublic,
    extendedMinutes: 60,
  });

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

  const standardCount = templates.filter((slot) => !slot.isExtended).length;
  const extendedCount = templates.filter((slot) => slot.isExtended).length;
  const statements = [];

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const isOpen = cfg.workingDays.includes(weekday) ? 1 : 0;
    statements.push(db.prepare(
      `INSERT INTO weekly_schedule(
        weekday, is_open, open_time, close_time, break_start, break_end,
        daily_capacity, slot_interval_minutes, extended_hours_enabled,
        extended_hours_public, config_version
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      weekday, isOpen, cfg.openTime, cfg.closeTime, cfg.breakStart, cfg.breakEnd,
      isOpen ? templates.length : 0, cfg.slotIntervalMinutes,
      cfg.extendedHoursEnabled ? 1 : 0, cfg.extendedHoursPublic ? 1 : 0, nextVersion
    ));
  }

  for (const slot of templates) {
    statements.push(db.prepare(
      `INSERT INTO slot_templates(
        config_version, slot_label_en, slot_label_hi, start_time, end_time,
        slot_capacity, sort_order, interval_minutes, is_extended
      ) VALUES(?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      nextVersion, slot.labelEn, slot.labelHi, slot.startTime, slot.endTime,
      slot.sortOrder, slot.intervalMinutes, slot.isExtended ? 1 : 0
    ));
  }

  statements.push(db.prepare(
    'UPDATE daily_slot_snapshots SET is_closed = 1 WHERE service_date >= ?'
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
       slot_capacity, daily_capacity, is_closed, interval_minutes, is_public
     )
     SELECT days.service_date,
       CAST(strftime('%w', days.service_date) AS INTEGER),
       st.id, st.config_version, st.slot_label_en, st.slot_label_hi,
       st.start_time, st.end_time, st.slot_capacity,
       (SELECT COUNT(*) FROM slot_templates allSlots
         WHERE allSlots.config_version = ws.config_version
           AND (allSlots.is_extended = 0 OR ws.extended_hours_enabled = 1)),
       COALESCE(ov.is_closed, 0), st.interval_minutes,
       CASE WHEN st.is_extended = 1 AND ws.extended_hours_public = 0 THEN 0 ELSE 1 END
     FROM days
     JOIN weekly_schedule ws
       ON ws.weekday = CAST(strftime('%w', days.service_date) AS INTEGER)
      AND ws.config_version = ? AND ws.is_open = 1
     JOIN slot_templates st ON st.config_version = ws.config_version
      AND (st.is_extended = 0 OR ws.extended_hours_enabled = 1)
     LEFT JOIN date_overrides ov ON ov.service_date = days.service_date`
  ).bind(effectiveFrom, horizonEnd, nextVersion));

  statements.push(db.prepare(
    `INSERT INTO schedule_versions(config_version, effective_from) VALUES(?, ?)`
  ).bind(nextVersion, effectiveFrom));

  statements.push(db.prepare(
    `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
     VALUES(NULL, 'SCHEDULE_UPDATED', 'STAFF', ?, ?)`
  ).bind(auth.staff.email, JSON.stringify({
    configVersion: nextVersion, effectiveFrom, horizonEnd,
    slotIntervalMinutes: cfg.slotIntervalMinutes, standardSlots: standardCount,
    extendedSlots: cfg.extendedHoursEnabled ? extendedCount : 0,
    extendedHoursPublic: cfg.extendedHoursPublic,
  })));

  try {
    await db.batch(statements);
  } catch {
    return errorResponse('Schedule update failed. Existing bookings were preserved; review the operating hours and interval settings.', 409, 'SCHEDULE_UPDATE_FAILED');
  }

  return jsonResponse({
    saved: true, configVersion: nextVersion, effectiveFrom, horizonEnd,
    standardSlots: standardCount, extendedSlots: cfg.extendedHoursEnabled ? extendedCount : 0,
    totalDailyUnits: cfg.extendedHoursEnabled ? templates.length : standardCount,
  });
};
