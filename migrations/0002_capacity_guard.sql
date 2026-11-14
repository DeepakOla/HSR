-- Enforce both slot and daily cylinder limits at the database write boundary.
-- D1 batch() runs statements sequentially in a transaction and rolls back on trigger failure.
CREATE TRIGGER IF NOT EXISTS bookings_capacity_guard
BEFORE INSERT ON bookings
FOR EACH ROW
WHEN NEW.reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
BEGIN
  SELECT RAISE(ABORT, 'SLOT_CLOSED')
  WHERE (SELECT is_closed FROM daily_slot_snapshots WHERE id = NEW.slot_snapshot_id) != 0;

  SELECT RAISE(ABORT, 'SLOT_CAPACITY_EXCEEDED')
  WHERE (
    SELECT COALESCE(SUM(b.cylinder_count_snapshot), 0)
    FROM bookings AS b
    WHERE b.slot_snapshot_id = NEW.slot_snapshot_id
      AND b.reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
  ) + NEW.cylinder_count_snapshot > (
    SELECT dss.slot_capacity
    FROM daily_slot_snapshots AS dss
    WHERE dss.id = NEW.slot_snapshot_id
  );

  SELECT RAISE(ABORT, 'DAILY_CAPACITY_EXCEEDED')
  WHERE (
    SELECT COALESCE(SUM(b.cylinder_count_snapshot), 0)
    FROM bookings AS b
    WHERE b.service_date = NEW.service_date
      AND b.reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
  ) + NEW.cylinder_count_snapshot > (
    SELECT dss.daily_capacity
    FROM daily_slot_snapshots AS dss
    WHERE dss.id = NEW.slot_snapshot_id
  );
END;
