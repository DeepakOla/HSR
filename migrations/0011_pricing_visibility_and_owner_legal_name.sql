-- ============================================================================
-- Migration 0011: Pricing Visibility Control and Mandatory RC Owner Legal Name
-- Region: Rewari / Haryana (PESO Hydro Testing Invariants)
-- ============================================================================

-- 1. Control whether pricing is visible upfront or revealed after vehicle details are filled
ALTER TABLE business_settings ADD COLUMN hide_pricing_until_vehicle_details INTEGER NOT NULL DEFAULT 0;

-- 2. Mandatory RC Owner Legal Name for PESO statutory Form C certificate generation
ALTER TABLE bookings ADD COLUMN rc_owner_legal_name TEXT;

-- 3. Extend directory stations with PESO compliance and fleet capability fields
ALTER TABLE directory_stations ADD COLUMN peso_approval_no TEXT;
ALTER TABLE directory_stations ADD COLUMN peso_doc_no TEXT;
ALTER TABLE directory_stations ADD COLUMN landmark TEXT;
ALTER TABLE directory_stations ADD COLUMN pincode TEXT DEFAULT '123401';
ALTER TABLE directory_stations ADD COLUMN car_price_inr INTEGER DEFAULT 1400;
ALTER TABLE directory_stations ADD COLUMN price_transparency_note TEXT DEFAULT 'Certified 300 Bar Hydrostatic Stretch Test + Plate + Certificate included';
ALTER TABLE directory_stations ADD COLUMN median_turnaround_mins INTEGER DEFAULT 120;
ALTER TABLE directory_stations ADD COLUMN accepts_maruti_eeco INTEGER NOT NULL DEFAULT 1;
ALTER TABLE directory_stations ADD COLUMN supports_heavy_trucks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE directory_stations ADD COLUMN booking_mode_summary TEXT DEFAULT 'Online priority slot reservation or counter walk-in';
ALTER TABLE directory_stations ADD COLUMN refund_policy_summary TEXT DEFAULT 'Full slot refund if cancelled 2 hours prior or non-compliant cylinder';
ALTER TABLE directory_stations ADD COLUMN deduplication_and_audit_note TEXT DEFAULT 'PESO Haryana Form GCT verified station with certified water jacket test rig';
ALTER TABLE directory_stations ADD COLUMN license_verification_badge TEXT DEFAULT 'PESO_VERIFIED_ACTIVE_2028';
