ALTER TABLE public.daily_fixed_tasks
  ADD COLUMN IF NOT EXISTS active_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_time timestamptz,
  ADD COLUMN IF NOT EXISTS resume_time timestamptz;

CREATE TABLE IF NOT EXISTS public.daily_fixed_task_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.daily_fixed_tasks(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  ended_reason text CHECK (ended_reason IN ('hold', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_task_session
  ON public.daily_fixed_task_sessions(task_id)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_task_per_employee
  ON public.daily_fixed_tasks(assigned_to)
  WHERE status = 'wip' AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_sessions_task
  ON public.daily_fixed_task_sessions(task_id, started_at);

ALTER TABLE public.daily_fixed_task_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_sessions_select" ON public.daily_fixed_task_sessions;
CREATE POLICY "task_sessions_select" ON public.daily_fixed_task_sessions
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_manager());

DROP POLICY IF EXISTS "daily_fixed_tasks_update" ON public.daily_fixed_tasks;
CREATE POLICY "daily_fixed_tasks_update" ON public.daily_fixed_tasks
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE OR REPLACE FUNCTION public.start_fixed_task(p_task_id uuid)
RETURNS public.daily_fixed_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.daily_fixed_tasks;
  session_employee uuid;
BEGIN
  SELECT * INTO task_row
  FROM public.daily_fixed_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF task_row.assigned_to <> auth.uid() AND NOT public.is_manager() THEN
    RAISE EXCEPTION 'You are not authorized to start this task';
  END IF;
  IF task_row.status NOT IN ('open', 'pending') THEN
    RAISE EXCEPTION 'Only an open task can be started';
  END IF;

  SELECT assigned_to INTO session_employee
  FROM public.daily_fixed_tasks
  WHERE assigned_to = task_row.assigned_to
    AND status = 'wip'
    AND id <> p_task_id
  LIMIT 1;
  IF session_employee IS NOT NULL THEN
    RAISE EXCEPTION 'Finish or pause the employee''s active task first';
  END IF;

  INSERT INTO public.daily_fixed_task_sessions (task_id, employee_id, started_at)
  VALUES (p_task_id, task_row.assigned_to, now());

  UPDATE public.daily_fixed_tasks
  SET status = 'wip',
      start_time = COALESCE(start_time, now()),
      active_started_at = now(),
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO task_row;
  RETURN task_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_fixed_task(p_task_id uuid, p_remarks text DEFAULT NULL)
RETURNS public.daily_fixed_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.daily_fixed_tasks;
  session_row public.daily_fixed_task_sessions;
  worked_seconds integer;
BEGIN
  SELECT * INTO task_row FROM public.daily_fixed_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF task_row.assigned_to <> auth.uid() AND NOT public.is_manager() THEN RAISE EXCEPTION 'You are not authorized to hold this task'; END IF;
  IF task_row.status <> 'wip' THEN RAISE EXCEPTION 'Only an active task can be paused'; END IF;

  UPDATE public.daily_fixed_task_sessions
  SET ended_at = now(),
      duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - started_at)))::integer),
      ended_reason = 'hold'
  WHERE task_id = p_task_id AND ended_at IS NULL
  RETURNING * INTO session_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active work session exists'; END IF;
  worked_seconds := session_row.duration_seconds;

  UPDATE public.daily_fixed_tasks
  SET status = 'hold',
      hold_time = now(),
      active_started_at = NULL,
      duration_seconds = COALESCE(duration_seconds, 0) + worked_seconds,
      remarks = COALESCE(p_remarks, remarks),
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO task_row;
  RETURN task_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase_fixed_task(p_task_id uuid)
RETURNS public.daily_fixed_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.daily_fixed_tasks;
  session_employee uuid;
BEGIN
  SELECT * INTO task_row FROM public.daily_fixed_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF task_row.assigned_to <> auth.uid() AND NOT public.is_manager() THEN RAISE EXCEPTION 'You are not authorized to resume this task'; END IF;
  IF task_row.status <> 'hold' THEN RAISE EXCEPTION 'Only a paused task can be resumed'; END IF;

  SELECT assigned_to INTO session_employee
  FROM public.daily_fixed_tasks
  WHERE assigned_to = task_row.assigned_to AND status = 'wip' AND id <> p_task_id
  LIMIT 1;
  IF session_employee IS NOT NULL THEN RAISE EXCEPTION 'Finish or pause the employee''s active task first'; END IF;

  INSERT INTO public.daily_fixed_task_sessions (task_id, employee_id, started_at)
  VALUES (p_task_id, task_row.assigned_to, now());

  UPDATE public.daily_fixed_tasks
  SET status = 'wip', resume_time = now(), active_started_at = now(), updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO task_row;
  RETURN task_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_fixed_task(p_task_id uuid)
RETURNS public.daily_fixed_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.daily_fixed_tasks;
  session_row public.daily_fixed_task_sessions;
BEGIN
  SELECT * INTO task_row FROM public.daily_fixed_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF task_row.assigned_to <> auth.uid() AND NOT public.is_manager() THEN RAISE EXCEPTION 'You are not authorized to complete this task'; END IF;
  IF task_row.status <> 'wip' THEN RAISE EXCEPTION 'Only an active task can be completed'; END IF;

  UPDATE public.daily_fixed_task_sessions
  SET ended_at = now(),
      duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - started_at)))::integer),
      ended_reason = 'completed'
  WHERE task_id = p_task_id AND ended_at IS NULL
  RETURNING * INTO session_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active work session exists'; END IF;

  UPDATE public.daily_fixed_tasks
  SET status = 'completed',
      completed_time = now(),
      active_started_at = NULL,
      duration_seconds = COALESCE(duration_seconds, 0) + session_row.duration_seconds,
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO task_row;
  RETURN task_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_fixed_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_fixed_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase_fixed_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_fixed_task(uuid) TO authenticated;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

DROP POLICY IF EXISTS "files_select" ON public.files;
CREATE POLICY "files_select" ON public.files
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR public.is_manager())
    AND (expires_at IS NULL OR expires_at > now())
    AND expired_at IS NULL
  );

NOTIFY pgrst, 'reload schema';

UPDATE storage.buckets SET public = false WHERE id = 'uploads';

DROP POLICY IF EXISTS "uploads_read" ON storage.objects;
CREATE POLICY "uploads_auth_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads_manager_delete" ON storage.objects;
CREATE POLICY "uploads_manager_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND public.is_manager());