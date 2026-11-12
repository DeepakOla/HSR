import { errorResponse } from './utils';

export function validateOrigin(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (!env.APP_BASE_URL || env.APP_BASE_URL.includes('SETUP_REQUIRED')) return null;
  const allowed = new URL(env.APP_BASE_URL).origin;
  if (origin !== allowed) {
    return errorResponse('Invalid origin', 403, 'INVALID_ORIGIN');
  }
  return null;
}
