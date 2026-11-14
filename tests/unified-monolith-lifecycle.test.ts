import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

import { createMockD1, type MockD1Database } from './helpers/d1-mock';
import { createHold, submitPaymentEvidence, extendFutureSnapshots, fetchAvailability } from '../src/lib/booking-engine';
import { evaluatePesoTestOutcome } from '../src/types/hsr-contracts';

describe('Unified Monolith End-to-End Operational Lifecycle', () => {
  let db: MockD1Database;

  beforeEach(async () => {
    db = createMockD1();
    // Configure station payment settings
    await db.exec(`
      UPDATE business_settings
      SET vpa_id = 'hsrgreen@icici',
          vpa_payee_name = 'HSR Green Energy',
          hold_minutes = 15,
          flat_advance_paise = 50000;
    `);
    await extendFutureSnapshots(db as any);
  });

  it('executes full synchronized lifecycle from booking to test certification and release', async () => {
    // 1. Check availability
    const slots = await fetchAvailability(db as any, 'en', '2026-11-15', 7, 1);
    expect(slots.length).toBeGreaterThan(0);
    const chosenSlot = slots[0];

    // 2. Customer creates booking hold via public website (One Vehicle, Car, 1 Cyl)
    const holdResult = await createHold(db as any, {
      slotSnapshotId: chosenSlot.slotSnapshotId,
      vehicleRegistration: 'HR 26 DQ 5551',
      vehicleType: 'Maruti Suzuki WagonR CNG',
      customerName: 'Deepak Kumar',
      mobile: '9876543210',
      locale: 'en',
      categoryId: 4, // 1 cylinder
      source: 'WEB',
      idempotencyKey: 'idem-test-lifecycle-01',
    });

    expect(holdResult.bookingCode).toBeDefined();
    expect(holdResult.statusToken).toBeDefined();
    expect(holdResult.pricing.advancePaise).toBe(50000);

    // 3. Verify Unified Monolith Synchronization in D1 (0008 Schema)
    const phoneRow = await db.prepare('SELECT * FROM contact_phones WHERE phone_e164 = ?')
      .bind('+919876543210')
      .first<any>();
    expect(phoneRow).toBeDefined();
    expect(phoneRow.display_phone).toBe('9876543210');

    const partyRow = await db.prepare('SELECT * FROM parties WHERE full_name = ?')
      .bind('Deepak Kumar')
      .first<any>();
    expect(partyRow).toBeDefined();
    expect(partyRow.party_type).toBe('INDIVIDUAL');

    const vehicleRow = await db.prepare('SELECT * FROM vehicles WHERE registration_normalized = ?')
      .bind('HR26DQ5551')
      .first<any>();
    expect(vehicleRow).toBeDefined();

    const accessRow = await db.prepare('SELECT * FROM party_vehicle_access WHERE party_id = ?')
      .bind(partyRow.id)
      .first<any>();
    expect(accessRow).toBeDefined();

    const bookingRow = await db.prepare('SELECT * FROM bookings WHERE booking_code = ?')
      .bind(holdResult.bookingCode)
      .first<any>();
    expect(bookingRow).toBeDefined();
    expect(bookingRow.booking_token).toBe(holdResult.statusToken);
    expect(bookingRow.booking_status).toBe('HOLD');
    expect(bookingRow.testing_status).toBe('NOT_ARRIVED');
    expect(bookingRow.rc_owner_name_snapshot).toBe('Deepak Kumar');

    // 4. Customer submits payment evidence (12-digit UPI UTR)
    const evidenceResult = await submitPaymentEvidence(
      db as any,
      holdResult.bookingCode,
      holdResult.statusToken,
      { utr: '123456789012', source: 'WEB' }
    );
    expect(evidenceResult.paymentState).toBe('EVIDENCE_SUBMITTED');

    // Verify booking updated to CONFIRMED
    const confirmedBooking = await db.prepare('SELECT * FROM bookings WHERE booking_code = ?')
      .bind(holdResult.bookingCode)
      .first<any>();
    expect(confirmedBooking.booking_status).toBe('CONFIRMED');

    // Verify payment ledger has record
    const paymentRow = await db.prepare('SELECT * FROM payments WHERE utr_or_reference = ?')
      .bind('123456789012')
      .first<any>();
    expect(paymentRow).toBeDefined();
    expect(paymentRow.amount_paise).toBe(50000);
    expect(paymentRow.payment_state).toBe('PENDING_VERIFICATION');

    // 5. Customer Workspace API Query Verification
    const upcomingAppts = await db.prepare(`
      SELECT b.id as bookingId, b.booking_token as bookingToken,
             COALESCE(v.display_reg_no, v.registration_display) as displayRegNo,
             b.booking_status as bookingStatus, b.testing_status as testingStatus
      FROM bookings b
      LEFT JOIN booking_groups bg ON bg.id = b.booking_group_id
      LEFT JOIN vehicles v ON v.id = b.vehicle_id
      WHERE (bg.booker_party_id = ? OR b.rc_owner_party_id = ?)
    `).bind(partyRow.id, partyRow.id).all<any>();

    expect(upcomingAppts.results?.length).toBe(1);
    expect(upcomingAppts.results?.[0].bookingStatus).toBe('CONFIRMED');

    // 6. Reception Desk Gate Check-In & Bay Assignment
    await db.prepare(`
      UPDATE bookings
      SET reservation_state = 'CHECKED_IN',
          testing_status = 'IN_BAY_INTAKE',
          assigned_bay_id = 'res-bay-01',
          checked_in_at = datetime('now')
      WHERE id = ?
    `).bind(bookingRow.id).run();

    await db.prepare("UPDATE station_resources SET status = 'OCCUPIED' WHERE id = 'res-bay-01'").run();

    const bayCheck = await db.prepare("SELECT status FROM station_resources WHERE id = 'res-bay-01'").first<any>();
    expect(bayCheck.status).toBe('OCCUPIED');

    // 7. Shop-Floor Technician Testing Worksheet
    const cylId = 'cyl_test_01';
    await db.prepare(`
      INSERT INTO cylinders (
        id, vehicle_id, serial_number, manufacturer, country_of_origin,
        manufacturing_date, water_capacity_liters, original_tare_weight_kg, test_pressure_bar
      ) VALUES (?, ?, 'EKC-2021-9988', 'EKC', 'INDIA', '2021-03', 60.0, 52.0, 300.0)
    `).bind(cylId, vehicleRow.id).run();

    // Mathematical evaluation using statutory PESO rules
    const testEval = evaluatePesoTestOutcome({
      visualCheck: 'SATISFACTORY',
      threadCheck: 'SATISFACTORY',
      internalCheck: 'SATISFACTORY',
      valveCheck: 'SATISFACTORY',
      originalTareWeightKg: 52.0,
      observedWeightKg: 50.5, // 2.88% loss <= 5% -> PASS
      minWallThicknessMm: 3.2,
      maxWallThicknessMm: 3.8,
      totalExpansionCc: 440.0,
      permanentExpansionCc: 22.0, // 5.0% stretch <= 10% -> PASS
    });

    expect(testEval.calculatedOutcome).toBe('PASS');
    expect(testEval.weightLossPct).toBeLessThanOrEqual(5.0);
    expect(testEval.permanentExpansionPct).toBeLessThanOrEqual(10.0);

    // Save test record
    const testRecordId = 'rec_test_01';
    await db.prepare(`
      INSERT INTO cylinder_test_records (
        id, booking_id, cylinder_id, hydro_rig_id, tested_by_staff_id,
        visual_check, thread_check, internal_check, valve_check,
        observed_weight_kg, weight_loss_pct, min_wall_thickness_mm, max_wall_thickness_mm, base_thickness_mm,
        applied_test_pressure_bar, total_expansion_cc, permanent_expansion_cc, permanent_expansion_pct,
        internal_drying_done, neck_stamping_done, test_outcome, peso_certificate_number, retest_due_date
      ) VALUES (
        ?, ?, ?, 'res-rig-a', 'tech@hsr.test',
        'SATISFACTORY', 'SATISFACTORY', 'SATISFACTORY', 'SATISFACTORY',
        50.5, ?, 3.2, 3.8, 7.5,
        300.0, 440.0, 22.0, ?,
        1, 1, 'PASS', 'PESO-HR-884920', '2029-11-15'
      )
    `).bind(testRecordId, bookingRow.id, cylId, testEval.weightLossPct, testEval.permanentExpansionPct).run();

    await db.prepare(`
      UPDATE bookings
      SET testing_status = 'PASS_CERT_PENDING'
      WHERE id = ?
    `).bind(bookingRow.id).run();

    // 8. PESO Certificate Upload & Vehicle Release
    await db.prepare(`
      INSERT INTO documents (
        id, booking_id, cylinder_test_record_id, doc_type, r2_object_key, file_name, mime_type, uploaded_by_staff_id
      ) VALUES (
        'doc_cert_01', ?, ?, 'PESO_CERTIFICATE_PDF', 'certificates/2026/PESO_HR_884920.pdf', 'PESO_Certificate_HR26DQ5551.pdf', 'application/pdf', 'compliance@hsr.test'
      )
    `).bind(bookingRow.id, testRecordId).run();

    // Release vehicle, free bay back to ONLINE, update next test due date (+3 years)
    await db.prepare(`
      UPDATE bookings
      SET booking_status = 'COMPLETED',
          testing_status = 'RELEASED',
          released_at = datetime('now')
      WHERE id = ?
    `).bind(bookingRow.id).run();

    await db.prepare("UPDATE station_resources SET status = 'ONLINE' WHERE id = 'res-bay-01'").run();

    await db.prepare(`
      UPDATE vehicles
      SET last_test_date = '2026-11-15',
          next_test_due_date = '2029-11-15'
      WHERE id = ?
    `).bind(vehicleRow.id).run();

    // 9. Admin Overview Verification
    const bayAfterRelease = await db.prepare("SELECT status FROM station_resources WHERE id = 'res-bay-01'").first<any>();
    expect(bayAfterRelease.status).toBe('ONLINE');

    const releasedBooking = await db.prepare("SELECT booking_status, testing_status FROM bookings WHERE id = ?").bind(bookingRow.id).first<any>();
    expect(releasedBooking.booking_status).toBe('COMPLETED');
    expect(releasedBooking.testing_status).toBe('RELEASED');

    const updatedVehicle = await db.prepare("SELECT next_test_due_date FROM vehicles WHERE id = ?").bind(vehicleRow.id).first<any>();
    expect(updatedVehicle.next_test_due_date).toBe('2029-11-15');

    const docInVault = await db.prepare("SELECT * FROM documents WHERE booking_id = ?").bind(bookingRow.id).first<any>();
    expect(docInVault).toBeDefined();
    expect(docInVault.doc_type).toBe('PESO_CERTIFICATE_PDF');
  });
});
