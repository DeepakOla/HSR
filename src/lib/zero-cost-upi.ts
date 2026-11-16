import { renderSVG } from 'uqr';
import PostalMime from 'postal-mime';

export interface DynamicUpiParams {
  payeeVpa: string;        // pa e.g. 'hsrgreen@icici'
  payeeName: string;       // pn e.g. 'HSR Green Energy'
  amountPaise: number;     // am e.g. 50000 -> 500.00
  transactionRef: string;  // tr e.g. 'HSR-BK-8712'
  note?: string;           // tn e.g. 'CNG Cylinder Hydro Testing Advance'
}

export function buildUpiUri(params: DynamicUpiParams): string {
  const amountInr = (params.amountPaise / 100).toFixed(2);
  const note = encodeURIComponent(params.note || `HSR CNG Test Ref ${params.transactionRef}`);
  const payeeName = encodeURIComponent(params.payeeName);
  
  return `upi://pay?pa=${params.payeeVpa}&pn=${payeeName}&am=${amountInr}&cu=INR&tr=${params.transactionRef}&tn=${note}`;
}

export function generateUpiSvgQr(params: DynamicUpiParams): string {
  const uri = buildUpiUri(params);
  return renderSVG(uri, {
    ecc: 'M',
    border: 2,
  });
}

export interface ParsedBankAlert {
  utrNumber: string;
  amountPaise: number;
  senderVpa?: string;
  senderName?: string;
  referenceId?: string;
  rawSnippet: string;
}

export async function parseBankAlertEmail(rawMimeStream: ReadableStream | ArrayBuffer | string): Promise<ParsedBankAlert | null> {
  const parser = new PostalMime();
  const parsed = await parser.parse(rawMimeStream as any);
  
  const textContent = (parsed.text || '') + ' ' + (parsed.subject || '');
  if (!textContent.trim()) return null;

  // Extract 12-digit NPCI UTR (Unique Transaction Reference)
  // Look for UTR patterns like "UTR: 432109876543", "UPI Ref: 432109876543", "Ref No: 432109876543"
  const utrMatch = textContent.match(/\b(?:UTR|UPI Ref|Ref No|Txn ID|Reference Number)?[:\s-]*(\d{12})\b/i);
  if (!utrMatch || !utrMatch[1]) return null;
  const utrNumber = utrMatch[1];

  // Extract amount in INR
  let amountPaise = 0;
  const amtMatch = textContent.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.\d{2})?)/i);
  if (amtMatch && amtMatch[1]) {
    const cleanAmt = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (!isNaN(cleanAmt)) {
      amountPaise = Math.round(cleanAmt * 100);
    }
  }

  // Extract reference token if present (e.g. HSR-...)
  const refMatch = textContent.match(/\b(HSR-[A-Z0-9-]+)\b/i);
  const referenceId = refMatch ? refMatch[1] : undefined;

  // Extract sender VPA if present (e.g. name@bank)
  const vpaMatch = textContent.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/);
  const senderVpa = vpaMatch ? vpaMatch[1] : undefined;

  return {
    utrNumber,
    amountPaise,
    senderVpa,
    referenceId,
    rawSnippet: textContent.slice(0, 500),
  };
}

export async function recordAndAutoReconcileUpiCredit(db: D1Database, alert: ParsedBankAlert): Promise<{ reconciled: boolean; bookingGroupId?: string }> {
  const existing = await db.prepare('SELECT id, status FROM bank_upi_credits_inbox WHERE utr_number = ?')
    .bind(alert.utrNumber)
    .first<{ id: string; status: string }>();

  if (existing) {
    return { reconciled: existing.status === 'RECONCILED' };
  }

  let matchedGroupId: string | null = null;
  let newStatus: 'UNMATCHED' | 'RECONCILED' | 'MANUAL_REVIEW' = 'UNMATCHED';

  // 1. Try matching by explicit reference token
  if (alert.referenceId) {
    const group = await db.prepare(
      `SELECT id, payment_status, total_payable_paise 
       FROM booking_groups 
       WHERE (group_reference = ? OR id = ?) AND payment_status IN ('UNPAID', 'VERIFICATION_PENDING')`
    ).bind(alert.referenceId, alert.referenceId).first<{ id: string; payment_status: string; total_payable_paise: number }>();

    if (group) {
      matchedGroupId = group.id;
      newStatus = 'RECONCILED';
    }
  }

  // 2. Fallback matching by exact advance amount and pending state
  if (!matchedGroupId && alert.amountPaise > 0) {
    const candidate = await db.prepare(
      `SELECT id, group_reference 
       FROM booking_groups 
       WHERE payment_status = 'VERIFICATION_PENDING' AND total_payable_paise = ?
       ORDER BY created_at DESC LIMIT 1`
    ).bind(alert.amountPaise).first<{ id: string; group_reference: string }>();

    if (candidate) {
      matchedGroupId = candidate.id;
      newStatus = 'RECONCILED';
    }
  }

  const creditId = crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();

  await db.batch([
    db.prepare(`
      INSERT INTO bank_upi_credits_inbox (
        id, utr_number, amount_paise, sender_vpa, sender_name, reference_id,
        raw_snippet, status, matched_booking_group_id, matched_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      creditId,
      alert.utrNumber,
      alert.amountPaise,
      alert.senderVpa || null,
      alert.senderName || null,
      alert.referenceId || null,
      alert.rawSnippet,
      newStatus,
      matchedGroupId,
      newStatus === 'RECONCILED' ? now : null,
      now
    ),
    ...(matchedGroupId ? [
      db.prepare(`
        UPDATE booking_groups 
        SET payment_status = 'PAID', updated_at = ? 
        WHERE id = ?
      `).bind(now, matchedGroupId),
      db.prepare(`
        UPDATE bookings 
        SET reservation_state = 'CONFIRMED', payment_state = 'ADVANCE_VERIFIED', booking_status = 'CONFIRMED' 
        WHERE booking_group_id = ?
      `).bind(matchedGroupId),
      db.prepare(`
        INSERT INTO booking_audit_events (booking_id, event_type, actor_type, actor_id, event_payload_json)
        VALUES (NULL, 'AUTO_RECONCILED_VIA_BANK_ALERT', 'SYSTEM', 'UPI_INBOX', ?)
      `).bind(JSON.stringify({ utr: alert.utrNumber, amountPaise: alert.amountPaise, matchedGroupId }))
    ] : [])
  ]);

  return { reconciled: newStatus === 'RECONCILED', bookingGroupId: matchedGroupId || undefined };
}
