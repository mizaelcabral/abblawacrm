-- Migration 029: Super Admin role validation and constraints
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS check_profile_role,
  ADD CONSTRAINT check_profile_role CHECK (role IN ('user', 'super_admin'));

-- Set default role to 'user' if not specified
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'user';

-- Promote the initial main account to super_admin
UPDATE profiles 
SET role = 'super_admin' 
WHERE email = 'affilushub@gmail.com';
