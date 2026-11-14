import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { jsonResponse, errorResponse } from '../../../lib/utils';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const auth = await requireRole(request, env, ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  if (!env?.DB) return errorResponse('Database unavailable', 500, 'DB_UNAVAILABLE');

  try {
    const resources = await env.DB.prepare(`
      SELECT id, resource_code as resourceCode, resource_name as resourceName,
             resource_type as resourceType, supported_categories_json as supportedCategoriesJson,
             status, calibration_cert_no as calibrationCertNo, calibration_valid_until as calibrationValidUntil,
             notes, is_active as isActive, updated_at as updatedAt
      FROM station_resources
      ORDER BY resource_type ASC, resource_code ASC
    `).all();

    return jsonResponse(resources.results || [], 200);
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to list resources', 500, 'SERVER_ERROR');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const auth = await requireRole(request, env, ['OWNER']);
  if (!auth.ok) return auth.response;

  if (!env?.DB) return errorResponse('Database unavailable', 500, 'DB_UNAVAILABLE');

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const action = body.action; // 'TOGGLE_STATUS' | 'UPDATE_CALIBRATION' | 'CREATE'

    if (action === 'TOGGLE_STATUS') {
      const resourceId = (body.resourceId || '').trim();
      const newStatus = (body.status || 'ONLINE').trim();
      const validStatuses = ['ONLINE', 'OCCUPIED', 'MAINTENANCE', 'CALIBRATION_DUE'];
      if (!validStatuses.includes(newStatus)) {
        return errorResponse('Invalid resource status', 400, 'INVALID_STATUS');
      }

      await env.DB.prepare(`
        UPDATE station_resources
        SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).bind(newStatus, resourceId).run();

      return jsonResponse({ success: true, message: `Resource status changed to ${newStatus}` }, 200);
    }

    if (action === 'UPDATE_CALIBRATION') {
      const resourceId = (body.resourceId || '').trim();
      const certNo = (body.calibrationCertNo || '').trim();
      const validUntil = (body.calibrationValidUntil || '').trim();

      await env.DB.prepare(`
        UPDATE station_resources
        SET calibration_cert_no = ?,
            calibration_valid_until = ?,
            status = 'ONLINE',
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).bind(certNo, validUntil, resourceId).run();

      return jsonResponse({ success: true, message: 'Calibration certificate updated' }, 200);
    }

    if (action === 'CREATE') {
      const resourceCode = (body.resourceCode || '').trim().toUpperCase();
      const resourceName = (body.resourceName || '').trim();
      const resourceType = (body.resourceType || 'VEHICLE_BAY').trim();
      const categoriesJson = JSON.stringify(body.supportedCategories || ['CAR', 'TEMPO_LCV']);

      if (!resourceCode || !resourceName) {
        return errorResponse('Resource code and name are required', 400, 'MISSING_PARAMS');
      }

      const id = `res_${crypto.randomUUID()}`;
      await env.DB.prepare(`
        INSERT INTO station_resources (
          id, resource_code, resource_name, resource_type, supported_categories_json, status, is_active
        ) VALUES (?, ?, ?, ?, ?, 'ONLINE', 1)
      `).bind(id, resourceCode, resourceName, resourceType, categoriesJson).run();

      return jsonResponse({ success: true, id, message: 'Resource created successfully' }, 201);
    }

    return errorResponse('Unrecognized action', 400, 'INVALID_ACTION');
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to update resource', 500, 'SERVER_ERROR');
  }
};
