import type { APIRoute } from 'astro';
import { getDb, getBusinessSettings } from '../../../lib/db';
import { jsonResponse } from '../../../lib/utils';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb({ locals } as any);
  const settings = await getBusinessSettings(db);

  const address =
    settings.address_line && settings.address_line !== 'SETUP_REQUIRED'
      ? settings.address_line
      : 'Rewari Industrial Corridor (NH-48), Rewari, Haryana 123401';

  const mapUrl =
    settings.map_url && settings.map_url !== 'SETUP_REQUIRED'
      ? settings.map_url
      : 'https://maps.google.com/?q=Rewari+Haryana+CNG+Testing';

  const vpaId =
    settings.vpa_id && settings.vpa_id !== 'SETUP_REQUIRED'
      ? settings.vpa_id
      : 'hsrgreenenergy@icici';

  const vpaPayeeName =
    settings.vpa_payee_name && settings.vpa_payee_name !== 'SETUP_REQUIRED'
      ? settings.vpa_payee_name
      : 'HSR Green Energy';

  return jsonResponse({
    businessNameEn: settings.business_name_en || 'HSR Green Energy',
    businessNameHi: settings.business_name_hi || 'एचएसआर ग्रीन एनर्जी',
    city: settings.city || 'Rewari',
    address,
    phone: settings.contact_phone || '+919910055355',
    whatsappNumber: settings.whatsapp_number || '+919910055355',
    mapUrl,
    vpaId,
    vpaPayeeName,
    timezone: settings.timezone || 'Asia/Kolkata',
    holdMinutes: settings.hold_minutes || 15,
    flatAdvancePaise: settings.flat_advance_paise ?? 50000,
    hidePricingUntilVehicleDetails: (settings as any).hide_pricing_until_vehicle_details === 1,
    enablePublicReminders: settings.enable_public_reminders !== 0,
    paymentConfigured: true,
    r2UploadEnabled: settings.r2_enabled === 1,
    promoCode: settings.promo_code || null,
    promoDiscountType: settings.promo_discount_type || 'FLAT',
    promoDiscountValue: settings.promo_discount_value || 0,
    promoBannerText: settings.promo_banner_text || null,
    promoBannerActive: settings.promo_banner_active !== 0,
    promoAutoApply: settings.promo_auto_apply !== 0,
    whatsappMode: settings.whatsapp_mode || 'STANDARD',
    socialLinks: {
      facebook: settings.social_facebook || 'https://facebook.com/hsrgreenenergy',
      instagram: settings.social_instagram || 'https://instagram.com/hsrgreenenergy',
      youtube: settings.social_youtube || 'https://youtube.com/@hsrgreenenergy',
      twitter: settings.social_twitter || 'https://twitter.com/hsrgreenenergy',
      whatsapp: settings.social_whatsapp || (settings.whatsapp_number ? `https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}` : 'https://wa.me/919910055355'),
    },
    showSocialMedia: settings.show_social_media !== 0,
    voucherAmountPaise: settings.voucher_amount_paise ?? 20000,
    voucherEnabled: settings.voucher_enabled !== 0,
  });
};
