-- Add consent columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN privacy_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN terms_accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN privacy_accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN consent_version TEXT;

-- Update trigger function to copy consent data from metadata on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    full_name,
    email,
    terms_accepted,
    privacy_accepted,
    terms_accepted_at,
    privacy_accepted_at,
    consent_version
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, FALSE),
    COALESCE((NEW.raw_user_meta_data->>'privacy_accepted')::boolean, FALSE),
    CASE 
      WHEN NEW.raw_user_meta_data->>'terms_accepted_at' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'terms_accepted_at')::timestamptz 
      ELSE NULL 
    END,
    CASE 
      WHEN NEW.raw_user_meta_data->>'privacy_accepted_at' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'privacy_accepted_at')::timestamptz 
      ELSE NULL 
    END,
    NEW.raw_user_meta_data->>'consent_version'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
