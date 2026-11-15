import type { BusinessSettings } from './types';

export interface WhatsAppMessagePayload {
  toPhoneE164: string;    // e.g. '+919876543210'
  customerName?: string;
  vehicleReg?: string;
  bookingRef?: string;
  appointmentTime?: string;
  messageText: string;
}

export function generateDirectWaMeLink(phoneE164: string, message: string): string {
  const cleanPhone = phoneE164.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function generateDirectTelLink(phone: string): string {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  return `tel:${cleanPhone}`;
}

export async function dispatchWhatsAppNotification(
  settings: BusinessSettings,
  payload: WhatsAppMessagePayload
): Promise<{ success: boolean; mode: 'STANDARD' | 'CLOUD_API'; link?: string; messageId?: string; error?: string }> {
  const cleanTo = payload.toPhoneE164.replace(/[^0-9]/g, '');

  // 1. If configured for Official Meta WhatsApp Cloud API
  if (
    settings.whatsapp_mode === 'CLOUD_API' &&
    settings.whatsapp_api_key &&
    settings.whatsapp_phone_number_id
  ) {
    try {
      const endpoint = `https://graph.facebook.com/v19.0/${settings.whatsapp_phone_number_id}/messages`;
      
      const body = settings.whatsapp_template_name ? {
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'template',
        template: {
          name: settings.whatsapp_template_name,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: payload.customerName || 'Customer' },
                { type: 'text', text: payload.vehicleReg || 'Vehicle' },
                { type: 'text', text: payload.appointmentTime || 'Today' },
                { type: 'text', text: payload.bookingRef || 'HSR-BK' }
              ]
            }
          ]
        }
      } : {
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: { body: payload.messageText }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data: any = await response.json();
        const messageId = data?.messages?.[0]?.id;
        return { success: true, mode: 'CLOUD_API', messageId };
      } else {
        const errData = await response.text();
        console.warn('Meta WhatsApp Cloud API failed, falling back to Standard link:', errData);
      }
    } catch (err) {
      console.error('Meta WhatsApp Cloud API error:', err);
    }
  }

  // 2. Default Zero-Cost Mode: Generate wa.me deep-link
  const link = generateDirectWaMeLink(payload.toPhoneE164, payload.messageText);
  return {
    success: true,
    mode: 'STANDARD',
    link
  };
}
