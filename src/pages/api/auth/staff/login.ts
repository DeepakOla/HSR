import type { APIRoute } from 'astro';
import { createStaffSessionToken, SESSION_COOKIE_NAME } from '../../../../lib/auth';
import { errorResponse } from '../../../../lib/utils';
import { getRuntimeEnv } from '../../../../lib/runtime-env';
import type { StaffLoginRequest, StaffLoginResponse, StaffRole } from '../../../../types/hsr-contracts';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  if (!env?.DB) {
    return errorResponse('Database connection unavailable', 500, 'DB_UNAVAILABLE');
  }

  try {
    const body = (await request.json()) as StaffLoginRequest;
    const identifier = (body.usernameOrEmail || '').trim().toLowerCase();

    if (!identifier) {
      return errorResponse('Username or email is required', 400, 'MISSING_CREDENTIALS');
    }

    const staff = await env.DB.prepare(
      `SELECT id, email, username_or_email, full_name, role, staff_role, is_active, can_verify_payments
       FROM staff_users
       WHERE (lower(email) = ? OR lower(username_or_email) = ?) AND is_active = 1`
    )
      .bind(identifier, identifier)
      .first<{
        id: string | number;
        email: string;
        username_or_email: string | null;
        full_name: string | null;
        role: string;
        staff_role: string | null;
        is_active: number;
        can_verify_payments: number;
      }>();

    if (!staff) {
      return errorResponse('Invalid username or unauthorized staff account', 401, 'INVALID_CREDENTIALS');
    }

    const effectiveRole = (staff.staff_role || staff.role) as StaffRole;

    // Check expected workspace if provided
    if (body.expectedWorkspace === 'ADMIN' && effectiveRole !== 'ADMIN_OWNER' && effectiveRole !== 'OWNER') {
      return errorResponse('Admin console access requires Owner credentials', 403, 'FORBIDDEN_WORKSPACE');
    }

    let redirectUrl: '/staff/reception/' | '/staff/testing/' | '/admin/' = '/staff/reception/';
    if (effectiveRole === 'ADMIN_OWNER' || effectiveRole === 'OWNER') {
      redirectUrl = '/admin/';
    } else if (effectiveRole === 'TECHNICIAN') {
      redirectUrl = '/staff/testing/';
    }

    // Map role back to OWNER | RECEPTIONIST for legacy session token helper
    const legacyRole = effectiveRole === 'ADMIN_OWNER' ? 'OWNER' : (effectiveRole === 'TECHNICIAN' ? 'RECEPTIONIST' : effectiveRole as any);
    const sessionToken = await createStaffSessionToken(staff.email, legacyRole, env);

    const isHttps = request.url.startsWith('https:');
    const secureFlag = isHttps ? '; Secure' : '';
    const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureFlag}`;

    const responsePayload: StaffLoginResponse = {
      staffUserId: String(staff.id),
      fullName: staff.full_name || staff.email,
      role: effectiveRole,
      canVerifyPayments: staff.can_verify_payments === 1,
      redirectUrl,
    };

    return new Response(JSON.stringify({ success: true, data: responsePayload }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (err: any) {
    return errorResponse(err?.message || 'Authentication error', 500, 'SERVER_ERROR');
  }
};
