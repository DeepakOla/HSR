-- ============================================================================
-- Migration 0013: SEO Audit Tracker, Social Media Handles & Customer Loyalty Voucher
-- Region: Rewari / Haryana (PESO Hydro Testing Invariants)
-- ============================================================================

-- 1. Extend business_settings with social media handles and voucher configuration
ALTER TABLE business_settings ADD COLUMN social_facebook TEXT DEFAULT 'https://facebook.com/hsrgreenenergy';
ALTER TABLE business_settings ADD COLUMN social_instagram TEXT DEFAULT 'https://instagram.com/hsrgreenenergy';
ALTER TABLE business_settings ADD COLUMN social_youtube TEXT DEFAULT 'https://youtube.com/@hsrgreenenergy';
ALTER TABLE business_settings ADD COLUMN social_twitter TEXT DEFAULT 'https://twitter.com/hsrgreenenergy';
ALTER TABLE business_settings ADD COLUMN show_social_media INTEGER DEFAULT 1;
ALTER TABLE business_settings ADD COLUMN voucher_amount_paise INTEGER DEFAULT 20000;
ALTER TABLE business_settings ADD COLUMN voucher_enabled INTEGER DEFAULT 1;

-- 2. SEO Audit Log & Diagnostic Tracker Table
CREATE TABLE IF NOT EXISTS seo_audits (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    page_url TEXT NOT NULL,
    audit_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    score INTEGER NOT NULL DEFAULT 98,
    issues_count INTEGER NOT NULL DEFAULT 0,
    findings_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_audits_page ON seo_audits(page_url);
CREATE INDEX IF NOT EXISTS idx_seo_audits_date ON seo_audits(audit_date);

-- Seed initial baseline SEO audit records
INSERT INTO seo_audits (id, page_url, audit_date, score, issues_count, summary, findings_json)
VALUES 
(
    'audit-cng-001',
    '/cng/cylinder-test/',
    datetime('now'),
    98,
    1,
    'High-converting landing page with complete Schema.org JSON-LD LocalBusiness & FAQPage markup, verified OpenGraph, and mobile-responsive viewport.',
    '[{"id":"issue-1","severity":"LOW","rule":"IMAGE_ALT_METRIC","issue":"Verify high-DPI diagram alt attributes for screen readers","recommendation":"Ensure all technical water jacket diagrams retain descriptive alt text","status":"RESOLVED","type":"AUTOMATED","resolved_at":"2026-11-15T12:00:00Z"}]'
),
(
    'audit-home-001',
    '/en/',
    datetime('now'),
    100,
    0,
    'Clean canonical tags, bilingual hreflang alternates (en/hi), valid robots.txt directives, and zero broken internal anchors.',
    '[]'
);

-- 3. Customer Due Date Assistance Requests (Option B Fallback & ₹200 Voucher Vault)
CREATE TABLE IF NOT EXISTS due_date_assistance_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    vehicle_registration TEXT NOT NULL,
    display_reg_no TEXT NOT NULL,
    mobile TEXT,
    email TEXT,
    cylinder_info TEXT,
    voucher_code TEXT NOT NULL,
    voucher_discount_paise INTEGER NOT NULL DEFAULT 20000,
    status TEXT NOT NULL DEFAULT 'PENDING_ASSISTANCE' CHECK (status IN ('PENDING_ASSISTANCE', 'CONTACTED', 'RESOLVED', 'BOOKED')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_assistance_reg ON due_date_assistance_requests(vehicle_registration);
CREATE INDEX IF NOT EXISTS idx_assistance_voucher ON due_date_assistance_requests(voucher_code);
