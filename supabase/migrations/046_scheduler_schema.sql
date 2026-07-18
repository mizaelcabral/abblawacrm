-- ============================================================
-- SCHEDULER SCHEMA
-- ============================================================

-- SERVICES TABLE
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  price NUMERIC(10, 2) DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_account_id ON services(account_id);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage services for their account" ON services;
CREATE POLICY "Users can manage services for their account"
  ON services FOR ALL
  USING (is_account_member(account_id, 'viewer'))
  WITH CHECK (is_account_member(account_id, 'agent'));


-- SERVICE AVAILABILITY TABLE
CREATE TABLE IF NOT EXISTS service_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_times CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_service_availability_account ON service_availability(account_id);
CREATE INDEX IF NOT EXISTS idx_service_availability_profile ON service_availability(profile_id);

ALTER TABLE service_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage availability for their account" ON service_availability;
CREATE POLICY "Users can manage availability for their account"
  ON service_availability FOR ALL
  USING (is_account_member(account_id, 'viewer'))
  WITH CHECK (is_account_member(account_id, 'agent'));


-- APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_appointment_times CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_appointments_account ON appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_profile ON appointments(profile_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_times ON appointments(start_time, end_time);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage appointments for their account" ON appointments;
CREATE POLICY "Users can manage appointments for their account"
  ON appointments FOR ALL
  USING (is_account_member(account_id, 'viewer'))
  WITH CHECK (is_account_member(account_id, 'agent'));

-- Public/Unauthenticated policy to insert appointments (for client booking page)
DROP POLICY IF EXISTS "Anyone can insert appointments" ON appointments;
CREATE POLICY "Anyone can insert appointments"
  ON appointments FOR INSERT
  WITH CHECK (true);


-- AUTOMATIC UPDATED_AT TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at_services ON services;
CREATE TRIGGER set_updated_at_services BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_service_availability ON service_availability;
CREATE TRIGGER set_updated_at_service_availability BEFORE UPDATE ON service_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_appointments ON appointments;
CREATE TRIGGER set_updated_at_appointments BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
