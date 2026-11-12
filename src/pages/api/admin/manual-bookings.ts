import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRole } from '../../../lib/auth';
import { createHold } from '../../../lib/booking-engine';
import { getDb } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { getRuntimeEnv } from '../../../lib/runtime-env';

const schema = z.object({
  locale: z.enum(['en', 'hi']).default('en'),
  slotSnapshotId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  customerName: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(10).max(20),
  vehicleRegistration: z.string().trim().min(4).max(20),
  source: z.enum(['PHONE', 'WHATSAPP', 'WALKIN']),
  paymentCollected: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await requireRole(request, getRuntimeEnv(locals), ['OWNER', 'RECEPTIONIST']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse('Invalid manual booking details', 400);

  try {
    const result = await createHold(getDb({ locals } as any), {
      ...parsed.data,
      source: parsed.data.source,
      reservationState: 'CONFIRMED',
      paymentState: parsed.data.paymentCollected ? 'PAID_AT_COUNTER' : 'ADVANCE_PENDING',
    });

    return jsonResponse({
      bookingCode: result.bookingCode,
      serviceDate: result.slot.serviceDate,
      slotLabel: parsed.data.locale === 'hi' ? result.slot.slotLabelHi : result.slot.slotLabelEn,
      vehicleName: result.category.name,
      cylinderCount: result.category.cylinderCount,
      totalPricePaise: result.pricing.totalPricePaise,
      paymentState: result.paymentState,
      reservationState: result.reservationState,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create manual booking';
    const isConflict = /capacity_exceeded|already passed|closed/i.test(message);
    return errorResponse(message, isConflict ? 409 : 400, isConflict ? 'BOOKING_CONFLICT' : 'BOOKING_FAILED');
  }
};
