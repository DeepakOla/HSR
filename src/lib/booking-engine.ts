import type { Locale } from './constants';
import { getBusinessSettings, queryAll, querySingle } from './db';
import { addMinutes, generateBookingCode, generateOpaqueToken, normalizePhoneIndian, normalizeUtr, normalizeVehicleRegistration, nowIso, sha256 } from './utils';
import type { SlotAvailability, VehicleCategory } from './types';

const ACTIVE_STATES_SQL = "('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')";

export async function fetchAvailability(db: D1Database, locale: Locale, fromDate: string, days = 14): Promise<SlotAvailability[]> {
  const endDate = new Date(fromDate);
  endDate.setDate(endDate.getDate() + days);
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

  return rows.map((row) => {
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
}

export async function createHold(db: D1Database, input: CreateHoldInput) {
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

  if (slot.isClosed === 1) {
    throw new Error('This slot is closed');
  }

  const category = await querySingle<{
    id: number;
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

  const customerUpsert = await db
    .prepare(
      'INSERT INTO customers(name, mobile_e164) VALUES(?, ?) ON CONFLICT(mobile_e164) DO UPDATE SET name = excluded.name RETURNING id'
    )
    .bind(input.customerName.trim(), normalizedPhone)
    .first<{ id: number }>();

  if (!customerUpsert) throw new Error('Could not create customer');

  const vehicleUpsert = await db
    .prepare(
      'INSERT INTO vehicles(registration_normalized, registration_display) VALUES(?, ?) ON CONFLICT(registration_normalized) DO UPDATE SET registration_display = excluded.registration_display RETURNING id'
    )
    .bind(normalizedReg, input.vehicleRegistration.trim().toUpperCase())
    .first<{ id: number }>();

  if (!vehicleUpsert) throw new Error('Could not create vehicle');

  const gstAmountPaise = Math.round((category.basePricePaise * category.gstRateBps) / 10_000);
  const totalPricePaise = category.basePricePaise + gstAmountPaise;
  const advancePaise = category.advancePaise;
  const balancePaise = advancePaise == null ? null : totalPricePaise - advancePaise;

  const bookingCode = generateBookingCode();
  const statusToken = generateOpaqueToken(24);
  const statusTokenHash = sha256(statusToken);
  const expiresAt = addMinutes(new Date(), settings.hold_minutes).toISOString();

  const insert = await db
    .prepare(
      `INSERT INTO bookings(
        booking_code,
        status_token_hash,
        source,
        reservation_state,
        payment_state,
        hold_expires_at,
        service_date,
        slot_snapshot_id,
        customer_id,
        vehicle_id,
        category_id,
        category_name_en_snapshot,
        category_name_hi_snapshot,
        cylinder_count_snapshot,
        base_price_paise_snapshot,
        gst_rate_bps_snapshot,
        gst_amount_paise_snapshot,
        total_price_paise_snapshot,
        advance_paise_snapshot,
        balance_paise_snapshot,
        slot_label_en_snapshot,
        slot_label_hi_snapshot,
        slot_start_snapshot,
        slot_end_snapshot,
        slot_capacity_snapshot,
        daily_capacity_snapshot,
        config_version_snapshot,
        created_at,
        updated_at
      )
      SELECT
        ?, ?, ?,
        'HELD',
        'ADVANCE_PENDING',
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      WHERE
        (SELECT COALESCE(SUM(b.cylinder_count_snapshot),0) FROM bookings b WHERE b.slot_snapshot_id = ? AND b.reservation_state IN ${ACTIVE_STATES_SQL}) + ? <= ?
        AND
        (SELECT COALESCE(SUM(b2.cylinder_count_snapshot),0) FROM bookings b2 WHERE b2.service_date = ? AND b2.reservation_state IN ${ACTIVE_STATES_SQL}) + ? <= ?`
    )
    .bind(
      bookingCode,
      statusTokenHash,
      input.source,
      expiresAt,
      slot.serviceDate,
      slot.id,
      customerUpsert.id,
      vehicleUpsert.id,
      category.id,
      category.nameEn,
      category.nameHi,
      category.cylinderCount,
      category.basePricePaise,
      category.gstRateBps,
      gstAmountPaise,
      totalPricePaise,
      advancePaise,
      balancePaise,
      slot.slotLabelEn,
      slot.slotLabelHi,
      slot.startTime,
      slot.endTime,
      slot.slotCapacity,
      slot.dayCapacity,
      slot.configVersion,
      nowIso(),
      nowIso(),
      slot.id,
      category.cylinderCount,
      slot.slotCapacity,
      slot.serviceDate,
      category.cylinderCount,
      slot.dayCapacity
    )
    .run();

  if (!insert.success || (insert.meta.changes ?? 0) < 1) {
    throw new Error('Selected slot no longer has enough capacity');
  }

  const row = await querySingle<{
    id: number;
    bookingCode: string;
  }>(
    db,
    `SELECT id, booking_code AS bookingCode FROM bookings WHERE booking_code = ?`,
    [bookingCode]
  );

  await db
    .prepare(
      'INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json) VALUES(?, ?, ?, ?, ?)'
    )
    .bind(row.id, 'BOOKING_HELD', 'CUSTOMER', input.source, JSON.stringify({ locale: input.locale }))
    .run();

  return {
    bookingId: row.id,
    bookingCode,
    statusToken,
    holdExpiresAt: expiresAt,
    category,
    slot,
    pricing: {
      basePricePaise: category.basePricePaise,
      gstRateBps: category.gstRateBps,
      gstAmountPaise,
      totalPricePaise,
      advancePaise,
      balancePaise,
    },
    paymentConfig: {
      vpaId: settings.vpa_id,
      payeeName: settings.vpa_payee_name,
      r2Enabled: settings.r2_enabled === 1,
      whatsappNumber: settings.whatsapp_number,
    },
  };
}

export async function submitPaymentEvidence(
  db: D1Database,
  bookingCode: string,
  input: { utr?: string; source: 'WEB' | 'PHONE' | 'WHATSAPP' | 'WALKIN' }
) {
  const booking = await querySingle<{
    id: number;
    paymentState: string;
    reservationState: string;
  }>(
    db,
    `SELECT id, payment_state AS paymentState, reservation_state AS reservationState
     FROM bookings WHERE booking_code = ?`,
    [bookingCode]
  );

  if (booking.reservationState === 'CANCELLED' || booking.reservationState === 'EXPIRED' || booking.reservationState === 'REJECTED') {
    throw new Error('Booking is no longer active');
  }

  let normalizedUtr: string | null = null;
  if (input.utr) {
    normalizedUtr = normalizeUtr(input.utr);
    if (normalizedUtr.length < 8) {
      throw new Error('Please enter a valid UTR/reference number');
    }
  }

  const result = await db
    .prepare(
      `UPDATE bookings
       SET payment_utr_normalized = COALESCE(?, payment_utr_normalized),
           payment_submitted_at = ?,
           payment_state = 'EVIDENCE_SUBMITTED',
           reservation_state = 'PENDING_VERIFICATION',
           updated_at = ?
       WHERE id = ?`
    )
    .bind(normalizedUtr, nowIso(), nowIso(), booking.id)
    .run();

  if (!result.success || (result.meta.changes ?? 0) < 1) {
    throw new Error('Could not save payment evidence');
  }

  await db
    .prepare(
      'INSERT INTO booking_audit_events(booking_id, event_type, actor_type, actor_id, event_payload_json) VALUES(?, ?, ?, ?, ?)'
    )
    .bind(booking.id, 'PAYMENT_EVIDENCE_SUBMITTED', 'CUSTOMER', input.source, JSON.stringify({ utr: normalizedUtr }))
    .run();

  return { bookingId: booking.id, paymentState: 'EVIDENCE_SUBMITTED', reservationState: 'PENDING_VERIFICATION' };
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
