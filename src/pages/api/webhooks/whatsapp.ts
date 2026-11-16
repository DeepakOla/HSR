import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { sendMetaFreeServiceReply } from '../../../lib/zero-cost-messaging';

// 1. Meta Webhook Verification Handshake (GET)
export const GET: APIRoute = async ({ url, locals }) => {
  const env = getRuntimeEnv(locals);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expectedToken = (env as any)?.META_WA_VERIFY_TOKEN || 'hsr_meta_verify_token_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
};

// 2. Inbound Customer Message Receiver & Free 24h Window Auto-Responder (POST)
export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  const db = getDb({ locals } as any);
  const payload = (await request.json().catch(() => null)) as any;

  const messageObj = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!messageObj || messageObj.type !== 'text') {
    return new Response('OK', { status: 200 });
  }

  const senderWaDigits = String(messageObj.from || ''); // e.g. '919876543210'
  const incomingText = String(messageObj.text?.body || '');

  // Check if message contains a Booking Group Reference (#HSR-YYYYMMDD-XXXX or HSR-...) or Prelaunch Voucher (HSR200-XXXX)
  const bookingMatch = incomingText.match(/\b(HSR-\d{8}-[A-Z0-9]+)\b/i) || incomingText.match(/\b(HSR-[A-Z0-9-]+)\b/i);
  const voucherMatch = incomingText.match(/\b(HSR200-[A-Z0-9]{4})\b/i);

  if (bookingMatch && db) {
    const groupRef = bookingMatch[1].toUpperCase();
    try {
      const bookingInfo = await db
        .prepare(
          `SELECT b.booking_token, b.slot_date, b.slot_start_time, b.reservation_state,
                  COALESCE(b.display_reg_no, v.display_reg_no, v.registration_display, 'CNG-VEHICLE') as display_reg_no
           FROM bookings b
           LEFT JOIN booking_groups bg ON bg.id = b.booking_group_id
           LEFT JOIN vehicles v ON v.id = b.vehicle_id
           WHERE bg.group_reference = ?1 OR b.booking_token = ?1
           LIMIT 1`
        )
        .bind(groupRef)
        .first<{
          booking_token: string;
          slot_date: string;
          slot_start_time: string;
          reservation_state: string;
          display_reg_no: string;
        }>();

      if (bookingInfo) {
        const replyText =
          `⚡ *HSR Green Energy — Official Gate Pass & Test Status*\n\n` +
          `• *Booking Ref:* ${groupRef}\n` +
          `• *Vehicle Reg:* ${bookingInfo.display_reg_no}\n` +
          `• *Date & Slot:* ${bookingInfo.slot_date || 'Today'} at ${bookingInfo.slot_start_time || '09:00'}\n` +
          `• *Status:* ${bookingInfo.reservation_state}\n\n` +
          `📋 *Documents to Bring:* Original Vehicle RC & previous cylinder test certificate (if available).\n` +
          `🌐 *Live Bay Tracker & Gate Pass QR:* https://hsr.kumardeepakola.workers.dev/booking-status/${bookingInfo.booking_token}`;

        await sendMetaFreeServiceReply(env, senderWaDigits, replyText);
      }
    } catch (err) {
      console.warn('WhatsApp webhook booking lookup error:', err);
    }
  } else if (voucherMatch && db) {
    const voucherCode = voucherMatch[1].toUpperCase();
    const replyText =
      `🎉 *HSR Green Energy — ₹200 Launch Voucher Confirmed!*\n\n` +
      `Your priority voucher *${voucherCode}* is registered against your number. ` +
      `You will receive early-bird priority booking access and due-date alerts for your 3-year PESO hydro test before public slots open.`;

    await sendMetaFreeServiceReply(env, senderWaDigits, replyText);
  }

  return new Response('OK', { status: 200 });
};
