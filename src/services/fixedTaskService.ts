import { supabase } from "./supabaseClient";
import type {
  FixedTaskMaster,
  DailyFixedTask,
  FixedTaskStatus,
  FixedTaskPriority,
} from "../types";

export async function generateTodayTasks(date?: string): Promise<{ tasks_created: number; error: string | null }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-daily-fixed-tasks${date ? `?date=${date}` : ""}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { tasks_created: 0, error: data.error || "Failed to generate tasks" };
    return { tasks_created: data.tasks_created ?? 0, error: null };
  } catch (error) {
    return {
      tasks_created: 0,
      error: error instanceof DOMException && error.name === "AbortError"
        ? "Task generation timed out"
        : error instanceof Error
          ? error.message
          : "Failed to generate tasks",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getFixedTaskMasters(): Promise<FixedTaskMaster[]> {
  const { data, error } = await supabase
    .from("fixed_task_master")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as FixedTaskMaster[];
}

export async function createFixedTaskMaster(
  payload: Omit<FixedTaskMaster, "id" | "created_by" | "created_at" | "updated_at">
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("fixed_task_master").insert(payload);
  return { error: error?.message ?? null };
}

export async function updateFixedTaskMaster(
  id: string,
  payload: Partial<Omit<FixedTaskMaster, "id" | "created_by" | "created_at" | "updated_at">>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("fixed_task_master")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteFixedTaskMaster(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("fixed_task_master").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function getTodayFixedTasks(userId: string, date?: string): Promise<DailyFixedTask[]> {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("daily_fixed_tasks")
    .select("*")
    .eq("assigned_to", userId)
    .eq("task_date", targetDate)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as DailyFixedTask[];
}

export async function getAllDailyFixedTasks(date?: string): Promise<DailyFixedTask[]> {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("daily_fixed_tasks")
    .select("*")
    .eq("task_date", targetDate)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as DailyFixedTask[];
}

/**
 * Start a fixed task using secure RPC function
 * This records start_time and sets status to 'wip'
 * The start_time is persisted immediately in the database
 */
export async function startTask(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("start_fixed_task", { p_task_id: id });
  return { error: error?.message ?? null };
}

/**
 * Complete a fixed task using secure RPC function
 * This records completed_time, calculates duration, and sets status to 'completed'
 */
export async function completeTask(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("complete_fixed_task", { p_task_id: id });
  return { error: error?.message ?? null };
}

/**
 * Hold a fixed task using secure RPC function
 * This records hold_time, calculates duration, and sets status to 'hold'
 */
export async function holdTask(id: string, remarks: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("hold_fixed_task", {
    p_task_id: id,
    p_remarks: remarks,
  });
  return { error: error?.message ?? null };
}

/**
 * Resume a held fixed task using secure RPC function
 * This records resume_time and sets status back to 'wip'
 */
export async function phaseTask(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("phase_fixed_task", { p_task_id: id });
  return { error: error?.message ?? null };
}

/**
 * Compute the live working duration for a task that is currently active
 * Adds accumulated duration_seconds to time elapsed since active_started_at
 * NOTE: This is calculated locally for UI display; actual duration is persisted in DB on task completion
 */
export function computeTaskDurationSeconds(task: DailyFixedTask): number {
  const accumulated = task.duration_seconds || 0;
  if (task.status === "wip" && task.active_started_at) {
    return accumulated + Math.max(0, Math.floor((Date.now() - new Date(task.active_started_at).getTime()) / 1000));
  }
  return accumulated;
}

/**
 * Retrieve the employee's actual task start time for a given date
 * Used for automatic reporting time population (Excel upload)
 * Returns the timestamp when the employee first clicked Start Task
 * Timezone-aware: uses database function that returns timestamptz
 */
export async function getEmployeeTaskStartTimeForReporting(
  employeeId: string,
  taskDate: string
): Promise<{ startTime: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("get_employee_task_start_time", {
      p_employee_id: employeeId,
      p_task_date: taskDate,
    });

    if (error) {
      console.error("Error fetching employee task start time:", error);
      return { startTime: null, error: error.message };
    }

    return { startTime: data as string | null, error: null };
  } catch (err) {
    console.error("Exception fetching employee task start time:", err);
    return {
      startTime: null,
      error: err instanceof Error ? err.message : "Failed to fetch start time",
    };
  }
}

export type { FixedTaskStatus, FixedTaskPriority };
