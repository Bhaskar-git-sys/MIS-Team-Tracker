ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave', 'Sick Leave', 'Casual Leave', 'Earned Leave'));

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS date_of_joining date;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS exit_date date;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS reporting_manager text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tenure_days integer DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
ON public.profiles (email)
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id_unique
ON public.profiles (employee_id)
WHERE employee_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';