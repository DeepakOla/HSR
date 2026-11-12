import { errorResponse } from './utils';

export type StaffRole = 'OWNER' | 'RECEPTIONIST';

interface StaffContext {
  email: string;
  role: StaffRole;
}

export function getStaffContext(request: Request, env: Env): StaffContext | null {
  const cfEmail = request.headers.get('cf-access-authenticated-user-email');
  const devRole = request.headers.get('x-dev-role');
  const devEmail = request.headers.get('x-dev-email') ?? 'dev@example.com';

  const isProd = !!env.ACCESS_TEAM_DOMAIN && env.ACCESS_TEAM_DOMAIN !== 'SETUP_REQUIRED.cloudflareaccess.com';

  if (!isProd && devRole && (devRole === 'OWNER' || devRole === 'RECEPTIONIST')) {
    return { email: devEmail, role: devRole };
  }

  if (!cfEmail) return null;

  const roleHeader = request.headers.get('x-staff-role');
  if (roleHeader === 'OWNER' || roleHeader === 'RECEPTIONIST') {
    return { email: cfEmail, role: roleHeader };
  }

  return null;
}

export function requireRole(request: Request, env: Env, allowedRoles: StaffRole[]) {
  const staff = getStaffContext(request, env);
  if (!staff) {
    return { ok: false as const, response: errorResponse('Authentication required', 401, 'UNAUTHORIZED') };
  }
  if (!allowedRoles.includes(staff.role)) {
    return { ok: false as const, response: errorResponse('Forbidden', 403, 'FORBIDDEN') };
  }
  return { ok: true as const, staff };
}
