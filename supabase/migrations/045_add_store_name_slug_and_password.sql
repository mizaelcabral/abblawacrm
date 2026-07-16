-- Migration to add store name, slug, and password fields to woovi_config

ALTER TABLE woovi_config
ADD COLUMN IF NOT EXISTS store_name TEXT,
ADD COLUMN IF NOT EXISTS store_slug TEXT,
ADD COLUMN IF NOT EXISTS password_protected BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS store_password TEXT;

-- Create partial unique index on store_slug
CREATE UNIQUE INDEX IF NOT EXISTS woovi_config_store_slug_unique_idx 
ON woovi_config (store_slug) 
WHERE (store_slug IS NOT NULL);
