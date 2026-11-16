import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { getDb } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { validateOrigin } from '../../../lib/security';
import { errorResponse, jsonResponse } from '../../../lib/utils';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const auth = await requireRole(request, env, ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const db = getDb({ locals } as any);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const statusFilter = (url.searchParams.get('status') || '').trim();

  try {
    let sql = `
      SELECT id, vehicle_registration, display_reg_no, mobile, email, cylinder_info,
             voucher_code, voucher_discount_paise, status, notes, created_at
      FROM due_date_assistance_requests
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (q) {
      conditions.push(`(
        vehicle_registration LIKE ? OR 
        voucher_code LIKE ? OR 
        mobile LIKE ? OR 
        email LIKE ?
      )`);
      const searchPattern = `%${q.toUpperCase()}%`;
      const searchRaw = `%${q}%`;
      params.push(searchPattern, searchPattern, searchRaw, searchRaw);
    }

    if (statusFilter && ['PENDING_ASSISTANCE', 'CONTACTED', 'RESOLVED', 'BOOKED'].includes(statusFilter)) {
      conditions.push(`status = ?`);
      params.push(statusFilter);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY created_at DESC LIMIT 150`;

    const rows = await db.prepare(sql).bind(...params).all<any>();
    const vouchers = rows.results || [];

    // Compute summary statistics
    const statsRow = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING_ASSISTANCE' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'CONTACTED' THEN 1 ELSE 0 END) as contacted,
        SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) as booked,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
        SUM(voucher_discount_paise) as totalDiscountPaise
      FROM due_date_assistance_requests
    `).first<any>();

    const stats = {
      total: statsRow?.total || 0,
      pending: statsRow?.pending || 0,
      contacted: statsRow?.contacted || 0,
      booked: statsRow?.booked || 0,
      resolved: statsRow?.resolved || 0,
      totalDiscountPaise: statsRow?.totalDiscountPaise || 0,
    };

    return jsonResponse({ vouchers, stats });
  } catch (err: any) {
    console.error('Failed to query vouchers:', err);
    return errorResponse('Failed to retrieve vouchers and assistance requests', 500);
  }
};

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING_ASSISTANCE', 'CONTACTED', 'RESOLVED', 'BOOKED']),
  notes: z.string().max(1000).optional(),
});

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const auth = await requireRole(request, env, ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid payload: id and valid status are required', 400);
  }

  const { id, status, notes } = parsed.data;
  const db = getDb({ locals } as any);

  try {
    let updateSql = `UPDATE due_date_assistance_requests SET status = ?`;
    const params: any[] = [status];

    if (notes !== undefined) {
      updateSql += `, notes = ?`;
      params.push(notes);
    }

    updateSql += ` WHERE id = ?`;
    params.push(id);

    const result = await db.prepare(updateSql).bind(...params).run();

    if (result.meta?.changes === 0) {
      return errorResponse('Voucher record not found', 404);
    }

    return jsonResponse({ success: true, id, status });
  } catch (err: any) {
    console.error('Failed to update voucher status:', err);
    return errorResponse('Failed to update voucher status', 500);
  }
};
