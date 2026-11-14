import type { APIRoute } from 'astro';
import { getDb, getBusinessSettings } from '../../../lib/db';
import { jsonResponse } from '../../../lib/utils';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb({ locals } as any);
  const settings = await getBusinessSettings(db);
  return jsonResponse({
    businessNameEn: settings.business_name_en,
    businessNameHi: settings.business_name_hi,
    city: settings.city,
    address: settings.address_line,
    phone: settings.contact_phone,
    whatsappNumber: settings.whatsapp_number,
    mapUrl: settings.map_url,
    timezone: settings.timezone,
    holdMinutes: settings.hold_minutes,
    flatAdvancePaise: settings.flat_advance_paise,
    enablePublicReminders: settings.enable_public_reminders !== 0,
    paymentConfigured:
      !!settings.vpa_id &&
      settings.vpa_id.trim() !== '' &&
      settings.vpa_id !== 'SETUP_REQUIRED' &&
      !!settings.vpa_payee_name &&
      settings.vpa_payee_name.trim() !== '' &&
      settings.vpa_payee_name !== 'SETUP_REQUIRED',
    r2UploadEnabled: settings.r2_enabled === 1,
  });
};
