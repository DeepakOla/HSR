PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name_en TEXT NOT NULL DEFAULT 'HSR Green Energy',
  business_name_hi TEXT NOT NULL DEFAULT 'एचएसआर ग्रीन एनर्जी',
  city TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  address_line TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  map_url TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  contact_phone TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  whatsapp_number TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  contact_email TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  vpa_id TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  vpa_payee_name TEXT NOT NULL DEFAULT 'SETUP_REQUIRED',
  hold_minutes INTEGER NOT NULL DEFAULT 15 CHECK (hold_minutes BETWEEN 5 AND 120),
  r2_enabled INTEGER NOT NULL DEFAULT 0 CHECK (r2_enabled IN (0,1)),
  evidence_budget_bytes INTEGER NOT NULL DEFAULT 8589934592,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  seo_title_en TEXT NOT NULL DEFAULT 'CNG Cylinder Testing & Retesting Centre in [City]',
  seo_title_hi TEXT NOT NULL DEFAULT '[शहर] में सीएनजी सिलेंडर टेस्टिंग और रिटेस्टिंग केंद्र',
  seo_desc_en TEXT NOT NULL DEFAULT 'Professional CNG cylinder hydro testing and retesting booking. Business details pending owner setup.',
  seo_desc_hi TEXT NOT NULL DEFAULT 'सीएनजी सिलेंडर हाइड्रो टेस्टिंग और रिटेस्टिंग बुकिंग। व्यावसायिक जानकारी मालिक द्वारा सेटअप लंबित।',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO business_settings(id) VALUES(1);

CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'RECEPTIONIST')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS localized_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'hi')),
  page_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(locale, page_key)
);

CREATE TABLE IF NOT EXISTS vehicle_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  cylinder_count INTEGER NOT NULL CHECK (cylinder_count > 0),
  base_price_paise INTEGER NOT NULL CHECK (base_price_paise >= 0),
  gst_rate_bps INTEGER NOT NULL CHECK (gst_rate_bps >= 0),
  advance_paise INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open INTEGER NOT NULL CHECK (is_open IN (0,1)),
  open_time TEXT,
  close_time TEXT,
  break_start TEXT,
  break_end TEXT,
  daily_capacity INTEGER NOT NULL CHECK (daily_capacity >= 0),
  slot_duration_minutes INTEGER NOT NULL CHECK (slot_duration_minutes BETWEEN 30 AND 240),
  config_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(weekday, config_version)
);

CREATE TABLE IF NOT EXISTS slot_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_version INTEGER NOT NULL,
  slot_label_en TEXT NOT NULL,
  slot_label_hi TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_capacity INTEGER NOT NULL CHECK (slot_capacity >= 0),
  sort_order INTEGER NOT NULL,
  UNIQUE(config_version, sort_order)
);

CREATE TABLE IF NOT EXISTS date_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_date TEXT NOT NULL,
  is_closed INTEGER NOT NULL CHECK (is_closed IN (0,1)),
  reason_en TEXT NOT NULL,
  reason_hi TEXT NOT NULL,
  daily_capacity_override INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(service_date)
);

CREATE TABLE IF NOT EXISTS daily_slot_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_date TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  slot_template_id INTEGER NOT NULL REFERENCES slot_templates(id),
  config_version INTEGER NOT NULL,
  slot_label_en TEXT NOT NULL,
  slot_label_hi TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_capacity INTEGER NOT NULL CHECK (slot_capacity >= 0),
  daily_capacity INTEGER NOT NULL CHECK (daily_capacity >= 0),
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0,1)),
  UNIQUE(service_date, slot_template_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile_e164 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mobile_e164)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_normalized TEXT NOT NULL UNIQUE,
  registration_display TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL UNIQUE,
  status_token_hash TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('WEB', 'PHONE', 'WHATSAPP', 'WALKIN')),
  reservation_state TEXT NOT NULL CHECK (reservation_state IN ('HELD', 'PENDING_VERIFICATION', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REJECTED')),
  payment_state TEXT NOT NULL CHECK (payment_state IN ('NOT_REQUIRED', 'ADVANCE_PENDING', 'EVIDENCE_SUBMITTED', 'ADVANCE_VERIFIED', 'PAID_AT_COUNTER', 'REFUNDED')),
  hold_expires_at TEXT,
  service_date TEXT NOT NULL,
  slot_snapshot_id INTEGER NOT NULL REFERENCES daily_slot_snapshots(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  category_id INTEGER NOT NULL REFERENCES vehicle_categories(id),
  category_name_en_snapshot TEXT NOT NULL,
  category_name_hi_snapshot TEXT NOT NULL,
  cylinder_count_snapshot INTEGER NOT NULL,
  base_price_paise_snapshot INTEGER NOT NULL,
  gst_rate_bps_snapshot INTEGER NOT NULL,
  gst_amount_paise_snapshot INTEGER NOT NULL,
  total_price_paise_snapshot INTEGER NOT NULL,
  advance_paise_snapshot INTEGER,
  balance_paise_snapshot INTEGER,
  slot_label_en_snapshot TEXT NOT NULL,
  slot_label_hi_snapshot TEXT NOT NULL,
  slot_start_snapshot TEXT NOT NULL,
  slot_end_snapshot TEXT NOT NULL,
  slot_capacity_snapshot INTEGER NOT NULL,
  daily_capacity_snapshot INTEGER NOT NULL,
  config_version_snapshot INTEGER NOT NULL,
  payment_utr_normalized TEXT,
  payment_submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_utr_unique ON bookings(payment_utr_normalized) WHERE payment_utr_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_service_state ON bookings(service_date, reservation_state);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_state ON bookings(slot_snapshot_id, reservation_state);

CREATE TABLE IF NOT EXISTS payment_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER REFERENCES bookings(id),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  event_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_booking ON booking_audit_events(booking_id, created_at);

CREATE TABLE IF NOT EXISTS cylinder_register (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER REFERENCES bookings(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  cylinder_serial TEXT NOT NULL,
  manufacturer TEXT,
  specification TEXT,
  original_test_date TEXT,
  actual_periodic_test_date TEXT,
  test_pressure_bar TEXT,
  test_result TEXT CHECK (test_result IN ('PASS', 'FAIL', 'REQUIRES_REWORK')),
  certificate_reference TEXT,
  next_retest_due_date TEXT,
  created_by_staff_id INTEGER REFERENCES staff_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_register_vehicle ON cylinder_register(vehicle_id, created_at);

INSERT OR IGNORE INTO vehicle_categories(code, sort_order, name_en, name_hi, cylinder_count, base_price_paise, gst_rate_bps, advance_paise)
VALUES
('CAR_TAXI_1', 1, 'Car/Taxi', 'कार/टैक्सी', 1, 150000, 1800, 50000),
('CAR_LCV_2', 2, 'Twin-cylinder Car/LCV/Tempo', 'डबल-सिलेंडर कार/एलसीवी/टेम्पो', 2, 220000, 1800, 50000),
('HEAVY_TRUCK_4', 3, 'Heavy Commercial Truck', 'हेवी कमर्शियल ट्रक', 4, 440000, 1800, NULL);

-- 0 = Sunday. Seed weekdays open; owner must confirm real working days before go-live.
WITH RECURSIVE wd(n) AS (
  VALUES (0)
  UNION ALL
  SELECT n + 1 FROM wd WHERE n < 6
)
INSERT OR IGNORE INTO weekly_schedule(weekday, is_open, open_time, close_time, break_start, break_end, daily_capacity, slot_duration_minutes, config_version)
SELECT n, CASE WHEN n BETWEEN 1 AND 6 THEN 1 ELSE 0 END, '06:00', '14:00', NULL, NULL, 25, 120, 1 FROM wd;

INSERT OR IGNORE INTO slot_templates(config_version, slot_label_en, slot_label_hi, start_time, end_time, slot_capacity, sort_order)
VALUES
(1, '06:00 - 08:00', '06:00 - 08:00', '06:00', '08:00', 7, 1),
(1, '08:00 - 10:00', '08:00 - 10:00', '08:00', '10:00', 6, 2),
(1, '10:00 - 12:00', '10:00 - 12:00', '10:00', '12:00', 6, 3),
(1, '12:00 - 14:00', '12:00 - 14:00', '12:00', '14:00', 6, 4);

-- Seed 45 days of daily slot snapshots.
WITH RECURSIVE days(d) AS (
  SELECT date('now', '+330 minutes')
  UNION ALL
  SELECT date(d, '+1 day') FROM days WHERE d < date('now', '+330 minutes', '+45 day')
)
INSERT OR IGNORE INTO daily_slot_snapshots(
  service_date,
  weekday,
  slot_template_id,
  config_version,
  slot_label_en,
  slot_label_hi,
  start_time,
  end_time,
  slot_capacity,
  daily_capacity,
  is_closed
)
SELECT
  days.d,
  CAST(strftime('%w', days.d) AS INTEGER),
  st.id,
  st.config_version,
  st.slot_label_en,
  st.slot_label_hi,
  st.start_time,
  st.end_time,
  st.slot_capacity,
  ws.daily_capacity,
  CASE WHEN ws.is_open = 1 THEN 0 ELSE 1 END
FROM days
JOIN slot_templates st ON st.config_version = 1
JOIN weekly_schedule ws ON ws.config_version = 1 AND ws.weekday = CAST(strftime('%w', days.d) AS INTEGER);

INSERT OR IGNORE INTO localized_content(locale, page_key, title, body)
VALUES
('en', 'about', 'About HSR Green Energy', 'SETUP_REQUIRED'),
('hi', 'about', 'एचएसआर ग्रीन एनर्जी के बारे में', 'SETUP_REQUIRED'),
('en', 'services', 'Our Services', 'SETUP_REQUIRED'),
('hi', 'services', 'हमारी सेवाएँ', 'SETUP_REQUIRED'),
('en', 'how-it-works', 'How It Works', 'SETUP_REQUIRED'),
('hi', 'how-it-works', 'यह कैसे काम करता है', 'SETUP_REQUIRED'),
('en', 'contact', 'Contact', 'SETUP_REQUIRED'),
('hi', 'contact', 'संपर्क करें', 'SETUP_REQUIRED');
