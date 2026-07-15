-- Migrate legacy 'WhatsApp Contact' name placeholders to phone number
UPDATE contacts
SET name = '+' || phone, updated_at = NOW()
WHERE name = 'WhatsApp Contact';
