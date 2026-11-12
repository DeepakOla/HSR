import { z } from 'zod';

export const localeSchema = z.enum(['en', 'hi']);

export const createHoldSchema = z.object({
  locale: localeSchema,
  slotSnapshotId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  customerName: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(10).max(20),
  vehicleRegistration: z.string().trim().min(4).max(20),
  source: z.enum(['WEB', 'PHONE', 'WHATSAPP', 'WALKIN']).default('WEB'),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const submitEvidenceSchema = z.object({
  bookingCode: z.string().trim().min(8),
  utr: z.string().trim().max(64).optional(),
  source: z.enum(['WEB', 'PHONE', 'WHATSAPP', 'WALKIN']).default('WEB'),
});

export const adminBookingStateSchema = z.object({
  bookingCode: z.string().trim().min(8),
  action: z.enum(['VERIFY_PAYMENT', 'REJECT', 'CANCEL', 'CHECK_IN', 'START', 'COMPLETE']),
  note: z.string().trim().max(500).optional(),
});

export const expiryCheckSchema = z.object({
  lastPeriodicTestDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
});
