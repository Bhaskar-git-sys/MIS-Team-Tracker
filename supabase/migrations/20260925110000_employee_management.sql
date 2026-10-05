-- Employee management hardening.
-- All columns are additive so existing profiles and auth users remain intact.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_joining date,
  ADD COLUMN IF NOT EXISTS exit_date date,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS department text DEFAULT 'MIS',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_username_unique
  ON public.profiles (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_email_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.deactivate_expired_employees()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET status = 'Inactive', updated_at = now()
  WHERE role = 'mis_employee'
    AND exit_date IS NOT NULL
    AND exit_date <= CURRENT_DATE
    AND status <> 'Inactive';
$$;

-- Keep the database authoritative even when the web app is not open.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deactivate-expired-employees') THEN
      PERFORM cron.unschedule('deactivate-expired-employees');
    END IF;
    PERFORM cron.schedule('deactivate-expired-employees', '5 0 * * *', 'SELECT public.deactivate_expired_employees()');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron is unavailable; call public.deactivate_expired_employees() from a scheduled job instead.';
  END;
END $$;

SELECT public.deactivate_expired_employees();
NOTIFY pgrst, 'reload schema';
