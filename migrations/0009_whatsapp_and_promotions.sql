-- ============================================================================
-- Migration 0009: WhatsApp Dispatch Configuration, Promotions, and Auto-apply Offers
-- ============================================================================

ALTER TABLE business_settings ADD COLUMN whatsapp_mode TEXT DEFAULT 'STANDARD';
ALTER TABLE business_settings ADD COLUMN whatsapp_api_key TEXT;
ALTER TABLE business_settings ADD COLUMN whatsapp_phone_number_id TEXT;
ALTER TABLE business_settings ADD COLUMN whatsapp_template_name TEXT;
ALTER TABLE business_settings ADD COLUMN promo_code TEXT;
ALTER TABLE business_settings ADD COLUMN promo_discount_type TEXT DEFAULT 'FLAT';
ALTER TABLE business_settings ADD COLUMN promo_discount_value INTEGER DEFAULT 0;
ALTER TABLE business_settings ADD COLUMN promo_banner_text TEXT;
ALTER TABLE business_settings ADD COLUMN promo_banner_active INTEGER DEFAULT 1;
ALTER TABLE business_settings ADD COLUMN promo_auto_apply INTEGER DEFAULT 1;
