/*
# Attendance, Tasks, Task Templates, Activities, Leaves tables
*/

-- ============ ATTENDANCE ============
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_in_at timestamptz,
  check_out_at timestamptz,
  break_start_at timestamptz,
  break_end_at timestamptz,
  lunch_start_at timestamptz,
  lunch_end_at timestamptz,
  working_seconds integer DEFAULT 0,
  break_seconds integer DEFAULT 0,
  lunch_seconds integer DEFAULT 0,
  overtime_seconds integer DEFAULT 0,
  late_login boolean DEFAULT false,
  status text DEFAULT 'present' CHECK (status IN ('present', 'absent', 'leave', 'incomplete')),
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, attendance_date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
CREATE POLICY "attendance_select" ON public.attendance
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
CREATE POLICY "attendance_insert" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_update" ON public.attendance
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager())
  WITH CHECK (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "attendance_delete" ON public.attendance;
CREATE POLICY "attendance_delete" ON public.attendance
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'started', 'work_in_progress', 'on_hold', 'completed', 'cancelled')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (auth.uid() = assigned_to OR public.is_manager());

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager() OR auth.uid() = assigned_to);

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR public.is_manager())
  WITH CHECK (true);

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ TASK TEMPLATES ============
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  manager_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week integer CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month integer CHECK (day_of_month >= 1 AND day_of_month <= 31),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_templates_select" ON public.task_templates;
CREATE POLICY "task_templates_select" ON public.task_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "task_templates_insert" ON public.task_templates;
CREATE POLICY "task_templates_insert" ON public.task_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "task_templates_update" ON public.task_templates;
CREATE POLICY "task_templates_update" ON public.task_templates
  FOR UPDATE TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "task_templates_delete" ON public.task_templates;
CREATE POLICY "task_templates_delete" ON public.task_templates
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ ACTIVITIES ============
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_select" ON public.activities;
CREATE POLICY "activities_select" ON public.activities
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "activities_insert" ON public.activities;
CREATE POLICY "activities_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "activities_delete" ON public.activities;
CREATE POLICY "activities_delete" ON public.activities
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ LEAVES ============
CREATE TABLE IF NOT EXISTS public.leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaves_select" ON public.leaves;
CREATE POLICY "leaves_select" ON public.leaves
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "leaves_insert" ON public.leaves;
CREATE POLICY "leaves_insert" ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "leaves_update" ON public.leaves;
CREATE POLICY "leaves_update" ON public.leaves
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager())
  WITH CHECK (true);

DROP POLICY IF EXISTS "leaves_delete" ON public.leaves;
CREATE POLICY "leaves_delete" ON public.leaves
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON public.attendance(user_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_activities_user ON public.activities(user_id, created_at);
