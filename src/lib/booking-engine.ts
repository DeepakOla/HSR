import type { Locale } from './constants';
import { buildSnapshotScheduleRanges, type SnapshotScheduleVersion } from './schedule-ranges';
import { getBusinessSettings, queryAll, querySingle } from './db';
import { addMinutes, generateBookingCode, generateOpaqueToken, normalizePhoneIndian, normalizeUtr, normalizeVehicleRegistration, nowIso, sha256 } from './utils';
import type { SlotAvailability, VehicleCategory } from './types';

const ACTIVE_STATES_SQL = "('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')";

export async function fetchAvailability(db: D1Database, locale: Locale, fromDate: string, days = 14): Promise<SlotAvailability[]> {
  const endDate = new Date(`${fromDate}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + days);
  const end = endDate.toISOString().slice(0, 10);

  const rows = await queryAll<{
    slotSnapshotId: number;
    serviceDate: string;
    slotLabelEn: string;
    slotLabelHi: string;
    startTime: string;
    endTime: string;
    slotCapacity: number;
    dayCapacity: number;
    isClosed: number;
    slotReserved: number;
    dayReserved: number;
  }>(
    db,
    `SELECT
      dss.id AS slotSnapshotId,
      dss.service_date AS serviceDate,
      dss.slot_label_en AS slotLabelEn,
      dss.slot_label_hi AS slotLabelHi,
      dss.start_time AS startTime,
      dss.end_time AS endTime,
      dss.slot_capacity AS slotCapacity,
      dss.daily_capacity AS dayCapacity,
      dss.is_closed AS isClosed,
      COALESCE((
        SELECT SUM(b.cylinder_count_snapshot)
        FROM bookings b
        WHERE b.slot_snapshot_id = dss.id
          AND b.reservation_state IN ${ACTIVE_STATES_SQL}
      ), 0) AS slotReserved,
      COALESCE((
        SELECT SUM(b2.cylinder_count_snapshot)
        FROM bookings b2
        WHERE b2.service_date = dss.service_date
          AND b2.reservation_state IN ${ACTIVE_STATES_SQL}
      ), 0) AS dayReserved
    FROM daily_slot_snapshots dss
    WHERE dss.service_date >= ?
      AND dss.service_date <= ?
      AND dss.is_closed = 0
    ORDER BY dss.service_date ASC, dss.start_time ASC`,
    [fromDate, end]
  );

  const clock = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const clockParts = Object.fromEntries(clock.map((part) => [part.type, part.value]));
  const todayInIndia = `${clockParts.year}-${clockParts.month}-${clockParts.day}`;
  const currentTimeInIndia = `${clockParts.hour}:${clockParts.minute}`;

  return rows.filter((row) => row.serviceDate > todayInIndia || (row.serviceDate === todayInIndia && row.startTime > currentTimeInIndia)).map((row) => {
    const dayRemaining = Math.max(row.dayCapacity - row.dayReserved, 0);
    const slotRemaining = Math.max(Math.min(row.slotCapacity - row.slotReserved, dayRemaining), 0);
    return {
      slotSnapshotId: row.slotSnapshotId,
      serviceDate: row.serviceDate,
      slotLabel: locale === 'hi' ? row.slotLabelHi : row.slotLabelEn,
      startTime: row.startTime,
      endTime: row.endTime,
      slotCapacity: row.slotCapacity,
      slotReserved: row.slotReserved,
      slotRemaining,
      dayCapacity: row.dayCapacity,
      dayReserved: row.dayReserved,
      dayRemaining,
      isClosed: row.isClosed === 1,
    };
  });
}

export async function fetchVehicleCategories(db: D1Database, locale: Locale): Promise<VehicleCategory[]> {
  const rows = await queryAll<{
    id: number;
    code: string;
    nameEn: string;
    nameHi: string;
    cylinderCount: number;
    basePricePaise: number;
    gstRateBps: number;
    advancePaise: number | null;
  }>(
    db,
    `SELECT
      id,
      code,
      name_en AS nameEn,
      name_hi AS nameHi,
      cylinder_count AS cylinderCount,
      base_price_paise AS basePricePaise,
      gst_rate_bps AS gstRateBps,
      advance_paise AS advancePaise
    FROM vehicle_categories
    WHERE is_active = 1
    ORDER BY sort_order ASC`
  );

  return rows.map((row) => {
    const gstPaise = Math.round((row.basePricePaise * row.gstRateBps) / 10_000);
    return {
      id: row.id,
      code: row.code,
      name: locale === 'hi' ? row.nameHi : row.nameEn,
      cylinderCount: row.cylinderCount,
      basePricePaise: row.basePricePaise,
      gstRateBps: row.gstRateBps,
      gstPaise,
      totalPaise: row.basePricePaise + gstPaise,
      advancePaise: row.advancePaise,
    };
  });
}

interface CreateHoldInput {
  locale: Locale;
  slotSnapshotId: number;
  categoryId: number;
  customerName: string;
  mobile: string;
  vehicleRegistration: string;
  source: 'WEB' | 'PHONE' | 'WHATSAPP' | 'WALKIN';
  idempotencyKey: string;
  reservationState?: 'HELD' | 'CONFIRMED';
  paymentState?: 'ADVANCE_PENDING' | 'PAID_AT_COUNTER';
  paymentCollected?: boolean;
}

type StoredHoldResult = {
  bookingCode: string;
  statusToken: string;
  holdExpiresAt: string;
  reservationState: 'HELD' | 'CONFIRMED';
  paymentState: 'ADVANCE_PENDING' | 'PAID_AT_COUNTER';
  category: {
    id: number;
    code: string;
    name: string;
    cylinderCount: number;
    basePricePaise: number;
    gstRateBps: number;
    gstPaise: number;
    totalPaise: number;
    advancePaise: number | null;
  };
  slot: {
    id: number;
    serviceDate: string;
    slotLabelEn: string;
    slotLabelHi: string;
    startTime: string;
    endTime: string;
    slotCapacity: number;
    dayCapacity: number;
    configVersion: number;
  };
  pricing: {
    basePricePaise: number;
    gstRateBps: number;
    gstAmountPaise: number;
    totalPricePaise: number;
    advancePaise: number | null;
    amountPaidPaise: number;
    balancePaise: number | null;
  };
  paymentConfig: {
    vpaId: string;
    payeeName: string;
    r2Enabled: boolean;
    whatsappNumber: string;
  };
};

export async function createHold(db: D1Database, input: CreateHoldInput) {
  const readIdempotentResult = async () => {
    const existing = await db.prepare(
      "SELECT response_json AS responseJson FROM idempotency_keys WHERE idempotency_key = ? AND endpoint = 'create-hold'"
    ).bind(input.idempotencyKey).first<{ responseJson: string }>();
    if (!existing) return null;

    const payload = JSON.parse(existing.responseJson) as StoredHoldResult;
    const booking = await db.prepare(
      'SELECT id FROM bookings WHERE booking_code = ?'
    ).bind(payload.bookingCode).first<{ id: number }>();
    if (!booking) throw new Error('Existing idempotency record has no matching booking');
    return { ...payload, bookingId: booking.id };
  };

  const prior = await readIdempotentResult();
  if (prior) return prior;

  const settings = await getBusinessSettings(db);
  const normalizedPhone = normalizePhoneIndian(input.mobile);
  const normalizedReg = normalizeVehicleRegistration(input.vehicleRegistration);

  const slot = await querySingle<{
    id: number;
    serviceDate: string;
    slotLabelEn: string;
    slotLabelHi: string;
    startTime: string;
    endTime: string;
    slotCapacity: number;
    dayCapacity: number;
    configVersion: number;
    isClosed: number;
  }>(
    db,
    `SELECT
      id,
      service_date AS serviceDate,
      slot_label_en AS slotLabelEn,
      slot_label_hi AS slotLabelHi,
      start_time AS startTime,
      end_time AS endTime,
      slot_capacity AS slotCapacity,
      daily_capacity AS dayCapacity,
      config_version AS configVersion,
      is_closed AS isClosed
    FROM daily_slot_snapshots
    WHERE id = ?`,
    [input.slotSnapshotId]
  );

  if (slot.isClosed === 1) throw new Error('This slot is closed');

  const localParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const local = Object.fromEntries(localParts.map((part) => [part.type, part.value]));
  const localDate = `${local.year}-${local.month}-${local.day}`;
  const localTime = `${local.hour}:${local.minute}`;
  if (slot.serviceDate < localDate || (slot.serviceDate === localDate && slot.startTime <= localTime)) {
    throw new Error('Selected appointment date or time has already passed');
  }

  const categoryRow = await querySingle<{
    id: number;
    code: string;
    nameEn: string;
    nameHi: string;
    cylinderCount: number;
    basePricePaise: number;
    gstRateBps: number;
    advancePaise: number | null;
  }>(
    db,
    `SELECT
      id,
      code,
      name_en AS nameEn,
      name_hi AS nameHi,
      cylinder_count AS cylinderCount,
      base_price_paise AS basePricePaise,
      gst_rate_bps AS gstRateBps,
      advance_paise AS advancePaise
    FROM vehicle_categories
    WHERE id = ? AND is_active = 1`,
    [input.categoryId]
  );

  const gstAmountPaise = Math.round((categoryRow.basePricePaise * categoryRow.gstRateBps) / 10_000);
  const totalPricePaise = categoryRow.basePricePaise + gstAmountPaise;
  const advancePaise = categoryRow.advancePaise;
  const amountPaidPaise = input.paymentCollected ? totalPricePaise : 0;
  const balancePaise = input.reservationState === 'CONFIRMED'
    ? input.paymentCollected ? 0 : totalPricePaise
    : advancePaise == null ? null : totalPricePaise - advancePaise;

  const bookingCode = generateBookingCode();
  const statusToken = generateOpaqueToken(24);
  const statusTokenHash = sha256(statusToken);
  const now = nowIso();
  const expiresAt = addMinutes(new Date(), settings.hold_minutes).toISOString();
  const reservationState = input.reservationState ?? 'HELD';
  const paymentState = input.paymentState ?? 'ADVANCE_PENDING';

  const category = {
    id: categoryRow.id,
    code: categoryRow.code,
    name: input.locale === 'hi' ? categoryRow.nameHi : categoryRow.nameEn,
    cylinderCount: categoryRow.cylinderCount,
    basePricePaise: categoryRow.basePricePaise,
    gstRateBps: categoryRow.gstRateBps,
    gstPaise: gstAmountPaise,
    totalPaise: totalPricePaise,
    advancePaise,
  };

  const responseSnapshot: StoredHoldResult = {
    bookingCode,
    statusToken,
    holdExpiresAt: expiresAt,
    reservationState,
    paymentState,
    category,
    slot: {
      id: slot.id,
      serviceDate: slot.serviceDate,
      slotLabelEn: slot.slotLabelEn,
      slotLabelHi: slot.slotLabelHi,
      startTime: slot.startTime,
      endTime: slot.endTime,
      slotCapacity: slot.slotCapacity,
      dayCapacity: slot.dayCapacity,
      configVersion: slot.configVersion,
    },
    pricing: {
      basePricePaise: categoryRow.basePricePaise,
      gstRateBps: categoryRow.gstRateBps,
      gstAmountPaise,
      totalPricePaise,
      advancePaise,
      amountPaidPaise,
      balancePaise,
    },
    paymentConfig: {
      vpaId: settings.vpa_id,
      payeeName: settings.vpa_payee_name,
      r2Enabled: settings.r2_enabled === 1,
      whatsappNumber: settings.whatsapp_number,
    },
  };

  try {
    await db.batch([
      db.prepare(
        'INSERT INTO customers(name, mobile_e164) VALUES(?, ?) ON CONFLICT(mobile_e164) DO UPDATE SET name = excluded.name'
      ).bind(input.customerName.trim(), normalizedPhone),
      db.prepare(
        'INSERT INTO vehicles(registration_normalized, registration_display) VALUES(?, ?) ON CONFLICT(registration_normalized) DO UPDATE SET registration_display = excluded.registration_display'
      ).bind(normalizedReg, input.vehicleRegistration.trim().toUpperCase()),
      db.prepare(
        `INSERT INTO bookings(
          booking_code, status_token_hash, source, reservation_state, payment_state,
          hold_expires_at, service_date, slot_snapshot_id, customer_id, vehicle_id,
          category_id, category_name_en_snapshot, category_name_hi_snapshot,
          cylinder_count_snapshot, base_price_paise_snapshot, gst_rate_bps_snapshot,
          gst_amount_paise_snapshot, total_price_paise_snapshot, amount_paid_paise, advance_paise_snapshot,
          balance_paise_snapshot, slot_label_en_snapshot, slot_label_hi_snapshot,
          slot_start_snapshot, slot_end_snapshot, slot_capacity_snapshot,
          daily_capacity_snapshot, config_version_snapshot, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 
          (SELECT id FROM customers WHERE mobile_e164 = ?),
          (SELECT id FROM vehicles WHERE registration_normalized = ?),
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`
      ).bind(
        bookingCode, statusTokenHash, input.source, reservationState, paymentState, expiresAt, slot.serviceDate, slot.id,
        normalizedPhone, normalizedReg, categoryRow.id, categoryRow.nameEn, categoryRow.nameHi,
        categoryRow.cylinderCount, categoryRow.basePricePaise, categoryRow.gstRateBps,
        gstAmountPaise, totalPricePaise, amountPaidPaise, advancePaise, balancePaise,
        slot.slotLabelEn, slot.slotLabelHi, slot.startTime, slot.endTime,
        slot.slotCapacity, slot.dayCapacity, slot.configVersion, now, now
      ),
      db.prepare(
        `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
         SELECT id, 'BOOKING_HELD', 'CUSTOMER', ?, ?
         FROM bookings WHERE booking_code = ?`
      ).bind(input.source, JSON.stringify({ locale: input.locale }), bookingCode),
      db.prepare(
        'INSERT INTO idempotency_keys(idempotency_key, endpoint, response_json, created_at) VALUES(?, ?, ?, ?)'
      ).bind(input.idempotencyKey, 'create-hold', JSON.stringify(responseSnapshot), now),
    ]);
  } catch (error) {
    const existing = await readIdempotentResult();
    if (existing) return existing;
    throw error;
  }

  const row = await querySingle<{ id: number }>(
    db,
    'SELECT id FROM bookings WHERE booking_code = ?',
    [bookingCode]
  );

  return { ...responseSnapshot, bookingId: row.id };
}

export async function submitPaymentEvidence(
  db: D1Database,
  bookingCode: string,
  statusToken: string,
  input: { utr: string; source: 'WEB' | 'PHONE' | 'WHATSAPP' | 'WALKIN' }
) {
  const normalizedUtr = normalizeUtr(input.utr);
  if (normalizedUtr.length < 8) throw new Error('Please enter a valid UTR/reference number');

  const submittedAt = nowIso();
  const results = await db.batch([
    db.prepare(
      `UPDATE bookings
       SET payment_utr_normalized = ?,
           payment_submitted_at = ?,
           payment_state = 'EVIDENCE_SUBMITTED',
           reservation_state = 'PENDING_VERIFICATION',
           updated_at = ?
       WHERE booking_code = ?
         AND status_token_hash = ?
         AND reservation_state = 'HELD'
         AND payment_state = 'ADVANCE_PENDING'
         AND hold_expires_at > ?`
    ).bind(normalizedUtr, submittedAt, submittedAt, bookingCode, sha256(statusToken), submittedAt),
    db.prepare(
      `INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json)
       SELECT id, 'PAYMENT_EVIDENCE_SUBMITTED', 'CUSTOMER', ?, ?
       FROM bookings
       WHERE booking_code = ?
         AND status_token_hash = ?
         AND reservation_state = 'PENDING_VERIFICATION'
         AND payment_state = 'EVIDENCE_SUBMITTED'
         AND payment_submitted_at = ?`
    ).bind(input.source, JSON.stringify({ utrLast4: normalizedUtr.slice(-4) }), bookingCode, sha256(statusToken), submittedAt),
  ]);

  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new Error('Booking not found, expired, or no longer accepting payment evidence');
  }

  return { paymentState: 'EVIDENCE_SUBMITTED', reservationState: 'PENDING_VERIFICATION' };
}


function businessDateInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Extends the active schedule version's daily slot snapshots to 45 days ahead.
 * The first snapshot date is the activation date of the current config version;
 * this prevents a new schedule from being projected backwards over already-booked dates.
 */
export async function extendFutureSnapshots(db: D1Database) {
  const today = businessDateInIndia();
  const horizonEnd = addCalendarDays(today, 45);
  const versionResult = await db.prepare(
    'SELECT config_version AS configVersion, effective_from AS effectiveFrom FROM schedule_versions ORDER BY effective_from ASC, config_version ASC'
  ).all<SnapshotScheduleVersion>();

  const versions = versionResult.results ?? [];
  const ranges = buildSnapshotScheduleRanges(today, horizonEnd, versions);
  if (!ranges.length) return 0;

  const statements = ranges.map((range) => db.prepare(
    `WITH RECURSIVE days(service_date) AS (
       SELECT date(?)
       UNION ALL
       SELECT date(service_date, '+1 day') FROM days WHERE service_date < date(?)
     )
     INSERT OR IGNORE INTO daily_slot_snapshots(
       service_date, weekday, slot_template_id, config_version,
       slot_label_en, slot_label_hi, start_time, end_time,
       slot_capacity, daily_capacity, is_closed
     )
     SELECT
       days.service_date,
       CAST(strftime('%w', days.service_date) AS INTEGER),
       st.id,
       st.config_version,
       st.slot_label_en,
       st.slot_label_hi,
       st.start_time,
       st.end_time,
       st.slot_capacity,
       COALESCE(ov.daily_capacity_override, ws.daily_capacity),
       COALESCE(ov.is_closed, 0)
     FROM days
     JOIN weekly_schedule ws
       ON ws.weekday = CAST(strftime('%w', days.service_date) AS INTEGER)
      AND ws.config_version = ?
      AND ws.is_open = 1
     JOIN slot_templates st
       ON st.config_version = ?
     LEFT JOIN date_overrides ov
       ON ov.service_date = days.service_date`
  ).bind(range.startDate, range.endDate, range.configVersion, range.configVersion));

  const results = await db.batch(statements);
  return results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
}

export async function expireDueHolds(db: D1Database) {
  const result = await db
    .prepare(
      `UPDATE bookings
       SET reservation_state = 'EXPIRED',
           payment_state = CASE WHEN payment_state = 'ADVANCE_PENDING' THEN 'ADVANCE_PENDING' ELSE payment_state END,
           updated_at = ?
       WHERE reservation_state = 'HELD'
         AND payment_state = 'ADVANCE_PENDING'
         AND hold_expires_at IS NOT NULL
         AND hold_expires_at <= ?`
    )
    .bind(nowIso(), nowIso())
    .run();

  return result.meta.changes ?? 0;
}
