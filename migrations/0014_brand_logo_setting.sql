-- ============================================================================
-- Migration 0014: Configurable Brand Logo URL in Business Settings
-- Region: Rewari / Haryana (PESO Hydro Testing Invariants)
-- ============================================================================

ALTER TABLE business_settings ADD COLUMN brand_logo_url TEXT DEFAULT '/images/hsr-gauge-logo.jpg';
