-- Keep open live-status pages synchronized when presence rows change.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;