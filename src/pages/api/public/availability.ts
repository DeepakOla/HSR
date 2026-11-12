import type { APIRoute } from 'astro';
import { z } from 'zod';
import { fetchAvailability } from '../../../lib/booking-engine';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';

const querySchema = z.object({
  locale: z.enum(['en', 'hi']).default('en'),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(60).default(45),
  cylinderCount: z.coerce.number().int().min(1).max(20).default(1),
  includeStaffOnly: z.coerce.boolean().default(false),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? 'en',
    fromDate: url.searchParams.get('fromDate') ?? undefined,
    days: url.searchParams.get('days') ?? undefined,
    cylinderCount: url.searchParams.get('cylinderCount') ?? undefined,
    includeStaffOnly: url.searchParams.get('includeStaffOnly') ?? undefined,
  });
  if (!parsed.success) return errorResponse('Invalid query', 400);

  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const fromDate = parsed.data.fromDate ?? String(todayValues.year) + '-' + String(todayValues.month) + '-' + String(todayValues.day);
  const db = getDb({ locals } as any);
  const slots = await fetchAvailability(
    db, parsed.data.locale, fromDate, parsed.data.days,
    parsed.data.cylinderCount, parsed.data.includeStaffOnly
  );
  return jsonResponse({ slots, cylinderCount: parsed.data.cylinderCount, days: parsed.data.days });
};
