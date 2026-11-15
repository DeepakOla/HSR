import type { APIRoute } from 'astro';
import { getDb, getBusinessSettings } from '../../../../lib/db';
import { generateUpiSvgQr } from '../../../../lib/zero-cost-upi';

export const GET: APIRoute = async ({ params, locals }) => {
  const groupRef = params.groupRef;
  if (!groupRef) {
    return new Response('Missing booking reference', { status: 400 });
  }

  const db = getDb({ locals } as any);
  const settings = await getBusinessSettings(db);

  const group = await db.prepare(
    `SELECT id, group_reference, advance_amount_paise 
     FROM booking_groups 
     WHERE group_reference = ? OR id = ?`
  ).bind(groupRef, groupRef).first<{ id: string; group_reference: string; advance_amount_paise: number }>();

  const amountPaise = group?.advance_amount_paise || settings.flat_advance_paise || 50000;
  const payeeVpa = settings.vpa_id && settings.vpa_id !== 'SETUP_REQUIRED' ? settings.vpa_id : 'hsrgreen@icici';
  const payeeName = settings.vpa_payee_name && settings.vpa_payee_name !== 'SETUP_REQUIRED' ? settings.vpa_payee_name : settings.business_name_en;

  const svg = generateUpiSvgQr({
    payeeVpa,
    payeeName,
    amountPaise,
    transactionRef: groupRef,
    note: `CNG Test Advance ${groupRef}`
  });

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store'
    }
  });
};
