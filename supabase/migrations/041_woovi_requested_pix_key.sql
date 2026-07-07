-- Add requested_pix_key to woovi_config table
ALTER TABLE woovi_config ADD COLUMN IF NOT EXISTS requested_pix_key TEXT;
