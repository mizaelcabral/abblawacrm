-- Migration to add payment_required column to services table
ALTER TABLE services
ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT false;
