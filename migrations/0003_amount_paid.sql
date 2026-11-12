ALTER TABLE bookings
ADD COLUMN amount_paid_paise INTEGER NOT NULL DEFAULT 0
CHECK (amount_paid_paise >= 0 AND amount_paid_paise <= total_price_paise_snapshot);
