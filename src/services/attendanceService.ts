import { supabase } from "../services/supabaseClient";
import type { Attendance, AttendanceStatus } from "../types";
import { secondsBetween, isLateLogin } from "../utils/helpers";

export async function getTodayAttendance(userId: string): Promise<Attendance | null> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .eq("attendance_date", today)
    .maybeSingle();

  if (error) {
    console.error("getTodayAttendance error:", error);
    return null;
  }
  return data as Attendance | null;
}

export async function checkIn(userId: string): Promise<Attendance | null> {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split("T")[0];
  const late = isLateLogin(now);

  const existing = await getTodayAttendance(userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("attendance")
    .insert(
      {
        user_id: userId,
        attendance_date: today,
        check_in_at: now,
        status: "present" as AttendanceStatus,
        late_login: late,
        working_seconds: 0,
        break_seconds: 0,
        lunch_seconds: 0,
        overtime_seconds: 0,
        updated_at: now,
      }
    )
    .select()
    .maybeSingle();

  if (error) {
    // A concurrent check-in won the unique user/date constraint.
    if (error.code === "23505") {
      return getTodayAttendance(userId);
    }
    console.error("checkIn error:", error);
    return null;
  }

  // Log activity
  await supabase.from("activities").insert({
    user_id: userId,
    type: "check_in",
    description: "Checked in for the day",
  });

  return data as Attendance | null;
}

export async function checkOut(userId: string): Promise<Attendance | null> {
  const record = await getTodayAttendance(userId);
  if (!record || !record.check_in_at) return null;

  const now = new Date();
  const checkInTime = new Date(record.check_in_at);
  const totalSeconds = secondsBetween(checkInTime, now);

  // Calculate working seconds: total - break - lunch
  let breakSecs = record.break_seconds || 0;
  let lunchSecs = record.lunch_seconds || 0;

  // If currently on break, close it
  if (record.break_start_at && !record.break_end_at) {
    breakSecs += secondsBetween(new Date(record.break_start_at), now);
  }
  if (record.lunch_start_at && !record.lunch_end_at) {
    lunchSecs += secondsBetween(new Date(record.lunch_start_at), now);
  }

  const workingSecs = Math.max(0, totalSeconds - breakSecs - lunchSecs);
  const overtimeSecs = Math.max(0, workingSecs - 9 * 3600); // overtime after 9 hours

  const { data, error } = await supabase
    .from("attendance")
    .update({
      check_out_at: now.toISOString(),
      working_seconds: workingSecs,
      break_seconds: breakSecs,
      lunch_seconds: lunchSecs,
      overtime_seconds: overtimeSecs,
      status: "present",
      updated_at: now.toISOString(),
    })
    .eq("id", record.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("checkOut error:", error);
    return null;
  }

  await supabase.from("activities").insert({
    user_id: userId,
    type: "check_out",
    description: "Checked out for the day",
    metadata: { working_seconds: workingSecs, overtime_seconds: overtimeSecs },
  });

  return data as Attendance | null;
}

export async function startBreak(userId: string): Promise<Attendance | null> {
  const record = await getTodayAttendance(userId);
  if (!record) return null;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("attendance")
    .update({
      break_start_at: now,
      break_end_at: null,
      updated_at: now,
    })
    .eq("id", record.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("startBreak error:", error);
    return null;
  }

  await supabase.from("activities").insert({
    user_id: userId,
    type: "break_start",
    description: "Started a break",
  });

  return data as Attendance | null;
}

export async function endBreak(userId: string): Promise<Attendance | null> {
  const record = await getTodayAttendance(userId);
  if (!record || !record.break_start_at) return null;

  const now = new Date();
  const breakStart = new Date(record.break_start_at);
  const additionalBreak = secondsBetween(breakStart, now);
  const totalBreak = (record.break_seconds || 0) + additionalBreak;

  const { data, error } = await supabase
    .from("attendance")
    .update({
      break_end_at: now.toISOString(),
      break_seconds: totalBreak,
      updated_at: now.toISOString(),
    })
    .eq("id", record.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("endBreak error:", error);
    return null;
  }

  await supabase.from("activities").insert({
    user_id: userId,
    type: "break_end",
    description: "Ended break",
    metadata: { break_seconds: additionalBreak },
  });

  return data as Attendance | null;
}

export async function startLunch(userId: string): Promise<Attendance | null> {
  const record = await getTodayAttendance(userId);
  if (!record) return null;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("attendance")
    .update({
      lunch_start_at: now,
      lunch_end_at: null,
      updated_at: now,
    })
    .eq("id", record.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("startLunch error:", error);
    return null;
  }

  await supabase.from("activities").insert({
    user_id: userId,
    type: "lunch_start",
    description: "Started lunch",
  });

  return data as Attendance | null;
}

export async function endLunch(userId: string): Promise<Attendance | null> {
  const record = await getTodayAttendance(userId);
  if (!record || !record.lunch_start_at) return null;

  const now = new Date();
  const lunchStart = new Date(record.lunch_start_at);
  const additionalLunch = secondsBetween(lunchStart, now);
  const totalLunch = (record.lunch_seconds || 0) + additionalLunch;

  const { data, error } = await supabase
    .from("attendance")
    .update({
      lunch_end_at: now.toISOString(),
      lunch_seconds: totalLunch,
      updated_at: now.toISOString(),
    })
    .eq("id", record.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("endLunch error:", error);
    return null;
  }

  await supabase.from("activities").insert({
    user_id: userId,
    type: "lunch_end",
    description: "Ended lunch",
    metadata: { lunch_seconds: additionalLunch },
  });

  return data as Attendance | null;
}

export function computeLiveWorkingSeconds(record: Attendance | null): number {
  if (!record || !record.check_in_at) return 0;
  const now = new Date();
  const checkIn = new Date(record.check_in_at);
  const total = secondsBetween(checkIn, now);

  let currentBreak = 0;
  let currentLunch = 0;

  if (record.break_start_at && !record.break_end_at) {
    currentBreak = secondsBetween(new Date(record.break_start_at), now);
  }
  if (record.lunch_start_at && !record.lunch_end_at) {
    currentLunch = secondsBetween(new Date(record.lunch_start_at), now);
  }

  return Math.max(0, total - (record.break_seconds || 0) - (record.lunch_seconds || 0) - currentBreak - currentLunch);
}

export async function getAttendanceHistory(userId: string, limit = 30): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .order("attendance_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getAttendanceHistory error:", error);
    return [];
  }
  return (data ?? []) as Attendance[];
}

export async function getAllTodayAttendance(): Promise<Attendance[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("attendance_date", today);

  if (error) {
    console.error("getAllTodayAttendance error:", error);
    return [];
  }
  return (data ?? []) as Attendance[];
}
