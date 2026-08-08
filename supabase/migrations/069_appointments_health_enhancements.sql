-- Migration 069: Appointments & Health/Services Enhancements
-- Support for Availability Exceptions, Physical & Online Services, Branding Toggles, Anamnesis and Reminder Flags

-- 1. Create availability_exceptions table for blocking specific dates (vacation, holidays, day-off)
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    reason TEXT,
    is_blocked BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(profile_id, exception_date)
);

-- Enable RLS on availability_exceptions
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;

-- Policies for availability_exceptions
CREATE POLICY "Users can manage their own availability exceptions"
    ON public.availability_exceptions
    FOR ALL
    USING (auth.uid() = profile_id)
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public read access to availability exceptions"
    ON public.availability_exceptions
    FOR SELECT
    USING (true);

-- 2. Add health/services & branding fields to services table
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS location_type VARCHAR(20) DEFAULT 'online', -- 'online', 'presencial', 'ambos'
    ADD COLUMN IF NOT EXISTS online_meeting_url TEXT,
    ADD COLUMN IF NOT EXISTS physical_address TEXT,
    ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_name TEXT,
    ADD COLUMN IF NOT EXISTS provider_avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS show_provider_avatar BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS clinic_name TEXT,
    ADD COLUMN IF NOT EXISTS clinic_logo_url TEXT,
    ADD COLUMN IF NOT EXISTS show_clinic_logo BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS custom_questions JSONB DEFAULT '[]'::jsonb;

-- 3. Add meeting link, address, anamnesis, and reminder flags to appointments table
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS meeting_url TEXT,
    ADD COLUMN IF NOT EXISTS location_address TEXT,
    ADD COLUMN IF NOT EXISTS anamnesis_answers JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS confirmed_by_lead BOOLEAN DEFAULT false;
