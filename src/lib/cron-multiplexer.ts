import { generateDailyB2cConsolidation } from './zoho-books-free';

export async function handleMultiplexedCron(db: D1Database): Promise<{
  expiredHolds: number;
  reconciledCredits: number;
  zohoConsolidated: boolean;
}> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Release expired unpaid holds (Agent Invariant: only HELD + ADVANCE_PENDING)
  const staleHolds = await db.prepare(`
    SELECT id, booking_group_id 
    FROM bookings 
    WHERE booking_status = 'HELD' 
      AND payment_status = 'ADVANCE_PENDING'
      AND hold_expires_at IS NOT NULL 
      AND hold_expires_at < ?
  `).bind(nowIso).all<{ id: string; booking_group_id: string }>();

  let expiredHolds = 0;
  if (staleHolds.results && staleHolds.results.length > 0) {
    const bookingIds = staleHolds.results.map(r => r.id);
    const groupIds = Array.from(new Set(staleHolds.results.map(r => r.booking_group_id).filter(Boolean)));

    const placeholders = bookingIds.map(() => '?').join(',');
    await db.batch([
      db.prepare(`
        UPDATE bookings 
        SET reservation_state = 'CANCELLED', payment_state = 'REFUNDED', updated_at = ? 
        WHERE id IN (${placeholders})
      `).bind(nowIso, ...bookingIds),
      ...(groupIds.length > 0 ? [
        db.prepare(`
          UPDATE booking_groups 
          SET payment_status = 'REFUNDED', updated_at = ? 
          WHERE id IN (${groupIds.map(() => '?').join(',')})
        `).bind(nowIso, ...groupIds)
      ] : []),
      ...bookingIds.map(id => 
        db.prepare(`
          INSERT INTO booking_audit_events (booking_id, event_type, actor_type, actor_id, event_payload_json)
          VALUES (?, 'HOLD_EXPIRED_AUTO_RELEASED', 'SYSTEM', 'CRON_MULTIPLEXER', ?)
        `).bind(id, JSON.stringify({ expiredAt: nowIso }))
      )
    ]);
    expiredHolds = bookingIds.length;
  }

  // 2. Unmatched UPI alerts matching pass
  const unmatchedCredits = await db.prepare(`
    SELECT id, utr_number, amount_paise, reference_id 
    FROM bank_upi_credits_inbox 
    WHERE status = 'UNMATCHED' 
    LIMIT 10
  `).all<{ id: string; utr_number: string; amount_paise: number; reference_id?: string }>();

  let reconciledCredits = 0;
  if (unmatchedCredits.results && unmatchedCredits.results.length > 0) {
    for (const credit of unmatchedCredits.results) {
      if (credit.reference_id) {
        const group = await db.prepare(`
          SELECT id FROM booking_groups 
          WHERE (group_reference = ? OR id = ?) AND payment_status IN ('UNPAID', 'VERIFICATION_PENDING')
        `).bind(credit.reference_id, credit.reference_id).first<{ id: string }>();

        if (group) {
          await db.batch([
            db.prepare(`UPDATE bank_upi_credits_inbox SET status = 'RECONCILED', matched_booking_group_id = ?, matched_at = ? WHERE id = ?`)
              .bind(group.id, nowIso, credit.id),
            db.prepare(`UPDATE booking_groups SET payment_status = 'PAID', updated_at = ? WHERE id = ?`)
              .bind(nowIso, group.id),
            db.prepare(`UPDATE bookings SET reservation_state = 'CONFIRMED', payment_state = 'ADVANCE_VERIFIED', updated_at = ? WHERE booking_group_id = ?`)
              .bind(nowIso, group.id)
          ]);
          reconciledCredits++;
        }
      }
    }
  }

  // 3. Daily Zoho Books B2C summary voucher consolidation at ~23:30-23:45 IST (18:00 - 18:15 UTC)
  let zohoConsolidated = false;
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  if (utcHours === 18 && utcMinutes >= 0 && utcMinutes <= 20) {
    // Current IST date
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffsetMs);
    const dateStr = istDate.toISOString().slice(0, 10);
    const res = await generateDailyB2cConsolidation(db, dateStr);
    zohoConsolidated = !!res;
  }

  return { expiredHolds, reconciledCredits, zohoConsolidated };
}
