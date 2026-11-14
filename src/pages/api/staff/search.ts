import type { APIRoute } from 'astro';
import { getStaffContext } from '../../../lib/auth';
import { jsonResponse, errorResponse } from '../../../lib/utils';
import { normalizeVehicleRegistration } from '../../../lib/vehicle-registration';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  if (!env?.DB) return errorResponse('DB unavailable', 500, 'DB_UNAVAILABLE');

  const staff = await getStaffContext(request, env);
  if (!staff) return errorResponse('Staff authentication required', 401, 'UNAUTHORIZED');

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return jsonResponse({ results: [] }, 200);

  const cleanQuery = q.toLowerCase();
  const normalizedPlate = normalizeVehicleRegistration(q);

  try {
    // Search vehicles
    const vehicles = await env.DB.prepare(
      `SELECT v.id, v.display_reg_no, v.normalized_reg_no, v.vehicle_category, v.default_cylinder_count,
              v.next_test_due_date, p.full_name as ownerName
       FROM vehicles v
       LEFT JOIN parties p ON p.id = v.owner_party_id
       WHERE v.normalized_reg_no LIKE ? OR v.registration_normalized LIKE ?
       LIMIT 5`
    )
      .bind(`%${normalizedPlate}%`, `%${normalizedPlate}%`)
      .all<any>();

    // Search customers by name or phone
    const customers = await env.DB.prepare(
      `SELECT p.id, p.full_name, p.party_type, cp.display_phone, cp.phone_e164
       FROM parties p
       LEFT JOIN party_phones pp ON pp.party_id = p.id
       LEFT JOIN contact_phones cp ON cp.id = pp.phone_id
       WHERE lower(p.full_name) LIKE ? OR cp.display_phone LIKE ? OR cp.phone_e164 LIKE ?
       LIMIT 5`
    )
      .bind(`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`)
      .all<any>();

    // Search cylinders
    const cylinders = await env.DB.prepare(
      `SELECT c.id, c.serial_number, c.manufacturer, c.current_status, c.next_retest_due_date,
              v.display_reg_no
       FROM cylinders c
       LEFT JOIN vehicles v ON v.id = c.vehicle_id
       WHERE lower(c.serial_number) LIKE ?
       LIMIT 5`
    )
      .bind(`%${cleanQuery}%`)
      .all<any>();

    return jsonResponse(
      {
        vehicles: vehicles.results || [],
        customers: customers.results || [],
        cylinders: cylinders.results || [],
      },
      200
    );
  } catch (err: any) {
    return errorResponse(err?.message || 'Search failed', 500, 'SERVER_ERROR');
  }
};
