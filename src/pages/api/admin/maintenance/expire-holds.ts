import type { APIRoute } from 'astro';
import { expireDueHolds } from '../../../../lib/booking-engine';
import { getDb } from '../../../../lib/db';
import { errorResponse, jsonResponse } from '../../../../lib/utils';
import { getRuntimeEnv } from '../../../../lib/runtime-env';

export const POST: APIRoute = async ({ request, locals }) => {
  const token = request.headers.get('x-maintenance-token');
  const expected = getRuntimeEnv(locals).DEV_AUTH_SECRET;

  if (!expected || expected === 'SETUP_REQUIRED_DEV_ONLY' || token !== expected) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const db = getDb({ locals } as any);
  const expiredCount = await expireDueHolds(db);
  return jsonResponse({ expiredCount });
};
