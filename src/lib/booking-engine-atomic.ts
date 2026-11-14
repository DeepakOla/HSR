import type { D1Database } from '@cloudflare/workers-types';

/**
 * Atomically reserves consecutive cylinder capacity across one or more slot windows
 * and inserts the booking group + vehicle bookings in a single D1 batch transaction.
 */
export async function reserveConsecutiveSlotsAtomically(
  db: D1Database,
  params: {
    slotDate: string;
    consecutiveSlots: Array<{ slotTime: string; cylindersToAllocate: number }>;
    insertBookingGroupSql: { sql: string; bindings: unknown[] };
    insertBookingSqlList: Array<{ sql: string; bindings: unknown[] }>;
  }
): Promise<{ success: boolean; conflictSlotTime?: string }> {
  // 1. First expire any stale HOLDs on that date inline so abandoned holds never block real customers
  await db
    .prepare(
      `UPDATE bookings 
       SET booking_status = 'EXPIRED_HOLD', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE slot_date = ?1 AND booking_status = 'HOLD' AND hold_expires_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
    )
    .bind(params.slotDate)
    .run();

  // 2. Build atomic conditional UPDATE statements for each required consecutive slot
  const statements = params.consecutiveSlots.map((slot) =>
    db
      .prepare(
        `UPDATE slot_capacity_allocations 
         SET allocated_cylinders = allocated_cylinders + ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE slot_date = ?2
           AND slot_time = ?3
           AND is_manually_blocked = 0
           AND (allocated_cylinders + ?1) <= max_cylinders`
      )
      .bind(slot.cylindersToAllocate, params.slotDate, slot.slotTime)
  );

  // 3. Append the booking_groups and bookings INSERT statements into the same batch
  statements.push(
    db.prepare(params.insertBookingGroupSql.sql).bind(...params.insertBookingGroupSql.bindings)
  );
  for (const bookingStmt of params.insertBookingSqlList) {
    statements.push(db.prepare(bookingStmt.sql).bind(...bookingStmt.bindings));
  }

  // 4. Execute as an all-or-nothing D1 transaction batch
  const results = await db.batch(statements);

  // Verify every slot UPDATE affected exactly 1 row; if any returned 0 changes, roll back
  for (let i = 0; i < params.consecutiveSlots.length; i++) {
    if (!results[i]?.meta?.changes || results[i].meta.changes === 0) {
      throw new Error(`SLOT_CAPACITY_EXCEEDED:${params.consecutiveSlots[i].slotTime}`);
    }
  }

  return { success: true };
}
