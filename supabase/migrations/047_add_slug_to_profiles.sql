-- Migration to add human-readable slugs to profiles table
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing profiles with a slugified full_name
UPDATE profiles
SET slug = lower(regexp_replace(unaccent(full_name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Remove trailing/leading dashes if any from the slugification
UPDATE profiles
SET slug = trim(both '-' from slug)
WHERE slug LIKE '-%' OR slug LIKE '%-';

-- Create unique index to ensure slugs are unique
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_unique_idx 
ON profiles (slug) 
WHERE (slug IS NOT NULL);
