CREATE TABLE IF NOT EXISTS public.boss_ai_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  error_message text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  status text NOT NULL DEFAULT 'Detected' CHECK (status IN ('Detected', 'Analyzing', 'Fixing', 'Testing', 'Fixed', 'Verification Failed', 'Rolled Back', 'Needs Developer')),
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  route text,
  component text,
  stack_trace text,
  root_cause text,
  proposed_fix text,
  validation_result text,
  verification_result text,
  files_changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  migration_changed text,
  repair_duration_ms integer,
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boss_ai_incidents_status ON public.boss_ai_incidents(status);
CREATE INDEX IF NOT EXISTS idx_boss_ai_incidents_last_seen ON public.boss_ai_incidents(last_seen DESC);
ALTER TABLE public.boss_ai_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boss_ai_incidents_select" ON public.boss_ai_incidents;
CREATE POLICY "boss_ai_incidents_select" ON public.boss_ai_incidents
  FOR SELECT TO authenticated USING (public.is_manager());

CREATE TABLE IF NOT EXISTS public.boss_ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  auto_fix_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.boss_ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boss_ai_settings_manager" ON public.boss_ai_settings;
CREATE POLICY "boss_ai_settings_manager" ON public.boss_ai_settings
  FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());
INSERT INTO public.boss_ai_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_boss_ai_incident(
  p_fingerprint text,
  p_error_message text,
  p_severity text DEFAULT 'error',
  p_route text DEFAULT NULL,
  p_component text DEFAULT NULL,
  p_stack_trace text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE incident_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(coalesce(p_fingerprint, '')) = 0 OR length(coalesce(p_error_message, '')) = 0 THEN
    RAISE EXCEPTION 'Incident fingerprint and message are required';
  END IF;
  INSERT INTO public.boss_ai_incidents (fingerprint, error_message, severity, route, component, stack_trace, created_by)
  VALUES (left(p_fingerprint, 160), left(p_error_message, 2000),
    CASE WHEN p_severity IN ('info', 'warning', 'error', 'critical') THEN p_severity ELSE 'error' END,
    left(p_route, 500), left(p_component, 500), left(p_stack_trace, 8000), auth.uid())
  ON CONFLICT (fingerprint) DO UPDATE SET
    occurrence_count = public.boss_ai_incidents.occurrence_count + 1,
    last_seen = now(),
    error_message = excluded.error_message,
    stack_trace = excluded.stack_trace,
    route = excluded.route,
    component = excluded.component,
    updated_at = now()
  RETURNING id INTO incident_id;
  RETURN incident_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.boss_ai_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  RETURN jsonb_build_object(
    'database', 'ok',
    'incident_store', 'ok',
    'task_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'start_fixed_task'),
    'checked_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_boss_ai_incident(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_ai_health_check() TO authenticated;
NOTIFY pgrst, 'reload schema';