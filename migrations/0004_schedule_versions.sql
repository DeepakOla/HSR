-- Persist the exact effective date for each weekly schedule version.
-- The initial version is backfilled from its seeded daily snapshots.
CREATE TABLE IF NOT EXISTS schedule_versions (
  config_version INTEGER PRIMARY KEY,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schedule_versions(config_version, effective_from)
SELECT config_version, MIN(service_date)
FROM daily_slot_snapshots
GROUP BY config_version;

CREATE INDEX IF NOT EXISTS idx_schedule_versions_effective
ON schedule_versions(effective_from, config_version);
