import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';

export const GET: APIRoute = async ({ request, url, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const status = url.searchParams.get('status');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));

  try {
    let query = 'SELECT * FROM retest_reminders';
    const params: (string | number)[] = [];

    if (status && ['PENDING', 'SENT', 'CANCELLED', 'BOOKED'].includes(status.toUpperCase())) {
      query += ' WHERE status = ?';
      params.push(status.toUpperCase());
    }

    query += ' ORDER BY due_date ASC, created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await db.prepare(query).bind(...params).all();

    // Summary counts
    const countRow = await db.prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) AS booked
       FROM retest_reminders`
    ).first<{ total: number; pending: number; sent: number; booked: number }>();

    return jsonResponse({
      reminders: rows.results,
      summary: countRow || { total: 0, pending: 0, sent: 0, booked: 0 },
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Could not fetch reminders', 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    id?: number;
    status?: string;
  } | null;

  if (!body || !body.action) return errorResponse('Missing action', 400);

  const db = getDb({ locals } as any);

  try {
    if (body.action === 'UPDATE_STATUS' && body.id && body.status) {
      if (!['PENDING', 'SENT', 'CANCELLED', 'BOOKED'].includes(body.status.toUpperCase())) {
        return errorResponse('Invalid status', 400);
      }
      await db.prepare(
        "UPDATE retest_reminders SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(body.status.toUpperCase(), body.id).run();

      return jsonResponse({ success: true, id: body.id, status: body.status.toUpperCase() });
    }

    return errorResponse('Unknown action', 400);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Could not update reminder', 500);
  }
};
