-- Migration 0006: Flat advance per booking and initial defaults
ALTER TABLE business_settings ADD COLUMN flat_advance_paise INTEGER NOT NULL DEFAULT 50000;

-- Set default business name to HSR if still unset, empty, SETUP_REQUIRED, or initial placeholder
UPDATE business_settings 
SET business_name_en = 'HSR', business_name_hi = 'एचएसआर'
WHERE business_name_en IS NULL 
   OR business_name_en = '' 
   OR business_name_en = 'SETUP_REQUIRED' 
   OR business_name_en = 'HSR Green Energy';

-- Set default city to Rewari if still unset, empty, or SETUP_REQUIRED
UPDATE business_settings 
SET city = 'Rewari'
WHERE city IS NULL 
   OR city = '' 
   OR city = 'SETUP_REQUIRED';

-- Set default contact phone and WhatsApp to +919910055355 if still unset, empty, or SETUP_REQUIRED
UPDATE business_settings 
SET contact_phone = '+919910055355', whatsapp_number = '+919910055355'
WHERE contact_phone IS NULL 
   OR contact_phone = '' 
   OR contact_phone = 'SETUP_REQUIRED';

-- Ensure Owner user exists in staff_users for Cloudflare Access email
INSERT INTO staff_users (email, role, is_active)
VALUES ('kumardeepakola@gmail.com', 'OWNER', 1)
ON CONFLICT(email) DO UPDATE SET role = 'OWNER', is_active = 1;
