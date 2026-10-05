export type UserRole = "manager" | "mis_employee";

export type EmployeeStatus =
  | "Active"
  | "Inactive"
  | "On Leave"
  | "Sick Leave"
  | "Casual Leave"
  | "Earned Leave";

export type TaskStatus =
  | "open"
  | "started"
  | "work_in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export type AttendanceStatus = "present" | "absent" | "leave" | "incomplete";

export type PresenceStatus = "online" | "break" | "lunch" | "meeting" | "offline";

export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveType = "casual" | "sick" | "earned" | "unpaid";

export type NotificationType =
  | "info"
  | "task"
  | "leave"
  | "meeting"
  | "chat"
  | "system";

export type Priority = "low" | "medium" | "high" | "urgent";

export type MeetingStatus = "active" | "ended";

export type SignalType =
  | "offer"
  | "answer"
  | "ice-candidate"
  | "join"
  | "leave"
  | "hand-raise"
  | "hand-lower";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  gender: string | null;
  position: string | null;
  department: string | null;
  date_of_joining: string | null;
  exit_date?: string | null;
  status: EmployeeStatus | string | null;
  reporting_manager: string | null;
  tenure_days: number | null;
  avatar_url: string | null;
  employee_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  user_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  break_start_at: string | null;
  break_end_at: string | null;
  lunch_start_at: string | null;
  lunch_end_at: string | null;
  working_seconds: number;
  break_seconds: number;
  lunch_seconds: number;
  overtime_seconds: number;
  late_login: boolean;
  status: AttendanceStatus;
  attendance_date: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  manager_id: string;
  day_of_week: number | null;
  day_of_month: number | null;
  priority: Priority;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Leave {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  room_id: string;
  title: string;
  started_by: string;
  status: MeetingStatus;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface MeetingSignal {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string | null;
  signal_type: SignalType;
  signal_data: Record<string, unknown>;
  created_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  hand_raised: boolean;
  is_muted: boolean;
  is_video_on: boolean;
}

export interface ChatGroup {
  id: string;
  name: string;
  created_by: string;
  is_general: boolean;
  created_at: string;
}

export interface ChatGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  group_id: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  storage_path?: string | null;
  expires_at?: string | null;
  expired_at?: string | null;
  created_at: string;
}

export interface Presence {
  id: string;
  user_id: string;
  status: PresenceStatus;
  last_seen: string;
  current_task: string | null;
  updated_at: string;
}

// ============ FIXED DAILY TASKS ============

export type FixedTaskStatus = "open" | "wip" | "completed" | "hold" | "pending" | "cancelled";

export type FixedTaskPriority = "high" | "medium" | "low";

export type Shift = "General";

export interface FixedTaskMaster {
  id: string;
  created_by: string;
  category: string;
  report_name: string;
  type: string;
  working_type: string;
  assigned_to: string | null;
  estimation_duration: string | null;
  start_report_time: string | null;
  shift: string;
  priority: FixedTaskPriority;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyFixedTask {
  id: string;
  master_id: string;
  task_date: string;
  assigned_to: string | null;
  category: string;
  report_name: string;
  type: string;
  working_type: string;
  estimation_duration: string | null;
  start_report_time: string | null;
  shift: string;
  priority: FixedTaskPriority;
  status: FixedTaskStatus;
  remarks: string | null;
  start_time: string | null;
  completed_time: string | null;
  duration_seconds: number;
  active_started_at?: string | null;
  hold_time?: string | null;
  resume_time?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatConversation {
  id: string;
  type: "private" | "group";
  name: string;
  avatar_url?: string | null;
  user_id?: string;
  group_id?: string;
  last_message?: string | null;
  last_message_time?: string | null;
  unread_count?: number;
}
