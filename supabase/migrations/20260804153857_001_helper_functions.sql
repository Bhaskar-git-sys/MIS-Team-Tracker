ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_id text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gender text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id_unique
ON public.profiles (employee_id)
WHERE employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM public.profiles
		WHERE id = auth.uid()
			AND role = 'manager'
	);
$$;

NOTIFY pgrst, 'reload schema';