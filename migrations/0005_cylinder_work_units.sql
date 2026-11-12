-- Move the original 2-hour block model to one work-unit per CNG cylinder.
-- Existing future bookings cannot be safely translated because their exact
-- cylinder-by-cylinder start times were never recorded. Stop rather than double-book.
CREATE TABLE migration_0005_preflight (ok INTEGER NOT NULL CHECK (ok = 0));
INSERT INTO migration_0005_preflight(ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM bookings
  WHERE reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
    AND service_date >= date('now', '+330 minutes')
) THEN 1 ELSE 0 END;
DROP TABLE migration_0005_preflight;

ALTER TABLE weekly_schedule
  ADD COLUMN slot_interval_minutes INTEGER NOT NULL DEFAULT 20
  CHECK (slot_interval_minutes IN (15, 20));
ALTER TABLE weekly_schedule
  ADD COLUMN extended_hours_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (extended_hours_enabled IN (0, 1));
ALTER TABLE weekly_schedule
  ADD COLUMN extended_hours_public INTEGER NOT NULL DEFAULT 0
  CHECK (extended_hours_public IN (0, 1));

ALTER TABLE slot_templates
  ADD COLUMN interval_minutes INTEGER NOT NULL DEFAULT 20
  CHECK (interval_minutes IN (15, 20));
ALTER TABLE slot_templates
  ADD COLUMN is_extended INTEGER NOT NULL DEFAULT 0
  CHECK (is_extended IN (0, 1));

ALTER TABLE daily_slot_snapshots
  ADD COLUMN interval_minutes INTEGER NOT NULL DEFAULT 20
  CHECK (interval_minutes IN (15, 20));
ALTER TABLE daily_slot_snapshots
  ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1
  CHECK (is_public IN (0, 1));

ALTER TABLE vehicles
  ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE bookings
  ADD COLUMN vehicle_type_snapshot TEXT NOT NULL DEFAULT 'Other';

CREATE TABLE booking_slot_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slot_snapshot_id INTEGER NOT NULL REFERENCES daily_slot_snapshots(id),
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  UNIQUE(booking_id, ordinal),
  UNIQUE(slot_snapshot_id)
);
CREATE INDEX idx_booking_slot_allocations_booking
  ON booking_slot_allocations(booking_id);

-- Keep the former vehicle categories for historical records, but stop offering them.
UPDATE vehicle_categories
SET is_active = 0, updated_at = datetime('now')
WHERE code IN ('CAR_TAXI_1', 'CAR_LCV_2', 'HEAVY_TRUCK_4');

WITH RECURSIVE cylinder_counts(n) AS (
  VALUES (1)
  UNION ALL
  SELECT n + 1 FROM cylinder_counts WHERE n < 12
)
INSERT INTO vehicle_categories(
  code, sort_order, name_en, name_hi, cylinder_count,
  base_price_paise, gst_rate_bps, advance_paise, is_active
)
SELECT
  'CYL_' || printf('%02d', n),
  n,
  printf('%d CNG cylinder(s)', n),
  printf('%d सीएनजी सिलेंडर', n),
  n,
  250000 * n,
  1800,
  NULL,
  1
FROM cylinder_counts
WHERE 1
ON CONFLICT(code) DO UPDATE SET
  sort_order = excluded.sort_order,
  name_en = excluded.name_en,
  name_hi = excluded.name_hi,
  cylinder_count = excluded.cylinder_count,
  base_price_paise = excluded.base_price_paise,
  gst_rate_bps = 1800,
  is_active = 1,
  updated_at = datetime('now');

-- Create a new schedule version from tomorrow, leaving historical snapshots intact.
-- The first version uses 20-minute units and one additional staff-only hour.
WITH current_version AS (
  SELECT COALESCE(MAX(config_version), 1) AS version FROM weekly_schedule
),
current_hours AS (
  SELECT
    ws.open_time,
    ws.close_time,
    ws.break_start,
    ws.break_end,
    CAST(substr(ws.open_time, 1, 2) AS INTEGER) * 60
      + CAST(substr(ws.open_time, 4, 2) AS INTEGER) AS open_minute,
    CAST(substr(ws.close_time, 1, 2) AS INTEGER) * 60
      + CAST(substr(ws.close_time, 4, 2) AS INTEGER) AS close_minute,
    CASE WHEN ws.break_start IS NULL THEN NULL ELSE
      CAST(substr(ws.break_start, 1, 2) AS INTEGER) * 60
        + CAST(substr(ws.break_start, 4, 2) AS INTEGER) END AS break_start_minute,
    CASE WHEN ws.break_end IS NULL THEN NULL ELSE
      CAST(substr(ws.break_end, 1, 2) AS INTEGER) * 60
        + CAST(substr(ws.break_end, 4, 2) AS INTEGER) END AS break_end_minute
  FROM weekly_schedule ws, current_version cv
  WHERE ws.config_version = cv.version AND ws.is_open = 1
  ORDER BY ws.weekday
  LIMIT 1
),
unit_starts(minute_of_day) AS (
  SELECT open_minute FROM current_hours
  UNION ALL
  SELECT minute_of_day + 20
  FROM unit_starts, current_hours
  WHERE minute_of_day + 20 <= close_minute + 60
)
INSERT INTO slot_templates(
  config_version, slot_label_en, slot_label_hi, start_time, end_time,
  slot_capacity, sort_order, interval_minutes, is_extended
)
SELECT
  (SELECT version + 1 FROM current_version),
  printf('%02d:%02d - %02d:%02d',
    minute_of_day / 60, minute_of_day % 60,
    (minute_of_day + 20) / 60, (minute_of_day + 20) % 60),
  printf('%02d:%02d - %02d:%02d',
    minute_of_day / 60, minute_of_day % 60,
    (minute_of_day + 20) / 60, (minute_of_day + 20) % 60),
  printf('%02d:%02d', minute_of_day / 60, minute_of_day % 60),
  printf('%02d:%02d', (minute_of_day + 20) / 60, (minute_of_day + 20) % 60),
  1,
  ROW_NUMBER() OVER (ORDER BY minute_of_day),
  20,
  CASE WHEN minute_of_day >= (SELECT close_minute FROM current_hours) THEN 1 ELSE 0 END
FROM unit_starts
WHERE minute_of_day < (SELECT close_minute + 60 FROM current_hours)
  AND (
    minute_of_day < (SELECT close_minute FROM current_hours)
    OR minute_of_day < (SELECT close_minute + 60 FROM current_hours)
  )
  AND NOT (
    (SELECT break_start_minute FROM current_hours) IS NOT NULL
    AND (SELECT break_end_minute FROM current_hours) IS NOT NULL
    AND minute_of_day < (SELECT break_end_minute FROM current_hours)
    AND minute_of_day + 20 > (SELECT break_start_minute FROM current_hours)
  );

-- Mirror the existing weekday openings into the new schedule version.
INSERT INTO weekly_schedule(
  weekday, is_open, open_time, close_time, break_start, break_end,
  daily_capacity, slot_duration_minutes, slot_interval_minutes, extended_hours_enabled,
  extended_hours_public, config_version
)
SELECT
  old.weekday,
  old.is_open,
  old.open_time,
  old.close_time,
  old.break_start,
  old.break_end,
  CASE WHEN old.is_open = 1 THEN (
    SELECT COUNT(*) FROM slot_templates
    WHERE config_version = (SELECT COALESCE(MAX(config_version), 1) FROM slot_templates)
  ) ELSE 0 END,
  old.slot_duration_minutes,
  20,
  1,
  0,
  (SELECT COALESCE(MAX(config_version), 1) FROM slot_templates)
FROM weekly_schedule old
WHERE old.config_version = (
  SELECT MAX(config_version) FROM weekly_schedule
);

-- Old 2-hour snapshots are not compatible with the new work-unit allocator.
UPDATE daily_slot_snapshots
SET is_closed = 1
WHERE service_date >= date('now', '+330 minutes');

-- Generate fresh 45-day snapshots using the new 20-minute templates.
WITH RECURSIVE days(service_date) AS (
  SELECT date('now', '+330 minutes', '+1 day')
  UNION ALL
  SELECT date(service_date, '+1 day')
  FROM days
  WHERE service_date < date('now', '+330 minutes', '+45 day')
)
INSERT INTO daily_slot_snapshots(
  service_date, weekday, slot_template_id, config_version,
  slot_label_en, slot_label_hi, start_time, end_time,
  slot_capacity, daily_capacity, is_closed, interval_minutes, is_public
)
SELECT
  days.service_date,
  CAST(strftime('%w', days.service_date) AS INTEGER),
  st.id,
  st.config_version,
  st.slot_label_en,
  st.slot_label_hi,
  st.start_time,
  st.end_time,
  1,
  (SELECT COUNT(*) FROM slot_templates all_slots
   WHERE all_slots.config_version = st.config_version),
  COALESCE(ov.is_closed, 0),
  st.interval_minutes,
  CASE WHEN st.is_extended = 1 AND ws.extended_hours_public = 0 THEN 0 ELSE 1 END
FROM days
JOIN weekly_schedule ws
  ON ws.weekday = CAST(strftime('%w', days.service_date) AS INTEGER)
 AND ws.config_version = (SELECT MAX(config_version) FROM weekly_schedule)
 AND ws.is_open = 1
JOIN slot_templates st
  ON st.config_version = ws.config_version
LEFT JOIN date_overrides ov
  ON ov.service_date = days.service_date;

INSERT OR IGNORE INTO schedule_versions(config_version, effective_from)
SELECT
  (SELECT MAX(config_version) FROM weekly_schedule),
  date('now', '+330 minutes', '+1 day');

-- Enforce a consecutive, unoccupied work-unit run at the database write boundary.
DROP TRIGGER IF EXISTS bookings_capacity_guard;
CREATE TRIGGER bookings_capacity_guard
BEFORE INSERT ON bookings
FOR EACH ROW
WHEN NEW.reservation_state IN ('HELD','PENDING_VERIFICATION','CONFIRMED','CHECKED_IN','IN_PROGRESS')
BEGIN
  SELECT RAISE(ABORT, 'CYLINDER_COUNT_OUT_OF_RANGE')
  WHERE NEW.cylinder_count_snapshot < 1 OR NEW.cylinder_count_snapshot > 20;

  SELECT RAISE(ABORT, 'SLOT_CLOSED_OR_PRIVATE')
  WHERE NOT EXISTS (
    SELECT 1
    FROM daily_slot_snapshots dss
    WHERE dss.id = NEW.slot_snapshot_id
      AND dss.service_date = NEW.service_date
      AND dss.config_version = NEW.config_version_snapshot
      AND dss.start_time = NEW.slot_start_snapshot
      AND dss.is_closed = 0
      AND (NEW.source <> 'WEB' OR dss.is_public = 1)
  );

  SELECT RAISE(ABORT, 'CONSECUTIVE_CAPACITY_EXCEEDED')
  WHERE (
    SELECT COUNT(*)
    FROM daily_slot_snapshots dss
    WHERE dss.service_date = NEW.service_date
      AND dss.config_version = NEW.config_version_snapshot
      AND dss.is_closed = 0
      AND dss.start_time >= NEW.slot_start_snapshot
      AND dss.end_time <= NEW.slot_end_snapshot
      AND (NEW.source <> 'WEB' OR dss.is_public = 1)
      AND NOT EXISTS (
        SELECT 1
        FROM booking_slot_allocations allocation
        WHERE allocation.slot_snapshot_id = dss.id
      )
  ) <> NEW.cylinder_count_snapshot
  OR (
    SELECT strftime('%s', '2000-01-01 ' || NEW.slot_end_snapshot)
      - strftime('%s', '2000-01-01 ' || NEW.slot_start_snapshot)
  ) <> NEW.cylinder_count_snapshot * (
    SELECT interval_minutes
    FROM daily_slot_snapshots
    WHERE id = NEW.slot_snapshot_id
  ) * 60;
END;

DROP TRIGGER IF EXISTS release_booking_slot_allocations;
CREATE TRIGGER release_booking_slot_allocations
AFTER UPDATE OF reservation_state ON bookings
FOR EACH ROW
WHEN NEW.reservation_state IN ('CANCELLED','EXPIRED','REJECTED')
BEGIN
  DELETE FROM booking_slot_allocations WHERE booking_id = NEW.id;
END;
