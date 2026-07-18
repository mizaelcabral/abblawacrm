-- Allow public read access to active services for booking page
DROP POLICY IF EXISTS "Anyone can select active services" ON services;
CREATE POLICY "Anyone can select active services" ON services
  FOR SELECT USING (is_active = true);

-- Allow public read access to service availability for booking slots calculation
DROP POLICY IF EXISTS "Anyone can select service availability" ON service_availability;
CREATE POLICY "Anyone can select service availability" ON service_availability
  FOR SELECT USING (true);

-- Allow public read access to basic profile fields (name, slug, avatar) for anyone
-- Supabase automatically evaluates policy on SELECT.
DROP POLICY IF EXISTS "Anyone can view basic profile info" ON profiles;
CREATE POLICY "Anyone can view basic profile info" ON profiles
  FOR SELECT USING (true);
