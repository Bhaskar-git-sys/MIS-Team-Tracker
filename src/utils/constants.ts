import type { TaskStatus, PresenceStatus, LeaveStatus, Priority, FixedTaskStatus, FixedTaskPriority } from "../types";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  started: "Started",
  work_in_progress: "Work In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  started: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  work_in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  on_hold: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  break: "On Break",
  lunch: "On Lunch",
  meeting: "In Meeting",
  offline: "Offline",
};

export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  break: "bg-amber-500",
  lunch: "bg-orange-500",
  meeting: "bg-blue-500",
  offline: "bg-slate-400",
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export const TASK_STATUS_OPTIONS: TaskStatus[] = [
  "open",
  "started",
  "work_in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

// ============ FIXED DAILY TASKS ============

export const FDT_STATUS_LABELS: Record<FixedTaskStatus, string> = {
  open: "Open",
  wip: "Work In Progress",
  completed: "Completed",
  hold: "On Hold",
  pending: "Pending",
  cancelled: "Cancelled",
};

export const FDT_STATUS_COLORS: Record<FixedTaskStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  wip: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  hold: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  cancelled: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export const FDT_STATUS_DOT_COLORS: Record<FixedTaskStatus, string> = {
  open: "bg-blue-500",
  wip: "bg-orange-500",
  completed: "bg-green-500",
  hold: "bg-red-500",
  pending: "bg-yellow-500",
  cancelled: "bg-slate-400",
};

export const FDT_STATUS_OPTIONS: FixedTaskStatus[] = [
  "open",
  "wip",
  "completed",
  "hold",
  "pending",
  "cancelled",
];

export const FDT_PRIORITY_LABELS: Record<FixedTaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const FDT_PRIORITY_COLORS: Record<FixedTaskPriority, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
};

export const FDT_PRIORITY_OPTIONS: FixedTaskPriority[] = ["high", "medium", "low"];

export const FDT_SHIFT_OPTIONS: string[] = ["General", "Morning", "Evening", "Night"];

export const FDT_WORKING_TYPE_OPTIONS: string[] = [
  "Manual",
  "Automated",
  "Semi-Automated",
];

export const FDT_TYPE_OPTIONS: string[] = [
  "Report",
  "Download",
  "Data Entry",
  "Reconciliation",
  "Verification",
];

export const EDGE_FUNCTIONS = {
  createEmployee: "create-employee",
  resetPassword: "reset-password",
  generateDailyFixedTasks: "generate-daily-fixed-tasks",
} as const;
