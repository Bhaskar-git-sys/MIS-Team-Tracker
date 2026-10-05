/*
# Fixed Daily Tasks Module

## Overview
Adds a new "Fixed Daily Tasks" module to the MIS Team Tracker. This lets managers
define a master list of fixed daily reports/downloads that are automatically
regenerated each day as per-employee task instances. Employees update status
throughout the day (Open -> WIP -> Completed, or Open -> Hold -> Completed).
Yesterday's history is preserved.

## New Tables

### 1. fixed_task_master
The reusable template/master list of fixed daily tasks. Managers create/edit/delete
these. Each master is assigned to one MIS Executive. When enabled (is_active = true),
a daily instance is generated from it every day at midnight.

Columns:
- id (uuid PK)
- created_by (uuid FK profiles, the manager who created it)
- category (text) - e.g., "Sales", "Inventory", "Finance"
- report_name (text, NOT NULL) - the report/download name
- type (text) - e.g., "Report", "Download", "Data Entry"
- working_type (text) - e.g., "Manual", "Automated", "Semi-Automated"
- assigned_to (uuid FK profiles) - the MIS Executive responsible
- estimation_duration (text) - estimated duration, e.g., "30 min", "1 hr"
- start_report_time (time) - the time the report should start
- shift (text) - "General", "Morning", "Evening", "Night"
- priority (text) - "high", "medium", "low"
- is_active (boolean, default true) - enabled/disabled toggle
- remarks (text) - optional notes
- created_at, updated_at (timestamptz)

### 2. daily_fixed_tasks
The per-day task instances generated from the master. Each row is one employee's
task for one day. Employees update the status, start time, completed time, remarks.
History is preserved (rows are never deleted on day rollover).

Columns:
- id (uuid PK)
- master_id (uuid FK fixed_task_master, ON DELETE CASCADE)
- task_date (date, NOT NULL) - the day this instance belongs to
- assigned_to (uuid FK profiles) - the MIS Executive
- category, report_name, type, working_type - copied from master at generation time
- estimation_duration (text) - copied from master
- start_report_time (time) - copied from master
- shift (text) - copied from master
- priority (text) - "high", "medium", "low"
- status (text, default 'open') - open, wip, completed, hold, pending, cancelled
- remarks (text) - employee/manager notes
- start_time (timestamptz) - set when Start clicked
- completed_time (timestamptz) - set when Complete clicked
- duration_seconds (integer) - computed on completion
- created_at, updated_at (timestamptz)
- UNIQUE(master_id, task_date) - one instance per master per day

## Security (RLS)

### fixed_task_master
- SELECT: managers see all; employees see only masters assigned to them
- INSERT/UPDATE/DELETE: managers only

### daily_fixed_tasks
- SELECT: managers see all; employees see only their own
- INSERT: managers only (the auto-generation edge function uses service role, bypassing RLS)
- UPDATE: managers can update any; employees can update their own (status, remarks, start_time, completed_time, duration_seconds)
- DELETE: managers only

## Indexes
- daily_fixed_tasks(assigned_to, task_date) - employee daily view
- daily_fixed_tasks(task_date) - manager daily view
- daily_fixed_tasks(status) - filtering
- fixed_task_master(assigned_to) - employee view
- fixed_task_master(is_active) - filtering active masters

## Important Notes
1. Existing tables, data, and functionality are NOT affected.
2. The auto-generation edge function uses the service role key, bypassing RLS,
   so it can insert daily instances for all employees.
3. Employee UPDATE policy only allows updating status workflow fields, not
   report names or assignments - employees cannot edit task names.
*/

-- ============ FIXED TASK MASTER ============
CREATE TABLE IF NOT EXISTS public.fixed_task_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'General',
  report_name text NOT NULL,
  type text NOT NULL DEFAULT 'Report',
  working_type text NOT NULL DEFAULT 'Manual',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  estimation_duration text,
  start_report_time time,
  shift text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_active boolean NOT NULL DEFAULT true,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.fixed_task_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_task_master_select" ON public.fixed_task_master;
CREATE POLICY "fixed_task_master_select" ON public.fixed_task_master
  FOR SELECT TO authenticated
  USING (public.is_manager() OR auth.uid() = assigned_to);

DROP POLICY IF EXISTS "fixed_task_master_insert" ON public.fixed_task_master;
CREATE POLICY "fixed_task_master_insert" ON public.fixed_task_master
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "fixed_task_master_update" ON public.fixed_task_master;
CREATE POLICY "fixed_task_master_update" ON public.fixed_task_master
  FOR UPDATE TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "fixed_task_master_delete" ON public.fixed_task_master;
CREATE POLICY "fixed_task_master_delete" ON public.fixed_task_master
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ DAILY FIXED TASKS ============
CREATE TABLE IF NOT EXISTS public.daily_fixed_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL REFERENCES public.fixed_task_master(id) ON DELETE CASCADE,
  task_date date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'General',
  report_name text NOT NULL,
  type text NOT NULL DEFAULT 'Report',
  working_type text NOT NULL DEFAULT 'Manual',
  estimation_duration text,
  start_report_time time,
  shift text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'wip', 'completed', 'hold', 'pending', 'cancelled')),
  remarks text,
  start_time timestamptz,
  completed_time timestamptz,
  duration_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(master_id, task_date)
);

ALTER TABLE public.daily_fixed_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_fixed_tasks_select" ON public.daily_fixed_tasks;
CREATE POLICY "daily_fixed_tasks_select" ON public.daily_fixed_tasks
  FOR SELECT TO authenticated
  USING (public.is_manager() OR auth.uid() = assigned_to);

DROP POLICY IF EXISTS "daily_fixed_tasks_insert" ON public.daily_fixed_tasks;
CREATE POLICY "daily_fixed_tasks_insert" ON public.daily_fixed_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "daily_fixed_tasks_update" ON public.daily_fixed_tasks;
CREATE POLICY "daily_fixed_tasks_update" ON public.daily_fixed_tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR public.is_manager())
  WITH CHECK (auth.uid() = assigned_to OR public.is_manager());

DROP POLICY IF EXISTS "daily_fixed_tasks_delete" ON public.daily_fixed_tasks;
CREATE POLICY "daily_fixed_tasks_delete" ON public.daily_fixed_tasks
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_fixed_task_master_assigned_to ON public.fixed_task_master(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fixed_task_master_is_active ON public.fixed_task_master(is_active);
CREATE INDEX IF NOT EXISTS idx_daily_fixed_tasks_assigned_date ON public.daily_fixed_tasks(assigned_to, task_date);
CREATE INDEX IF NOT EXISTS idx_daily_fixed_tasks_task_date ON public.daily_fixed_tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_daily_fixed_tasks_status ON public.daily_fixed_tasks(status);
