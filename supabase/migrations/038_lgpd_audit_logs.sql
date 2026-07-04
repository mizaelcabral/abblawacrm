-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_account_id ON public.audit_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
DROP POLICY IF EXISTS "Users can view own account audit logs" ON public.audit_logs;
CREATE POLICY "Users can view own account audit logs" ON public.audit_logs
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "System/Users can insert audit logs" ON public.audit_logs;
CREATE POLICY "System/Users can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- Create audit log trigger function for contacts table
CREATE OR REPLACE FUNCTION public.log_contact_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id UUID;
  current_user_email TEXT;
  act TEXT;
  tid UUID;
  acc_id UUID;
  det JSONB;
BEGIN
  -- Get user ID from session/context
  current_user_id := auth.uid();
  
  -- Get user email if user is logged in
  IF current_user_id IS NOT NULL THEN
    SELECT email INTO current_user_email FROM auth.users WHERE id = current_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    act := 'contact.create';
    tid := NEW.id;
    acc_id := NEW.account_id;
    det := jsonb_build_object('name', NEW.name, 'phone', NEW.phone, 'email', NEW.email);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if actual contact data changed (skip logging updates that don't affect personal info)
    IF OLD.name IS DISTINCT FROM NEW.name OR OLD.phone IS DISTINCT FROM NEW.phone OR OLD.email IS DISTINCT FROM NEW.email OR OLD.company IS DISTINCT FROM NEW.company THEN
      act := 'contact.update';
      tid := NEW.id;
      acc_id := NEW.account_id;
      det := jsonb_build_object(
        'old', jsonb_build_object('name', OLD.name, 'phone', OLD.phone, 'email', OLD.email, 'company', OLD.company),
        'new', jsonb_build_object('name', NEW.name, 'phone', NEW.phone, 'email', NEW.email, 'company', NEW.company)
      );
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    act := 'contact.delete';
    tid := OLD.id;
    acc_id := OLD.account_id;
    det := jsonb_build_object('name', OLD.name, 'phone', OLD.phone, 'email', OLD.email);
  END IF;

  IF acc_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (account_id, user_id, user_email, action, target_type, target_id, details)
    VALUES (acc_id, current_user_id, current_user_email, act, 'contacts', tid, det);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trigger_log_contact_change ON public.contacts;
CREATE TRIGGER trigger_log_contact_change
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_change();
