CREATE TABLE IF NOT EXISTS public.password_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_created
  ON public.password_reset_otps(user_id, created_at DESC);

ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = 'vinodh'
      AND role = 'manager'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = 'vinod'
  )
  THEN
    UPDATE public.profiles
    SET username = 'vinod',
        updated_at = now()
    WHERE lower(username) = 'vinodh'
      AND role = 'manager';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';