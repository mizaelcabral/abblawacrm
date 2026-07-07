-- Add markup columns to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS woovi_markup_fixed NUMERIC(10, 2) DEFAULT 0.50;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS woovi_markup_percent NUMERIC(10, 2) DEFAULT 1.00;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS woovi_markup_pix_key TEXT;
