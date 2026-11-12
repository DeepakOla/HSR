import type { APIRoute } from 'astro';
import { z } from 'zod';
import { fetchVehicleCategories } from '../../../lib/booking-engine';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';

const querySchema = z.object({
  locale: z.enum(['en', 'hi']).default('en'),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const parsed = querySchema.safeParse({ locale: url.searchParams.get('locale') ?? 'en' });
  if (!parsed.success) return errorResponse('Invalid query', 400);

  const db = getDb({ locals } as any);
  const categories = await fetchVehicleCategories(db, parsed.data.locale);
  return jsonResponse({ categories });
};
