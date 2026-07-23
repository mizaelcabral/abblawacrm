-- Fix handle_new_user trigger to bootstrap both accounts and profiles with required fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- 1. Create a personal account for the new user
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  -- 2. Create the user's profile linked to their account
  INSERT INTO public.profiles (
    user_id,
    full_name,
    email,
    account_id,
    account_role,
    terms_accepted,
    privacy_accepted,
    terms_accepted_at,
    privacy_accepted_at,
    consent_version
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_account_id,
    'owner',
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
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
