import type { APIRoute } from 'astro';
import { getCustomerSessionFromCookie } from '../../../lib/customer-auth';
import { jsonResponse, errorResponse } from '../../../lib/utils';
import { normalizeVehicleRegistration } from '../../../lib/vehicle-registration';

function formatDisplayReg(reg: string) {
  if (reg.length >= 8) {
    return `${reg.slice(0, 2)}-${reg.slice(2, 4)}-${reg.slice(4, -4)}-${reg.slice(-4)}`;
  }
  return reg;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals?.runtime?.env;
  if (!env?.DB) return errorResponse('DB unavailable', 500, 'DB_UNAVAILABLE');

  const session = await getCustomerSessionFromCookie(request, env);
  if (!session) return errorResponse('Unauthorized customer session', 401, 'UNAUTHORIZED');

  try {
    const vehicles = await env.DB.prepare(
      `SELECT v.id, 
              COALESCE(v.normalized_reg_no, v.registration_normalized) as normalizedRegNo,
              COALESCE(v.display_reg_no, v.registration_display) as displayRegNo,
              COALESCE(v.vehicle_category, 'CAR') as vehicleCategory,
              v.make_model as makeModel,
              COALESCE(v.default_cylinder_count, 1) as cylinderCount,
              v.last_test_date as lastTestDate,
              v.next_test_due_date as nextTestDueDate,
              pva.access_role as accessRole
       FROM vehicles v
       JOIN party_vehicle_access pva ON pva.vehicle_id = v.id
       WHERE pva.party_id = ? AND v.is_active = 1
       ORDER BY v.created_at DESC`
    )
      .bind(session.partyId)
      .all<any>();

    return jsonResponse(vehicles.results || [], 200);
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to list vehicles', 500, 'SERVER_ERROR');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals?.runtime?.env;
  if (!env?.DB) return errorResponse('DB unavailable', 500, 'DB_UNAVAILABLE');

  const session = await getCustomerSessionFromCookie(request, env);
  if (!session) return errorResponse('Unauthorized customer session', 401, 'UNAUTHORIZED');

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const rawReg = (body.registration || '').trim();
    if (!rawReg) return errorResponse('Vehicle registration is required', 400, 'MISSING_REG');

    const normalized = normalizeVehicleRegistration(rawReg);
    const display = formatDisplayReg(normalized);
    const category = body.category || 'CAR';
    const cylinderCount = Number(body.cylinderCount || 1);
    const makeModel = body.makeModel || null;

    // Check if vehicle exists
    let vehicle = await env.DB.prepare(
      'SELECT id FROM vehicles WHERE normalized_reg_no = ? OR registration_normalized = ?'
    )
      .bind(normalized, normalized)
      .first<{ id: string | number }>();

    let vehicleId: string;
    if (!vehicle) {
      vehicleId = `veh_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO vehicles (
          id, normalized_reg_no, display_reg_no, registration_normalized, registration_display,
          vehicle_category, make_model, default_cylinder_count, owner_party_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(vehicleId, normalized, display, normalized, display, category, makeModel, cylinderCount, session.partyId)
        .run();
    } else {
      vehicleId = String(vehicle.id);
    }

    // Link vehicle to party
    await env.DB.prepare(
      `INSERT OR IGNORE INTO party_vehicle_access (id, party_id, vehicle_id, access_role)
       VALUES (?, ?, ?, 'OWNER')`
    )
      .bind(`pva_${crypto.randomUUID()}`, session.partyId, vehicleId)
      .run();

    return jsonResponse({ success: true, vehicleId, displayRegNo: display }, 201);
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to add vehicle', 500, 'SERVER_ERROR');
  }
};
