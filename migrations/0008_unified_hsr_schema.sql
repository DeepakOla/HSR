-- ============================================================================
-- HSR GREEN ENERGY — UNIFIED CLOUDFLARE D1 DATABASE SCHEMA (PHASE 1 / MIGRATION 0008)
-- Region: Gurugram / Pataudi / Rewari Corridor, Haryana, India
-- Architecture: Single Modular Monolith (Customer, Staff/Testing, Admin Panels)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. IDENTITY, SHARED PHONES, VEHICLES & AGENCIES
-- Solves shared household mobile numbers, relative bookings, and fleet custody
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contact_phones (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    phone_e164 TEXT NOT NULL UNIQUE, -- Normalized e.g. '+919876543210'
    display_phone TEXT NOT NULL,     -- e.g. '9876543210'
    is_whatsapp_opted_in INTEGER NOT NULL DEFAULT 1 CHECK (is_whatsapp_opted_in IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_phones_display ON contact_phones(display_phone);

CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    party_type TEXT NOT NULL DEFAULT 'INDIVIDUAL' CHECK (party_type IN ('INDIVIDUAL', 'AGENCY_FLEET')),
    full_name TEXT NOT NULL,
    email TEXT,
    gstin TEXT,
    business_address TEXT,
    is_credit_approved INTEGER NOT NULL DEFAULT 0 CHECK (is_credit_approved IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_parties_email ON parties(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parties_gstin ON parties(gstin) WHERE gstin IS NOT NULL;

CREATE TABLE IF NOT EXISTS party_phones (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    phone_id TEXT NOT NULL REFERENCES contact_phones(id) ON DELETE CASCADE,
    relationship_label TEXT NOT NULL DEFAULT 'SELF' CHECK (
        relationship_label IN ('SELF', 'FAMILY_SHARED', 'RELATIVE_BOOKER', 'FLEET_SUPERVISOR', 'DRIVER')
    ),
    is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(party_id, phone_id)
);

CREATE INDEX IF NOT EXISTS idx_party_phones_phone ON party_phones(phone_id);
CREATE INDEX IF NOT EXISTS idx_party_phones_party ON party_phones(party_id);

-- Extend vehicles with normalized columns and fleet custody attributes
ALTER TABLE vehicles ADD COLUMN normalized_reg_no TEXT;
ALTER TABLE vehicles ADD COLUMN display_reg_no TEXT;
ALTER TABLE vehicles ADD COLUMN vehicle_category TEXT DEFAULT 'CAR' CHECK (vehicle_category IN ('CAR', 'TEMPO_LCV', 'TRUCK_BUS'));
ALTER TABLE vehicles ADD COLUMN make_model TEXT;
ALTER TABLE vehicles ADD COLUMN default_cylinder_count INTEGER DEFAULT 1 CHECK (default_cylinder_count >= 1 AND default_cylinder_count <= 24);
ALTER TABLE vehicles ADD COLUMN owner_party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE vehicles ADD COLUMN agency_party_id TEXT REFERENCES parties(id) ON DELETE SET NULL;
ALTER TABLE vehicles ADD COLUMN last_test_date TEXT;
ALTER TABLE vehicles ADD COLUMN next_test_due_date TEXT;
ALTER TABLE vehicles ADD COLUMN is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE vehicles ADD COLUMN updated_at TEXT;

-- Synchronize legacy registration columns into unified columns
UPDATE vehicles 
SET normalized_reg_no = registration_normalized,
    display_reg_no = registration_display,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE normalized_reg_no IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_party_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_agency ON vehicles(agency_party_id) WHERE agency_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_due_date ON vehicles(next_test_due_date) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS party_vehicle_access (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL,
    access_role TEXT NOT NULL DEFAULT 'OWNER' CHECK (access_role IN ('OWNER', 'CUSTODIAN', 'AGENCY')),
    can_view_history INTEGER NOT NULL DEFAULT 1 CHECK (can_view_history IN (0, 1)),
    granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(party_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_party_vehicle_access_party ON party_vehicle_access(party_id);

CREATE TABLE IF NOT EXISTS cylinders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    vehicle_id TEXT,
    serial_number TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    country_of_origin TEXT NOT NULL DEFAULT 'INDIA',
    manufacturing_date TEXT,                -- 'YYYY-MM' or 'YYYY-MM-DD'
    water_capacity_liters REAL CHECK (water_capacity_liters IS NULL OR water_capacity_liters > 0),
    original_tare_weight_kg REAL CHECK (original_tare_weight_kg IS NULL OR original_tare_weight_kg > 0),
    test_pressure_bar REAL NOT NULL DEFAULT 300.0 CHECK (test_pressure_bar > 0),
    design_min_wall_thickness_mm REAL CHECK (design_min_wall_thickness_mm IS NULL OR design_min_wall_thickness_mm > 0),
    peso_filling_permission_no TEXT,
    current_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (current_status IN ('ACTIVE', 'CONDEMNED', 'DETACHED')),
    last_tested_at TEXT,
    next_retest_due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(manufacturer, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_cylinders_vehicle ON cylinders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_cylinders_serial ON cylinders(serial_number COLLATE NOCASE);

-- ----------------------------------------------------------------------------
-- 2. STAFF USERS, AUTHENTICATION & SESSIONS
-- ----------------------------------------------------------------------------

ALTER TABLE staff_users ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE staff_users ADD COLUMN username_or_email TEXT;
ALTER TABLE staff_users ADD COLUMN phone_e164 TEXT NOT NULL DEFAULT '';
ALTER TABLE staff_users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE staff_users ADD COLUMN staff_role TEXT CHECK (staff_role IS NULL OR staff_role IN ('ADMIN_OWNER', 'RECEPTIONIST', 'TECHNICIAN'));
ALTER TABLE staff_users ADD COLUMN can_verify_payments INTEGER NOT NULL DEFAULT 0 CHECK (can_verify_payments IN (0, 1));
ALTER TABLE staff_users ADD COLUMN can_override_pricing INTEGER NOT NULL DEFAULT 0 CHECK (can_override_pricing IN (0, 1));
ALTER TABLE staff_users ADD COLUMN last_login_at TEXT;
ALTER TABLE staff_users ADD COLUMN updated_at TEXT;

UPDATE staff_users
SET username_or_email = email,
    full_name = COALESCE(full_name, email),
    staff_role = CASE WHEN role = 'OWNER' THEN 'ADMIN_OWNER' ELSE 'RECEPTIONIST' END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE username_or_email IS NULL;

CREATE TABLE IF NOT EXISTS auth_challenges (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    target_channel TEXT NOT NULL CHECK (target_channel IN ('SMS_OTP', 'WHATSAPP_OTP', 'EMAIL_MAGIC_LINK')),
    identifier TEXT NOT NULL,               -- Phone E.164 or lowercase Email
    code_hash TEXT NOT NULL,                -- SHA-256 hash of 6-digit OTP
    magic_token_hash TEXT,                  -- SHA-256 hash of URL magic token (for Email)
    vehicle_reg_context TEXT,               -- Optional normalized vehicle plate
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_lookup ON auth_challenges(identifier, target_channel, expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_token_hash TEXT NOT NULL UNIQUE,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER', 'STAFF', 'ADMIN')),
    party_id TEXT REFERENCES parties(id) ON DELETE CASCADE,
    phone_id TEXT REFERENCES contact_phones(id) ON DELETE CASCADE,
    staff_user_id TEXT REFERENCES staff_users(id) ON DELETE CASCADE,
    role_scope TEXT NOT NULL CHECK (role_scope IN ('CUSTOMER', 'RECEPTIONIST', 'TECHNICIAN', 'ADMIN_OWNER')),
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(session_token_hash) WHERE revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. STATION CONFIGURATION, SHIFTS, BAYS & CAPACITY ALLOCATION
-- Zero hardcoded equipment counts; controlled via OwnerSettings
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS station_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value_json TEXT NOT NULL,
    description TEXT,
    updated_by_staff_id TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS shift_windows (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    shift_code TEXT NOT NULL UNIQUE,        -- e.g. 'MORNING', 'AFTERNOON'
    shift_name TEXT NOT NULL,               -- e.g. 'Morning Shift (08:30 AM - 01:00 PM)'
    start_time TEXT NOT NULL,               -- 'HH:MM' 24-hour format
    end_time TEXT NOT NULL,                 -- 'HH:MM' 24-hour format
    slot_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_interval_minutes >= 10),
    max_consecutive_cylinders_per_slot INTEGER NOT NULL DEFAULT 2 CHECK (max_consecutive_cylinders_per_slot >= 1),
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS station_resources (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    resource_code TEXT NOT NULL UNIQUE,     -- e.g. 'BAY_1', 'BAY_2', 'BAY_3_HEAVY', 'RIG_A'
    resource_name TEXT NOT NULL,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('VEHICLE_BAY', 'HYDRO_RIG', 'INSPECTION_BENCH')),
    supported_categories_json TEXT NOT NULL DEFAULT '["CAR","TEMPO_LCV","TRUCK_BUS"]',
    status TEXT NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OCCUPIED', 'MAINTENANCE', 'CALIBRATION_DUE')),
    current_booking_id TEXT,                -- Populated when status = 'OCCUPIED'
    calibration_cert_no TEXT,
    calibration_valid_until TEXT,           -- 'YYYY-MM-DD'
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS slot_capacity_allocations (
    slot_date TEXT NOT NULL,                -- 'YYYY-MM-DD'
    slot_time TEXT NOT NULL,                -- 'HH:MM'
    shift_window_id TEXT NOT NULL REFERENCES shift_windows(id) ON DELETE RESTRICT,
    max_cylinders INTEGER NOT NULL CHECK (max_cylinders >= 0),
    allocated_cylinders INTEGER NOT NULL DEFAULT 0 CHECK (allocated_cylinders >= 0 AND allocated_cylinders <= max_cylinders),
    is_manually_blocked INTEGER NOT NULL DEFAULT 0 CHECK (is_manually_blocked IN (0, 1)),
    block_reason TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (slot_date, slot_time)
);

CREATE INDEX IF NOT EXISTS idx_slot_allocations_date ON slot_capacity_allocations(slot_date, is_manually_blocked);

-- ----------------------------------------------------------------------------
-- 4. BOOKING GROUPS & INDIVIDUAL VEHICLE BOOKINGS
-- Unifies Web, Customer Panel, Phone, WhatsApp, Walk-In, and Fleet Batches
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS booking_groups (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    group_reference TEXT NOT NULL UNIQUE,   -- e.g. 'HSR-20261114-4821'
    idempotency_key TEXT UNIQUE,            -- Prevents duplicate double-tap submissions
    booker_party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    booker_phone_id TEXT NOT NULL REFERENCES contact_phones(id) ON DELETE RESTRICT,
    agency_party_id TEXT REFERENCES parties(id) ON DELETE SET NULL,
    source_channel TEXT NOT NULL CHECK (
        source_channel IN ('WEB_PUBLIC', 'CUSTOMER_PORTAL', 'RECEPTION_PHONE', 'WHATSAPP', 'WALK_IN')
    ),
    is_batch_booking INTEGER NOT NULL DEFAULT 0 CHECK (is_batch_booking IN (0, 1)),
    arrival_mode TEXT NOT NULL DEFAULT 'SINGLE' CHECK (arrival_mode IN ('SINGLE', 'ALL_AT_ONCE', 'STAGGERED')),
    require_gst_invoice INTEGER NOT NULL DEFAULT 0 CHECK (require_gst_invoice IN (0, 1)),
    gstin_snapshot TEXT,
    business_name_snapshot TEXT,
    total_vehicles INTEGER NOT NULL DEFAULT 1 CHECK (total_vehicles >= 1),
    total_cylinders INTEGER NOT NULL DEFAULT 1 CHECK (total_cylinders >= 1),
    subtotal_paise INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    gst_paise INTEGER NOT NULL DEFAULT 0 CHECK (gst_paise >= 0),
    total_payable_paise INTEGER NOT NULL DEFAULT 0 CHECK (total_payable_paise >= 0),
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (
        payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'VERIFICATION_PENDING', 'PAID', 'CREDIT_APPROVED', 'REFUNDED')
    ),
    created_by_staff_id TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_booking_groups_booker ON booking_groups(booker_party_id);
CREATE INDEX IF NOT EXISTS idx_booking_groups_agency ON booking_groups(agency_party_id) WHERE agency_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_groups_payment ON booking_groups(payment_status);

-- Extend existing bookings table with unified blueprint columns
ALTER TABLE bookings ADD COLUMN booking_group_id TEXT REFERENCES booking_groups(id) ON DELETE CASCADE;
ALTER TABLE bookings ADD COLUMN booking_token TEXT;
ALTER TABLE bookings ADD COLUMN rc_owner_party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD COLUMN rc_owner_name_snapshot TEXT;
ALTER TABLE bookings ADD COLUMN driver_name TEXT;
ALTER TABLE bookings ADD COLUMN driver_phone TEXT;
ALTER TABLE bookings ADD COLUMN slot_date TEXT;
ALTER TABLE bookings ADD COLUMN slot_start_time TEXT;
ALTER TABLE bookings ADD COLUMN allocated_slots_json TEXT;
ALTER TABLE bookings ADD COLUMN consecutive_slots_occupied INTEGER DEFAULT 1 CHECK (consecutive_slots_occupied >= 1);
ALTER TABLE bookings ADD COLUMN booked_cylinder_count INTEGER;
ALTER TABLE bookings ADD COLUMN verified_cylinder_count INTEGER;
ALTER TABLE bookings ADD COLUMN unit_price_paise INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN line_total_paise INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN booking_status TEXT DEFAULT 'CONFIRMED' CHECK (
    booking_status IN ('HOLD', 'CONFIRMED', 'RESCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED_HOLD', 'NO_SHOW')
);
ALTER TABLE bookings ADD COLUMN testing_status TEXT DEFAULT 'NOT_ARRIVED' CHECK (
    testing_status IN (
        'NOT_ARRIVED',
        'AT_GATE_QUEUE',
        'IN_BAY_INTAKE',
        'INSPECTION_AND_PREP',
        'HYDRO_TESTING',
        'PASS_CERT_PENDING',
        'FAIL_CONDEMNED',
        'CERTIFIED_READY',
        'RELEASED'
    )
);
ALTER TABLE bookings ADD COLUMN assigned_bay_id TEXT REFERENCES station_resources(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN checked_in_at TEXT;
ALTER TABLE bookings ADD COLUMN bay_assigned_at TEXT;
ALTER TABLE bookings ADD COLUMN testing_started_at TEXT;
ALTER TABLE bookings ADD COLUMN testing_completed_at TEXT;
ALTER TABLE bookings ADD COLUMN released_at TEXT;
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN notes TEXT;

-- Synchronize legacy booking tokens and dates
UPDATE bookings
SET booking_token = booking_code,
    slot_date = service_date,
    slot_start_time = slot_start_snapshot,
    booked_cylinder_count = cylinder_count_snapshot,
    unit_price_paise = base_price_paise_snapshot,
    line_total_paise = total_price_paise_snapshot,
    rc_owner_name_snapshot = (SELECT name FROM customers WHERE customers.id = bookings.customer_id)
WHERE booking_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(slot_date, booking_status, testing_status);
CREATE INDEX IF NOT EXISTS idx_bookings_group ON bookings(booking_group_id);
CREATE INDEX IF NOT EXISTS idx_bookings_token ON bookings(booking_token);

-- ----------------------------------------------------------------------------
-- 5. CYLINDER INSPECTION, HYDRO TESTING RECORDS, PAYMENTS & DOCUMENTS
-- Enforces statutory PESO Gas Cylinders Rules 2016 / IS 8451 data integrity
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cylinder_test_records (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_id TEXT NOT NULL,
    cylinder_id TEXT NOT NULL REFERENCES cylinders(id) ON DELETE RESTRICT,
    hydro_rig_id TEXT REFERENCES station_resources(id) ON DELETE SET NULL,
    tested_by_staff_id TEXT NOT NULL,
    approved_by_staff_id TEXT,
    visual_check TEXT NOT NULL CHECK (visual_check IN ('SATISFACTORY', 'UNSATISFACTORY')),
    thread_check TEXT NOT NULL CHECK (thread_check IN ('SATISFACTORY', 'UNSATISFACTORY')),
    internal_check TEXT NOT NULL CHECK (internal_check IN ('SATISFACTORY', 'UNSATISFACTORY')),
    valve_check TEXT NOT NULL CHECK (valve_check IN ('SATISFACTORY', 'UNSATISFACTORY')),
    observed_weight_kg REAL NOT NULL CHECK (observed_weight_kg > 0),
    weight_loss_pct REAL NOT NULL CHECK (weight_loss_pct >= 0),
    min_wall_thickness_mm REAL NOT NULL CHECK (min_wall_thickness_mm > 0),
    max_wall_thickness_mm REAL NOT NULL CHECK (max_wall_thickness_mm >= min_wall_thickness_mm),
    base_thickness_mm REAL NOT NULL CHECK (base_thickness_mm > 0),
    applied_test_pressure_bar REAL NOT NULL CHECK (applied_test_pressure_bar > 0),
    total_expansion_cc REAL NOT NULL CHECK (total_expansion_cc > 0),
    permanent_expansion_cc REAL NOT NULL CHECK (permanent_expansion_cc >= 0 AND permanent_expansion_cc <= total_expansion_cc),
    permanent_expansion_pct REAL NOT NULL CHECK (permanent_expansion_pct >= 0),
    internal_drying_done INTEGER NOT NULL DEFAULT 0 CHECK (internal_drying_done IN (0, 1)),
    neck_stamping_done INTEGER NOT NULL DEFAULT 0 CHECK (neck_stamping_done IN (0, 1)),
    test_outcome TEXT NOT NULL CHECK (
        (test_outcome = 'PASS'
            AND visual_check = 'SATISFACTORY'
            AND thread_check = 'SATISFACTORY'
            AND internal_check = 'SATISFACTORY'
            AND valve_check = 'SATISFACTORY'
            AND weight_loss_pct <= 5.0
            AND permanent_expansion_pct <= 10.0)
        OR (test_outcome = 'FAIL_CONDEMNED')
    ),
    failure_reason TEXT,
    peso_certificate_number TEXT,
    retest_due_date TEXT,                   -- 'YYYY-MM-DD' (+3 years if PASS, NULL if FAIL_CONDEMNED)
    tested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(booking_id, cylinder_id)
);

CREATE INDEX IF NOT EXISTS idx_test_records_booking ON cylinder_test_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_test_records_cylinder ON cylinder_test_records(cylinder_id);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
    booking_id TEXT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('UPI_QR', 'CASH', 'BANK_TRANSFER', 'ONLINE_GATEWAY')),
    utr_or_reference TEXT UNIQUE,           -- 12-digit UPI UTR or bank ref; UNIQUE prevents double-claiming
    payment_state TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (
        payment_state IN ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REFUNDED')
    ),
    submitted_by_party_id TEXT REFERENCES parties(id) ON DELETE SET NULL,
    recorded_by_staff_id TEXT,
    verified_by_staff_id TEXT,
    notes TEXT,
    paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_group ON payments(booking_group_id);
CREATE INDEX IF NOT EXISTS idx_payments_state ON payments(payment_state, paid_at);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_id TEXT NOT NULL,
    cylinder_test_record_id TEXT REFERENCES cylinder_test_records(id) ON DELETE SET NULL,
    doc_type TEXT NOT NULL CHECK (
        doc_type IN ('NECK_MARKING_PHOTO', 'PESO_CERTIFICATE_PDF', 'CONDEMNATION_CERT_PDF', 'TAX_INVOICE_PDF')
    ),
    r2_object_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER,
    uploaded_by_staff_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_booking ON documents(booking_id, doc_type);

-- ----------------------------------------------------------------------------
-- 6. REMINDERS & IMMUTABLE AUDIT LOGS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reminder_schedules (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    vehicle_id TEXT NOT NULL,
    party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    phone_id TEXT NOT NULL REFERENCES contact_phones(id) ON DELETE CASCADE,
    booking_id TEXT,
    reminder_type TEXT NOT NULL CHECK (
        reminder_type IN (
            'BOOKING_CONFIRMATION',
            'DAY_BEFORE_SLOT',
            'DELAY_NOTICE',
            'CERT_READY',
            'DUE_IN_30_DAYS',
            'DUE_IN_7_DAYS'
        )
    ),
    scheduled_for TEXT NOT NULL,            -- ISO timestamp
    channel TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP', 'SMS', 'EMAIL')),
    template_payload_json TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (
        delivery_status IN ('QUEUED', 'SENT', 'FAILED', 'CANCELLED')
    ),
    provider_message_id TEXT,
    error_message TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reminders_queue ON reminder_schedules(delivery_status, scheduled_for) WHERE delivery_status = 'QUEUED';

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER', 'STAFF', 'ADMIN', 'SYSTEM_CRON')),
    actor_id TEXT NOT NULL,
    action_name TEXT NOT NULL,              -- e.g. 'BOOKING_CREATED', 'PAYMENT_VERIFIED', 'PRICE_UPDATED'
    entity_table TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_table, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. INITIAL SEED DATA (HARYANA REGION CONFIGURATION — NO HARDCODED BENGALURU)
-- Editable dynamically via Admin Panel (/admin/pricing-shifts & /admin/bays-equipment)
-- ----------------------------------------------------------------------------

INSERT OR IGNORE INTO station_settings (setting_key, setting_value_json, description) VALUES
(
    'station_profile',
    '{"legalName":"HSR Green Energy – CNG Testing Division","brandName":"HSR Green Energy","region":"Gurugram / Pataudi / Rewari Region, Haryana","stateCode":"HR","pesoLicenseNo":"PENDING_OWNER_CONFIRMATION","gstin":"PENDING_OWNER_CONFIRMATION","supportPhone":"+919876543210","whatsappPhone":"+919876543210","googleMapsUrl":""}',
    'Core station identity and Haryana regulatory identifiers'
),
(
    'pricing_matrix',
    '{"currency":"INR","gstRatePct":18,"pricesIncludeGst":true,"categoryDefaults":{"CAR":{"defaultCylinders":1,"firstCylinderPaise":140000,"additionalCylinderPaise":100000},"TEMPO_LCV":{"defaultCylinders":2,"firstCylinderPaise":140000,"additionalCylinderPaise":100000},"TRUCK_BUS":{"defaultCylinders":4,"firstCylinderPaise":140000,"additionalCylinderPaise":100000}},"fleetBulkDiscount":{"minCylinders":8,"discountPct":10}}',
    'Per-cylinder pricing rules and default cylinder counts by vehicle category'
),
(
    'booking_rules',
    '{"holdExpiryMinutes":15,"advanceBookingDays":15,"minLeadTimeMinutes":60,"maxSelfServeCylinders":12,"allowPayAtStation":true,"rescheduleCutoffMinutes":60}',
    'Operational rules for slot reservation, holds, and self-serve batch caps'
);

INSERT OR IGNORE INTO shift_windows (id, shift_code, shift_name, start_time, end_time, slot_interval_minutes, max_consecutive_cylinders_per_slot, display_order, is_active) VALUES
('shift-morning-01', 'MORNING', 'Morning Shift (08:30 AM – 01:00 PM)', '08:30', '13:00', 30, 2, 1, 1),
('shift-afternoon-02', 'AFTERNOON', 'Afternoon Shift (01:30 PM – 05:30 PM)', '13:30', '17:30', 30, 2, 2, 1);

INSERT OR IGNORE INTO station_resources (id, resource_code, resource_name, resource_type, supported_categories_json, status, is_active) VALUES
('res-bay-01', 'BAY_1', 'Vehicle Bay 1 (Car / LCV)', 'VEHICLE_BAY', '["CAR","TEMPO_LCV"]', 'ONLINE', 1),
('res-bay-02', 'BAY_2', 'Vehicle Bay 2 (Car / LCV)', 'VEHICLE_BAY', '["CAR","TEMPO_LCV"]', 'ONLINE', 1),
('res-bay-03', 'BAY_3_HEAVY', 'Vehicle Bay 3 (Heavy Truck / Bus / Cascade)', 'VEHICLE_BAY', '["CAR","TEMPO_LCV","TRUCK_BUS"]', 'ONLINE', 1),
('res-rig-a', 'RIG_A', 'Hydrostatic Water-Jacket Rig A', 'HYDRO_RIG', '["CAR","TEMPO_LCV","TRUCK_BUS"]', 'ONLINE', 1),
('res-rig-b', 'RIG_B', 'Hydrostatic Water-Jacket Rig B', 'HYDRO_RIG', '["CAR","TEMPO_LCV","TRUCK_BUS"]', 'ONLINE', 1);
