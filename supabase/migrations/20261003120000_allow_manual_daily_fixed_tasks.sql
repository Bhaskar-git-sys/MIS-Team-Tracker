ALTER TABLE public.daily_fixed_tasks
  ALTER COLUMN master_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';