import type { APIRoute } from 'astro';
import { getStaffContext } from '../../../../lib/auth';
import { evaluatePesoTestOutcome } from '../../../../types/hsr-contracts';
import { jsonResponse, errorResponse } from '../../../../lib/utils';
import { getRuntimeEnv } from '../../../../lib/runtime-env';
import type { SubmitCylinderTestReadingRequest } from '../../../../types/hsr-contracts';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  if (!env?.DB) return errorResponse('DB unavailable', 500, 'DB_UNAVAILABLE');

  const staff = await getStaffContext(request, env);
  if (!staff) {
    return errorResponse('Staff authentication required', 401, 'UNAUTHORIZED');
  }

  try {
    const body = (await request.json()) as SubmitCylinderTestReadingRequest;
    const bookingId = (body.bookingId || '').trim();
    const serialNumber = (body.serialNumber || '').trim();
    const manufacturer = (body.manufacturer || '').trim();

    if (!bookingId || !serialNumber || !manufacturer) {
      return errorResponse('Booking ID, cylinder serial number, and manufacturer are required', 400, 'MISSING_FIELDS');
    }

    // Evaluate mathematical outcome according to statutory PESO Gas Cylinders Rules 2016 / IS 8451
    const evaluation = evaluatePesoTestOutcome({
      visualCheck: body.visualCheck,
      threadCheck: body.threadCheck,
      internalCheck: body.internalCheck,
      valveCheck: body.valveCheck,
      originalTareWeightKg: Number(body.originalTareWeightKg),
      observedWeightKg: Number(body.observedWeightKg),
      minWallThicknessMm: Number(body.minWallThicknessMm),
      maxWallThicknessMm: Number(body.maxWallThicknessMm),
      designMinWallThicknessMm: body.designMinWallThicknessMm ? Number(body.designMinWallThicknessMm) : null,
      totalExpansionCc: Number(body.totalExpansionCc),
      permanentExpansionCc: Number(body.permanentExpansionCc),
    });

    const isPass = evaluation.calculatedOutcome === 'PASS';
    const failureReason = evaluation.failureReasons.length > 0 ? evaluation.failureReasons.join('; ') : null;

    // Calculate retest due date (+3 years from today if pass, null if fail)
    const testedDate = new Date();
    const retestDueDate = isPass
      ? new Date(testedDate.getFullYear() + 3, testedDate.getMonth(), testedDate.getDate())
          .toISOString()
          .slice(0, 10)
      : null;

    // Find or create cylinder record
    const cylinder = await env.DB.prepare(
      'SELECT id FROM cylinders WHERE manufacturer = ? AND serial_number = ?'
    )
      .bind(manufacturer, serialNumber)
      .first<{ id: string }>();

    let cylinderId = cylinder?.id;
    if (!cylinderId) {
      cylinderId = `cyl_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO cylinders (
          id, serial_number, manufacturer, country_of_origin, manufacturing_date,
          water_capacity_liters, original_tare_weight_kg, test_pressure_bar,
          current_status, last_tested_at, next_retest_due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          cylinderId,
          serialNumber,
          manufacturer,
          body.countryOfOrigin || 'INDIA',
          body.manufacturingDate || null,
          Number(body.waterCapacityLiters || 60),
          Number(body.originalTareWeightKg),
          Number(body.testPressureBar || 300),
          isPass ? 'ACTIVE' : 'CONDEMNED',
          testedDate.toISOString().slice(0, 10),
          retestDueDate
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE cylinders 
         SET current_status = ?, last_tested_at = ?, next_retest_due_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?`
      )
        .bind(
          isPass ? 'ACTIVE' : 'CONDEMNED',
          testedDate.toISOString().slice(0, 10),
          retestDueDate,
          cylinderId
        )
        .run();
    }

    // Insert or replace cylinder_test_records
    const testRecordId = `ctr_${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO cylinder_test_records (
        id, booking_id, cylinder_id, hydro_rig_id, tested_by_staff_id,
        visual_check, thread_check, internal_check, valve_check,
        observed_weight_kg, weight_loss_pct, min_wall_thickness_mm, max_wall_thickness_mm, base_thickness_mm,
        applied_test_pressure_bar, total_expansion_cc, permanent_expansion_cc, permanent_expansion_pct,
        internal_drying_done, neck_stamping_done, test_outcome, failure_reason, retest_due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        testRecordId,
        bookingId,
        cylinderId,
        body.hydroRigId || 'res-rig-a',
        staff.email,
        body.visualCheck,
        body.threadCheck,
        body.internalCheck,
        body.valveCheck,
        Number(body.observedWeightKg),
        evaluation.weightLossPct,
        Number(body.minWallThicknessMm),
        Number(body.maxWallThicknessMm),
        Number(body.baseThicknessMm || body.minWallThicknessMm),
        Number(body.appliedTestPressureBar || 300),
        Number(body.totalExpansionCc),
        Number(body.permanentExpansionCc),
        evaluation.permanentExpansionPct,
        body.internalDryingDone ? 1 : 0,
        body.neckStampingDone ? 1 : 0,
        evaluation.calculatedOutcome,
        failureReason,
        retestDueDate
      )
      .run();

    // Update booking testing status
    const nextTestingStatus = isPass ? 'PASS_CERT_PENDING' : 'FAIL_CONDEMNED';
    await env.DB.prepare(
      `UPDATE bookings 
       SET testing_status = ?, testing_completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?`
    )
      .bind(nextTestingStatus, bookingId)
      .run();

    return jsonResponse(
      {
        success: true,
        testRecordId,
        outcome: evaluation.calculatedOutcome,
        weightLossPct: evaluation.weightLossPct,
        permanentExpansionPct: evaluation.permanentExpansionPct,
        nextTestingStatus,
        failureReasons: evaluation.failureReasons,
        retestDueDate,
      },
      200
    );
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to record cylinder test readings', 500, 'SERVER_ERROR');
  }
};
