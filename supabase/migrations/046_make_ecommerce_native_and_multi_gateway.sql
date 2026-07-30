-- Migration 046: Make E-commerce Native and Multi-Gateway Support
-- Adds active_gateway and gateways_config to woovi_config, updates onboarding_status default to 'approved',
-- and sets up trigger to auto-create woovi_config row when a new account is created.

-- 1. Add active_gateway and gateways_config columns to woovi_config table
ALTER TABLE public.woovi_config 
  ADD COLUMN IF NOT EXISTS active_gateway TEXT NOT NULL DEFAULT 'woovi',
  ADD COLUMN IF NOT EXISTS gateways_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Populate gateways_config with existing app_id/secret_key if set and ensure active_gateway is default
UPDATE public.woovi_config
SET 
  active_gateway = COALESCE(NULLIF(active_gateway, ''), 'woovi'),
  gateways_config = CASE 
    WHEN (app_id IS NOT NULL AND app_id <> '') OR (secret_key IS NOT NULL AND secret_key <> '') THEN
      jsonb_set(
        COALESCE(gateways_config, '{}'::jsonb),
        '{woovi}',
        jsonb_build_object(
          'appId', COALESCE(app_id, ''),
          'secretKey', COALESCE(secret_key, '')
        )
      )
    ELSE COALESCE(gateways_config, '{}'::jsonb)
  END;

-- 3. Update default value of onboarding_status column to 'approved'
ALTER TABLE public.woovi_config 
  ALTER COLUMN onboarding_status SET DEFAULT 'approved'::woovi_onboarding_status;

-- 4. Update all existing rows with onboarding_status 'none' or 'pending_approval' to 'approved'
UPDATE public.woovi_config 
SET onboarding_status = 'approved'::woovi_onboarding_status 
WHERE onboarding_status IN ('none'::woovi_onboarding_status, 'pending_approval'::woovi_onboarding_status);

-- 5. Create function and trigger for automatic creation of default woovi_config on new account creation
CREATE OR REPLACE FUNCTION public.handle_new_account_ecommerce()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.woovi_config (account_id, onboarding_status, active_gateway, gateways_config)
  VALUES (NEW.id, 'approved'::woovi_onboarding_status, 'woovi', '{}'::jsonb)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_account_created_ecommerce ON public.accounts;

CREATE TRIGGER on_account_created_ecommerce
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_account_ecommerce();

-- 6. Backfill existing accounts that don't have a woovi_config row yet
INSERT INTO public.woovi_config (account_id, onboarding_status, active_gateway, gateways_config)
SELECT id, 'approved'::woovi_onboarding_status, 'woovi', '{}'::jsonb
FROM public.accounts
ON CONFLICT (account_id) DO UPDATE SET 
  onboarding_status = 'approved'::woovi_onboarding_status
WHERE public.woovi_config.onboarding_status IN ('none'::woovi_onboarding_status, 'pending_approval'::woovi_onboarding_status);
