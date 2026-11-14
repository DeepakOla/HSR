import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { getRuntimeEnv } from '../../../../lib/runtime-env';
import {
  createStaffSessionToken,
  getStaffContext,
  SESSION_COOKIE_NAME,
  type StaffRole,
} from '../../../../lib/auth';
import { jsonResponse, errorResponse } from '../../../../lib/utils';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const staff = await getStaffContext(request, env);
  return jsonResponse({
    authenticated: !!staff,
    staff: staff || null,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const db = getDb({ locals });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON payload', 400, 'INVALID_BODY');
  }

  const email = (body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return errorResponse('Please provide a valid staff email address', 400, 'INVALID_EMAIL');
  }

  const staffUser = await db
    .prepare('SELECT id, email, role FROM staff_users WHERE lower(email) = ? AND is_active = 1')
    .bind(email)
    .first<{ id: number; email: string; role: StaffRole }>();

  if (!staffUser) {
    return errorResponse('Unauthorized staff email or account inactive', 401, 'INVALID_STAFF_ACCOUNT');
  }

  const token = await createStaffSessionToken(staffUser.email, staffUser.role, env);

  const cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Authentication successful',
      staff: {
        email: staffUser.email,
        role: staffUser.role,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
      },
    }
  );
};

export const DELETE: APIRoute = async () => {
  const clearCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Logged out successfully',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookie,
        'Cache-Control': 'no-store',
      },
    }
  );
};
