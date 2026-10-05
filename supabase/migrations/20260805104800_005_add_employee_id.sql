ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_id text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS exit_date date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id_unique
ON public.profiles (employee_id)
WHERE employee_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';