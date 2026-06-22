-- Alter accounts columns default to set 7 days trial period upon signup
ALTER TABLE accounts ALTER COLUMN subscription_expires_at SET DEFAULT (now() + interval '7 days');
