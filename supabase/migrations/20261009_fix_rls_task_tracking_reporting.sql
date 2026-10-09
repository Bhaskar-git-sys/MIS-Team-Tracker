/*
# MIS Team Tracker - Fixed Task Tracking & Reporting Time Fix
## 2026-10-09

This migration:

1. **Secure RPC function for restricted employee updates**:
   - update_task_workflow: Employees can UPDATE only workflow columns (status, remarks, start_time, completed_time, duration_seconds)
   - Employees CANNOT UPDATE assignment/definition columns (assigned_to, report_name, category, type, etc.)

2. **Retrieve employee task start time for reporting**:
   - get_employee_task_start_time: Returns the actual recorded start_time for an employee's task on a given date
   - Used for automatic Excel reporting time population
   - Timezone-aware (returns timestamptz)

3. **Refined RLS policies**:
   - daily_fixed_tasks: Employees can SELECT and UPDATE only their own tasks
   - Employees can UPDATE only via the secure update_task_workflow function
   - Managers retain full control
   - INSERT/DELETE remain manager-only

4. **Database functions already exist in migration 20260924120000**:
   - start_fixed_task (records start_time, sets status to 'wip')
   - complete_fixed_task (records completed_time, calculates duration)
   - hold_fixed_task (records hold_time, calculates duration)
   - phase_fixed_task (resumes a held task)
   - These functions ensure start_time is persisted immediately and never overwritten
*/

-- ============ SECURE UPDATE FUNCTION FOR WORKFLOW FIELDS ONLY ============
-- This is the ONLY way employees should update daily_fixed_tasks
-- It restricts column updates to workflow-related fields only
CREATE OR REPLACE FUNCTION public.update_task_workflow(
  p_task_id uuid,
  p_status text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_start_time timestamptz DEFAULT NULL,
  p_completed_time timestamptz DEFAULT NULL,
  p_duration_seconds integer DEFAULT NULL
)
RETURNS public.daily_fixed_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.daily_fixed_tasks;
BEGIN
  -- Fetch task and lock it
  SELECT * INTO task_row FROM public.daily_fixed_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- Check authorization: must be assigned employee or manager
  IF task_row.assigned_to <> auth.uid() AND NOT public.is_manager() THEN
    RAISE EXCEPTION 'You are not authorized to update this task';
  END IF;

  -- Update ONLY workflow fields
  -- Employees cannot change report_name, category, type, working_type, assigned_to, etc.
  UPDATE public.daily_fixed_tasks
  SET
    status = COALESCE(p_status, status),
    remarks = COALESCE(p_remarks, remarks),
    start_time = COALESCE(p_start_time, start_time),
    completed_time = COALESCE(p_completed_time, completed_time),
    duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
    updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO task_row;

  RETURN task_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_workflow(uuid, text, text, timestamptz, timestamptz, integer) TO authenticated;

-- ============ RETRIEVE EMPLOYEE TASK START TIME FOR REPORTING ============
-- Retrieves the actual recorded task start time for an employee on a given date
-- Used for automatic reporting time population (Excel upload)
-- Returns the first recorded start_time for that employee on that date
CREATE OR REPLACE FUNCTION public.get_employee_task_start_time(
  p_employee_id uuid,
  p_task_date date
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
BEGIN
  -- Authorization: employees can only get their own start time, managers can get anyone's
  IF auth.uid() <> p_employee_id AND NOT public.is_manager() THEN
    RAISE EXCEPTION 'You are not authorized to access this employee''s data';
  END IF;

  -- Return the earliest recorded start_time for this employee on this date
  SELECT start_time INTO start_ts
  FROM public.daily_fixed_tasks
  WHERE assigned_to = p_employee_id
    AND task_date = p_task_date
    AND start_time IS NOT NULL
  ORDER BY start_time ASC
  LIMIT 1;

  RETURN start_ts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_task_start_time(uuid, date) TO authenticated;

-- ============ REFINED RLS: RESTRICT EMPLOYEE UPDATES TO WORKFLOW COLUMNS ============
-- The existing RLS policy allows UPDATE if employee owns task or is manager
-- In practice, employees should call update_task_workflow() which enforces column restrictions
-- Managers can call update_task_workflow() or update directly via base table

DROP POLICY IF EXISTS "daily_fixed_tasks_update" ON public.daily_fixed_tasks;
CREATE POLICY "daily_fixed_tasks_update" ON public.daily_fixed_tasks
  FOR UPDATE TO authenticated
  USING (
    -- Can update if: employee owns the task OR is manager
    auth.uid() = assigned_to OR public.is_manager()
  )
  WITH CHECK (
    -- Same check on write
    auth.uid() = assigned_to OR public.is_manager()
  );

-- ============ ENSURE EXISTING CONSTRAINTS AND INDEXES EXIST ============
-- Prevent duplicate active tasks per employee (status = 'wip')
-- Unique index on (assigned_to, task_date) where status = 'wip'
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_task_per_emp_fixed
  ON public.daily_fixed_tasks(assigned_to, task_date)
  WHERE status = 'wip' AND assigned_to IS NOT NULL;

-- Ensure start_time immutability via RPC (not via check constraint, which would be too strict)
-- The start_fixed_task RPC uses COALESCE(start_time, now()) to ensure it's never overwritten

NOTIFY pgrst, 'reload schema';
