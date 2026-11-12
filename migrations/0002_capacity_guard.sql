-- Each 20-minute snapshot is one cylinder-work unit. A multi-cylinder booking
-- must reserve the same number of consecutive, unoccupied units atomically.
CREATE TRIGGER IF NOT EXISTS bookings_capacity_guard
BEFORE INSERT ON bookings
FOR EACH ROW
WHEN NEW.reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
BEGIN
  SELECT RAISE(ABORT, 'SLOT_CLOSED')
  WHERE NOT EXISTS (
    SELECT 1 FROM daily_slot_snapshots dss
    WHERE dss.id = NEW.slot_snapshot_id
      AND dss.service_date = NEW.service_date
      AND dss.is_closed = 0
      AND (NEW.source != 'WEB' OR dss.is_public = 1)
  );

  SELECT RAISE(ABORT, 'SLOT_CAPACITY_EXCEEDED')
  WHERE (
    SELECT COUNT(*)
    FROM daily_slot_snapshots dss
    WHERE dss.service_date = NEW.service_date
      AND dss.config_version = NEW.config_version_snapshot
      AND dss.is_closed = 0
      AND dss.start_time >= NEW.slot_start_snapshot
      AND dss.end_time <= NEW.slot_end_snapshot
      AND (NEW.source != 'WEB' OR dss.is_public = 1)
      AND NOT EXISTS (
        SELECT 1 FROM booking_slot_allocations allocation
        WHERE allocation.slot_snapshot_id = dss.id
      )
  ) != NEW.cylinder_count_snapshot
  OR (
    SELECT strftime('%s', '2000-01-01 ' || NEW.slot_end_snapshot)
      - strftime('%s', '2000-01-01 ' || NEW.slot_start_snapshot)
  ) != NEW.cylinder_count_snapshot * (
    SELECT interval_minutes FROM daily_slot_snapshots WHERE id = NEW.slot_snapshot_id
  ) * 60;
END;

-- Release time units when an unpaid/declined/cancelled appointment is terminal.
-- Completed bookings retain their historical allocation; they are in the past.
CREATE TRIGGER IF NOT EXISTS release_booking_slot_allocations
AFTER UPDATE OF reservation_state ON bookings
FOR EACH ROW
WHEN NEW.reservation_state IN ('CANCELLED','EXPIRED','REJECTED')
BEGIN
  DELETE FROM booking_slot_allocations WHERE booking_id = NEW.id;
END;
