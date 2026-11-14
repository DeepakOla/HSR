-- Migration 0007: Retest Reminders and Notification Management
ALTER TABLE business_settings ADD COLUMN enable_public_reminders INTEGER NOT NULL DEFAULT 1 CHECK (enable_public_reminders IN (0, 1));

CREATE TABLE IF NOT EXISTS retest_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_registration TEXT NOT NULL,
  mobile TEXT NOT NULL,
  last_test_date TEXT,
  due_date TEXT NOT NULL,
  reminder_channel TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK (reminder_channel IN ('SMS', 'WHATSAPP', 'BOTH')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'CANCELLED', 'BOOKED')),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'hi')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_retest_reminders_reg ON retest_reminders(vehicle_registration);
CREATE INDEX IF NOT EXISTS idx_retest_reminders_due ON retest_reminders(due_date);
