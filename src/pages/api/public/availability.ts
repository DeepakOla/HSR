import type { APIRoute } from 'astro';
import { z } from 'zod';
import { fetchAvailability } from '../../../lib/booking-engine';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';

const querySchema = z.object({
  locale: z.enum(['en', 'hi']).default('en'),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? 'en',
    fromDate: url.searchParams.get('fromDate') ?? undefined,
  });

  if (!parsed.success) return errorResponse('Invalid query', 400);

  const fromDate = parsed.data.fromDate ?? new Date().toISOString().slice(0, 10);
  const db = getDb({ locals } as any);
  const slots = await fetchAvailability(db, parsed.data.locale, fromDate, 14);
  return jsonResponse({ slots });
};
