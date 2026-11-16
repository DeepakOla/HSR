import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb, getBusinessSettings } from '../../../lib/db';
import { errorResponse, jsonResponse } from '../../../lib/utils';
import { generateDirectWaMeLink } from '../../../lib/zero-cost-messaging';

const calcSchema = z.object({
  vehicleReg: z.string().trim().min(4).max(20),
  mobile: z.string().trim().min(10).max(15),
  lastTestDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD'),
  vehicleCategory: z.enum(['CAR', 'TEMPO_LCV', 'TRUCK_BUS']).default('CAR'),
  corridor: z.string().trim().max(100).default('Gurugram-Rewari'),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const parsed = calcSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid vehicle registration or test date provided.', 400);
  }

  const { vehicleReg, mobile, lastTestDate, vehicleCategory, corridor } = parsed.data;
  const db = getDb({ locals } as any);
  const settings = await getBusinessSettings(db);

  // Clean vehicle reg
  const cleanReg = vehicleReg.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanPhone = mobile.replace(/[^0-9]/g, '').slice(-10);
  const phoneE164 = `+91${cleanPhone}`;

  // Statutory calculation: Exactly 3 years from last test date
  const lastDate = new Date(lastTestDate);
  const expiryDate = new Date(lastDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 3);

  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const calculatedExpiryDateStr = expiryDate.toISOString().slice(0, 10);

  // Generate unique 8-character voucher code e.g. HSR200-7B3A
  const voucherSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const voucherCode = `HSR200-${voucherSuffix}`;

  const leadId = crypto.randomUUID().replace(/-/g, '');

  try {
    await db.prepare(`
      INSERT INTO prelaunch_waitlist_leads (
        id, vehicle_registration, display_reg_no, phone_e164, contact_phone,
        vehicle_category, last_tested_date, calculated_expiry_date, days_until_expiry,
        voucher_code, voucher_discount_paise, corridor, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 20000, ?, 'EXPIRY_CALCULATOR')
    `).bind(
      leadId,
      cleanReg,
      vehicleReg.toUpperCase(),
      phoneE164,
      cleanPhone,
      vehicleCategory,
      lastTestDate,
      calculatedExpiryDateStr,
      daysUntilExpiry,
      voucherCode,
      corridor
    ).run();
  } catch (err) {
    console.warn('Waitlist lead insert non-fatal:', err);
  }

  // Generate WhatsApp reminder link
  const waMessage = `Hello HSR Green Energy, my CNG vehicle ${vehicleReg.toUpperCase()} hydro test is due on ${calculatedExpiryDateStr}. My ₹200 voucher code is ${voucherCode}. Please book my test slot.`;
  const waLink = generateDirectWaMeLink(settings.whatsapp_number || '+919910055355', waMessage);

  return jsonResponse({
    vehicleRegistration: cleanReg,
    calculatedExpiryDate: calculatedExpiryDateStr,
    daysUntilExpiry,
    isOverdue: daysUntilExpiry < 0,
    voucherCode,
    voucherDiscountInr: 200,
    whatsappBookLink: waLink
  });
};
