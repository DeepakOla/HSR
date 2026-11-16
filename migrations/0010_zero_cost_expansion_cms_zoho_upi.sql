-- ============================================================================
-- Migration 0010: Zero-Cost Expansion - UPI Auto-Reconcile, Zoho Books, CMS & Corridors
-- Region: Gurugram / Pataudi / Rewari Corridor, Haryana, India
-- ============================================================================

-- 1. Floating WhatsApp toggle on business_settings
ALTER TABLE business_settings ADD COLUMN show_floating_whatsapp INTEGER DEFAULT 1;

-- 2. Bank UPI Credits Inbox (For zero-cost auto-reconciliation via inbound bank alert email parser)
CREATE TABLE IF NOT EXISTS bank_upi_credits_inbox (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    utr_number TEXT NOT NULL UNIQUE,          -- 12-digit NPCI UTR e.g. '432109876543'
    amount_paise INTEGER NOT NULL,            -- e.g. 50000 (Rs 500.00)
    sender_vpa TEXT,                          -- e.g. 'customer@okaxis'
    sender_name TEXT,
    reference_id TEXT,                        -- Extracted booking group ref or token e.g. 'HSR-BK-...'
    raw_snippet TEXT,
    status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED', 'RECONCILED', 'IGNORED', 'MANUAL_REVIEW')),
    matched_booking_group_id TEXT REFERENCES booking_groups(id) ON DELETE SET NULL,
    matched_at TEXT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_bank_upi_utr ON bank_upi_credits_inbox(utr_number);
CREATE INDEX IF NOT EXISTS idx_bank_upi_status ON bank_upi_credits_inbox(status);
CREATE INDEX IF NOT EXISTS idx_bank_upi_reference ON bank_upi_credits_inbox(reference_id) WHERE reference_id IS NOT NULL;

-- 3. Zoho Books Free-Plan Sync Ledger (1-Click CSV / Daily Consolidated Voucher & B2B)
CREATE TABLE IF NOT EXISTS zoho_books_sync_ledger (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    entry_date TEXT NOT NULL,                 -- e.g. '2026-11-15'
    entry_type TEXT NOT NULL CHECK (entry_type IN ('B2C_DAILY_CONSOLIDATED', 'B2B_INDIVIDUAL')),
    booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
    booking_group_id TEXT REFERENCES booking_groups(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL UNIQUE,      -- e.g. 'HSR-B2C-20261115' or 'HSR-INV-0012'
    customer_party_name TEXT NOT NULL,
    customer_gstin TEXT,
    taxable_amount_paise INTEGER NOT NULL,
    cgst_paise INTEGER NOT NULL,
    sgst_paise INTEGER NOT NULL,
    total_amount_paise INTEGER NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING', 'EXPORTED_CSV', 'SYNCED_API', 'EXCLUDED')),
    exported_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_zoho_sync_date ON zoho_books_sync_ledger(entry_date);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_status ON zoho_books_sync_ledger(sync_status);

-- 4. Pre-Launch Waitlist & Expiry Leads (Rule 35 Retest Calculator + Rs 200 Voucher)
CREATE TABLE IF NOT EXISTS prelaunch_waitlist_leads (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    vehicle_registration TEXT NOT NULL,
    display_reg_no TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    vehicle_category TEXT NOT NULL DEFAULT 'CAR',
    last_tested_date TEXT,
    calculated_expiry_date TEXT NOT NULL,
    days_until_expiry INTEGER NOT NULL,
    voucher_code TEXT NOT NULL UNIQUE,        -- e.g. 'HSR200-9876'
    voucher_discount_paise INTEGER NOT NULL DEFAULT 20000, -- Rs 200 flat discount
    voucher_claimed INTEGER NOT NULL DEFAULT 0 CHECK (voucher_claimed IN (0, 1)),
    corridor TEXT DEFAULT 'Gurugram-Rewari',
    source TEXT NOT NULL DEFAULT 'EXPIRY_CALCULATOR',
    ip_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_reg ON prelaunch_waitlist_leads(vehicle_registration);
CREATE INDEX IF NOT EXISTS idx_waitlist_phone ON prelaunch_waitlist_leads(contact_phone);
CREATE INDEX IF NOT EXISTS idx_waitlist_voucher ON prelaunch_waitlist_leads(voucher_code);

-- 5. Corridor Stations Directory (Edge-Cached Multi-Station Pinning)
CREATE TABLE IF NOT EXISTS directory_stations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    slug TEXT NOT NULL UNIQUE,
    station_name TEXT NOT NULL,
    corridor_slug TEXT NOT NULL,              -- e.g. 'gurugram-rewari', 'delhi-jaipur'
    corridor_name TEXT NOT NULL,              -- e.g. 'Gurugram - Pataudi - Rewari Expressway'
    is_hsr_flagship INTEGER NOT NULL DEFAULT 0 CHECK (is_hsr_flagship IN (0, 1)),
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT,
    google_maps_url TEXT,
    lat REAL,
    lng REAL,
    rating REAL DEFAULT 4.9,
    hydro_testing_available INTEGER NOT NULL DEFAULT 1,
    turnaround_hours TEXT DEFAULT '2 Hours',
    price_starts_inr INTEGER DEFAULT 2500,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_directory_corridor ON directory_stations(corridor_slug);

-- 6. CMS Posts & Video Guides (Zero-Cost Media Vault with R2 Keys & Instagram Hooks)
CREATE TABLE IF NOT EXISTS cms_posts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    slug TEXT NOT NULL UNIQUE,
    title_en TEXT NOT NULL,
    title_hi TEXT NOT NULL,
    summary_en TEXT,
    summary_hi TEXT,
    content_markdown_en TEXT NOT NULL,
    content_markdown_hi TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'SAFETY_GUIDE' CHECK (category IN ('SAFETY_GUIDE', 'NEWS_ANNOUNCEMENT', 'VIDEO_TUTORIAL', 'COMMERCIAL_FLEET')),
    cover_image_r2_key TEXT,
    video_url TEXT,
    is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
    instagram_media_id TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    author_name TEXT DEFAULT 'HSR Technical Team',
    published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_category ON cms_posts(category);
CREATE INDEX IF NOT EXISTS idx_cms_published ON cms_posts(is_published, published_at DESC);
