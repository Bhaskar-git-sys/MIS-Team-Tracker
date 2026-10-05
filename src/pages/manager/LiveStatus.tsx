import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  usePresence,
} from "../../contexts/PresenceContext";
import {
  PageHeader,
} from "../../components/shared/PageHeader";
import {
  Avatar,
} from "../../components/shared/Avatar";
import {
  Badge,
} from "../../components/shared/Badge";
import {
  supabase,
} from "../../services/supabaseClient";
import {
  getAllTodayAttendance,
  computeLiveWorkingSeconds,
} from "../../services/attendanceService";
import {
  PRESENCE_LABELS,
  PRESENCE_COLORS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
} from "../../utils/constants";
import {
  formatDuration,
} from "../../utils/helpers";
import type {
  Profile,
  Attendance,
  Task,
  TaskStatus,
  DailyFixedTask,
} from "../../types";

import {
  Radio,
  Activity,
  Clock3,
  LogIn,
  LogOut,
  Coffee,
  Utensils,
  BriefcaseBusiness,
  Timer,
  CheckCircle2,
  RefreshCw,
  CalendarClock,
} from "lucide-react";


// ============================================================
// TYPES
// ============================================================

type AnyRecord = Record<string, any>;

type EmployeeLiveData = {
  employee: Profile;
  presence: AnyRecord | null;
  attendance: AnyRecord | null;
  task: AnyRecord | null;
};


// ============================================================
// CONSTANTS
// ============================================================

const REFRESH_INTERVAL = 1000;

const STALE_AFTER_SECONDS = 75;


// ============================================================
// HELPERS
// ============================================================

function toDate(value: unknown): Date | null {
  if (!value) return null;

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}


function getNow(): Date {
  return new Date();
}


function secondsBetween(
  start: unknown,
  end: unknown = new Date()
): number {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return 0;
  }

  const seconds = Math.floor(
    (endDate.getTime() - startDate.getTime()) /
    1000
  );

  return Math.max(0, seconds);
}


function formatClock(
  value: unknown
): string {
  const date = toDate(value);

  if (!date) {
    return "--:--";
  }

  return date.toLocaleTimeString(
    "en-IN",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}


function formatShortClock(
  value: unknown
): string {
  const date = toDate(value);

  if (!date) {
    return "--:--";
  }

  return date.toLocaleTimeString(
    "en-IN",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}


function getStatus(
  presence: AnyRecord | null
): string {
  if (!presence) {
    return "offline";
  }

  const status =
    String(presence.status || "offline")
      .toLowerCase();

  return status;
}


function isPresenceStale(
  presence: AnyRecord | null
): boolean {
  if (!presence?.last_seen) {
    return true;
  }

  const lastSeen = toDate(
    presence.last_seen
  );

  if (!lastSeen) {
    return true;
  }

  const age =
    (Date.now() -
      lastSeen.getTime()) /
    1000;

  return age > STALE_AFTER_SECONDS;
}


// ============================================================
// LOGIN / LOGOUT HELPERS
// ============================================================

function getCheckIn(
  attendance: AnyRecord | null
): any {
  if (!attendance) return null;

  return (
    attendance.check_in_at ??
    attendance.login_at ??
    attendance.login_time ??
    attendance.clock_in_at ??
    attendance.punch_in_at
  );
}


function getCheckOut(
  attendance: AnyRecord | null
): any {
  if (!attendance) return null;

  return (
    attendance.check_out_at ??
    attendance.logout_at ??
    attendance.logout_time ??
    attendance.clock_out_at ??
    attendance.punch_out_at
  );
}


// ============================================================
// BREAK HELPERS
// ============================================================

function getBreakStart(
  attendance: AnyRecord | null,
  presence: AnyRecord | null
): any {
  return (
    presence?.break_started_at ??
    presence?.break_start_at ??
    attendance?.break_started_at ??
    attendance?.break_start_at ??
    attendance?.break_in_at ??
    attendance?.break_start
  );
}


function getBreakEnd(
  attendance: AnyRecord | null,
  presence: AnyRecord | null
): any {
  return (
    presence?.break_ended_at ??
    presence?.break_end_at ??
    attendance?.break_ended_at ??
    attendance?.break_end_at ??
    attendance?.break_out_at ??
    attendance?.break_end
  );
}


function getTotalBreakSeconds(
  attendance: AnyRecord | null,
  presence: AnyRecord | null,
  now: Date
): number {

  const stored =
    Number(
      presence?.break_seconds ??
      attendance?.break_seconds ??
      attendance?.total_break_seconds ??
      0
    );

  if (stored > 0) {
    return stored;
  }

  const start = getBreakStart(
    attendance,
    presence
  );

  if (!start) {
    return 0;
  }

  const end =
    getBreakEnd(
      attendance,
      presence
    );

  return secondsBetween(
    start,
    end || now
  );
}


// ============================================================
// LUNCH HELPERS
// ============================================================

function getLunchStart(
  attendance: AnyRecord | null,
  presence: AnyRecord | null
): any {
  return (
    presence?.lunch_started_at ??
    presence?.lunch_start_at ??
    attendance?.lunch_started_at ??
    attendance?.lunch_start_at ??
    attendance?.lunch_in_at ??
    attendance?.lunch_start
  );
}


function getLunchEnd(
  attendance: AnyRecord | null,
  presence: AnyRecord | null
): any {
  return (
    presence?.lunch_ended_at ??
    presence?.lunch_end_at ??
    attendance?.lunch_ended_at ??
    attendance?.lunch_end_at ??
    attendance?.lunch_out_at ??
    attendance?.lunch_end
  );
}


function getTotalLunchSeconds(
  attendance: AnyRecord | null,
  presence: AnyRecord | null,
  now: Date
): number {

  const stored =
    Number(
      presence?.lunch_seconds ??
      attendance?.lunch_seconds ??
      attendance?.total_lunch_seconds ??
      0
    );

  if (stored > 0) {
    return stored;
  }

  const start =
    getLunchStart(
      attendance,
      presence
    );

  if (!start) {
    return 0;
  }

  const end =
    getLunchEnd(
      attendance,
      presence
    );

  return secondsBetween(
    start,
    end || now
  );
}


// ============================================================
// TASK HELPERS
// ============================================================

function getTaskStart(
  task: AnyRecord | null
): any {
  if (!task) return null;

  return (
    task.started_at ??
    task.start_time ??
    task.task_started_at ??
    task.assigned_at ??
    task.created_at
  );
}


function getTaskDuration(
  task: AnyRecord | null,
  now: Date
): number {
  if (!task) return 0;

  const stored =
    Number(
      task.duration_seconds ??
      task.working_seconds ??
      task.elapsed_seconds ??
      0
    );

  if (stored > 0) {
    return stored;
  }

  const start =
    getTaskStart(task);

  if (!start) {
    return 0;
  }

  return secondsBetween(
    start,
    now
  );
}


// ============================================================
// STATUS LABEL
// ============================================================

function getLiveStatusLabel(
  status: string
): string {

  switch (status) {
    case "online":
      return "Working";

    case "break":
      return "On Break";

    case "lunch":
      return "Lunch";

    case "meeting":
      return "Meeting";

    case "offline":
      return "Offline";

    case "away":
      return "Away";

    default:
      return (
        PRESENCE_LABELS[
        status as keyof typeof PRESENCE_LABELS
        ] || status
      );
  }
}


// ============================================================
// STATUS COLOR
// ============================================================

function getStatusColor(
  status: string
): string {

  switch (status) {
    case "online":
      return "bg-green-500";

    case "break":
      return "bg-amber-500";

    case "lunch":
      return "bg-orange-500";

    case "meeting":
      return "bg-purple-500";

    case "away":
      return "bg-yellow-500";

    case "offline":
    default:
      return "bg-slate-400";
  }
}


// ============================================================
// MAIN COMPONENT
// ============================================================

export default function LiveStatus() {

  const { allPresence } =
    usePresence();

  const [employees, setEmployees] =
    useState<Profile[]>([]);

  const [todayAttendance, setTodayAttendance] =
    useState<Attendance[]>([]);

  const [tasks, setTasks] =
    useState<Task[]>([]);

  const [fixedTasks, setFixedTasks] =
    useState<DailyFixedTask[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [now, setNow] =
    useState<Date>(getNow());


  // ============================================================
  // LOAD DATA
  // ============================================================

  const loadData = async (
    showLoading = false
  ) => {

    if (showLoading) {
      setRefreshing(true);
    }

    try {

      const [
        empRes,
        fixedTasksRes,
        today,
        tasksRes,
      ] = await Promise.all([

        supabase
          .from("profiles")
          .select("*")
          .eq(
            "role",
            "mis_employee"
          ),

        supabase
          .from("daily_fixed_tasks")
          .select("*")
          .eq("task_date", new Date().toISOString().split("T")[0])
          .order("updated_at", { ascending: false }),

        getAllTodayAttendance(),

        supabase
          .from("tasks")
          .select("*")
          .order(
            "updated_at",
            {
              ascending: false,
            }
          ),
      ]);


      setEmployees(
        (empRes.data ?? []) as Profile[]
      );

      setTodayAttendance(
        today
      );

      setTasks(
        (tasksRes.data ?? []) as Task[]
      );

      setFixedTasks(
        (fixedTasksRes.data ?? []) as DailyFixedTask[]
      );

    } catch (error) {

      console.error(
        "Live Status loading error:",
        error
      );

    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  };


  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {

    loadData(true);

    const dataInterval =
      setInterval(() => {
        loadData(false);
      }, 10000);

    const clockInterval =
      setInterval(() => {
        setNow(
          getNow()
        );
      }, REFRESH_INTERVAL);

    return () => {
      clearInterval(
        dataInterval
      );

      clearInterval(
        clockInterval
      );
    };

  }, []);


  // ============================================================
  // PRESENCE LOOKUP
  // ============================================================

  const getPresence = (
    userId: string
  ): AnyRecord | null => {

    return (
      allPresence.find(
        (p) =>
          p.user_id === userId
      ) as AnyRecord | undefined
    ) ?? null;
  };


  // ============================================================
  // ATTENDANCE LOOKUP
  // ============================================================

  const getAttendance = (
    userId: string
  ): AnyRecord | null => {

    return (
      todayAttendance.find(
        (a) =>
          a.user_id === userId
      ) as AnyRecord | undefined
    ) ?? null;
  };


  // ============================================================
  // CURRENT TASK
  // ============================================================

  const getCurrentTask = (
    userId: string
  ): AnyRecord | null => {

    const activeTasks = [
      ...tasks,
      ...fixedTasks.map((task) => ({
        ...task,
        title: task.report_name,
        status: task.status === "wip"
          ? "work_in_progress"
          : task.status,
      })),
    ].filter(
        (task) =>
          task.assigned_to ===
          userId &&
          task.status !==
          "completed" &&
          task.status !==
          "cancelled" &&
          task.status !==
          "open"
      ) as AnyRecord[];

    if (
      activeTasks.length === 0
    ) {
      return null;
    }

    return activeTasks[0];
  };


  // ============================================================
  // EMPLOYEE LIVE DATA
  // ============================================================

  const liveEmployees =
    useMemo<EmployeeLiveData[]>(
      () =>
        employees.map(
          (employee) =>({
            employee,
            presence:
              getPresence(
                employee.id
              ),
            attendance:
              getAttendance(
                employee.id
              ),
            task:
              getCurrentTask(
                employee.id
              ),
          })
        ),
      [
        employees,
        allPresence,
        todayAttendance,
        tasks,
        fixedTasks,
        now,
      ]
    );


  // ============================================================
  // STATUS CALCULATIONS
  // ============================================================

  const getEffectiveStatus = (
    presence: AnyRecord | null
  ): string => {

    if (!presence) {
      return "offline";
    }

    if (
      isPresenceStale(
        presence
      )
    ) {
      return "offline";
    }

    return getStatus(
      presence
    );
  };


  // ============================================================
  // ONLINE / OFFLINE
  // ============================================================

  const activeEmployees =
    liveEmployees.filter(
      ({ presence }) => {

        const status =
          getEffectiveStatus(
            presence
          );

        return status !==
          "offline";
      }
    );


  const offlineEmployees =
    liveEmployees.filter(
      ({ presence }) => {

        const status =
          getEffectiveStatus(
            presence
          );

        return status ===
          "offline";
      }
    );


  // ============================================================
  // STATUS COUNTS
  // ============================================================

  const statusCounts = {
    online: 0,
    break: 0,
    lunch: 0,
    meeting: 0,
    offline: 0,
  };


  liveEmployees.forEach(
    ({ presence }) => {

      const status =
        getEffectiveStatus(
          presence
        );

      if (
        status in statusCounts
      ) {
        statusCounts[
          status as keyof typeof statusCounts
        ]++;
      } else {
        statusCounts.offline++;
      }
    }
  );


  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {

    return (
      <div className="flex items-center justify-center py-12">

        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />

      </div>
    );
  }


  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>

      {/* ================================================== */}
      {/* HEADER */}
      {/* ================================================== */}

      <div className="flex items-center justify-between">

        <PageHeader
          title="Live Status"
          subtitle="Real-time monitoring of your team"
          icon={
            <Radio className="w-5 h-5" />
          }
        />

        <button
          type="button"
          onClick={() =>
            loadData(true)
          }
          disabled={refreshing}
          className="mb-6 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary-600 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing
              ? "animate-spin"
              : ""
              }`}
          />
        </button>

      </div>


      {/* ================================================== */}
      {/* SUMMARY */}
      {/* ================================================== */}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">

        {(
          [
            "online",
            "break",
            "lunch",
            "meeting",
            "offline",
          ] as const
        ).map(
          (status) => {

            const count =
              statusCounts[
              status
              ];

            return (
              <div
                key={status}
                className="card p-4 text-center"
              >

                <div
                  className={`w-3 h-3 rounded-full ${getStatusColor(
                    status
                  )} mx-auto mb-2`}
                />

                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {count}
                </p>

                <p className="text-xs text-slate-400">
                  {getLiveStatusLabel(
                    status
                  )}
                </p>

              </div>
            );
          }
        )}

      </div>


      {/* ================================================== */}
      {/* ACTIVE EMPLOYEES */}
      {/* ================================================== */}

      {activeEmployees.length >
        0 && (

          <div className="mb-8">

            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">

              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />

              Active Now (
              {activeEmployees.length}
              )

            </h3>


            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              {activeEmployees.map(
                ({
                  employee,
                  presence,
                  attendance,
                  task,
                }) => {

                  const status =
                    getEffectiveStatus(
                      presence
                    );


                  const checkIn =
                    getCheckIn(
                      attendance
                    );

                  const checkOut =
                    getCheckOut(
                      attendance
                    );


                  const isLoggedIn =
                    !!checkIn &&
                    !checkOut;


                  // ------------------------------------------
                  // LIVE LOGIN DURATION
                  // ------------------------------------------

                  let loginSeconds =
                    0;

                  if (
                    checkIn
                  ) {

                    if (
                      isLoggedIn
                    ) {

                      loginSeconds =
                        secondsBetween(
                          checkIn,
                          now
                        );

                    } else {

                      loginSeconds =
                        secondsBetween(
                          checkIn,
                          checkOut
                        );
                    }
                  }


                  // ------------------------------------------
                  // WORKING SECONDS
                  // ------------------------------------------

                  let workingSeconds =
                    0;

                  if (
                    attendance &&
                    checkIn
                  ) {

                    try {

                      if (
                        isLoggedIn
                      ) {

                        workingSeconds =
                          computeLiveWorkingSeconds(
                            attendance as Attendance
                          );

                      } else {

                        workingSeconds =
                          Number(
                            attendance.working_seconds ??
                            0
                          );
                      }

                    } catch {

                      workingSeconds =
                        Math.max(
                          0,
                          loginSeconds
                        );
                    }
                  }


                  // ------------------------------------------
                  // BREAK
                  // ------------------------------------------

                  const breakStart =
                    getBreakStart(
                      attendance,
                      presence
                    );

                  const breakEnd =
                    getBreakEnd(
                      attendance,
                      presence
                    );

                  const breakSeconds =
                    getTotalBreakSeconds(
                      attendance,
                      presence,
                      now
                    );


                  // ------------------------------------------
                  // LUNCH
                  // ------------------------------------------

                  const lunchStart =
                    getLunchStart(
                      attendance,
                      presence
                    );

                  const lunchEnd =
                    getLunchEnd(
                      attendance,
                      presence
                    );

                  const lunchSeconds =
                    getTotalLunchSeconds(
                      attendance,
                      presence,
                      now
                    );


                  // ------------------------------------------
                  // CURRENT BREAK/LUNCH DURATION
                  // ------------------------------------------

                  const currentBreakSeconds =
                    status ===
                      "break" &&
                      breakStart
                      ? secondsBetween(
                        breakStart,
                        now
                      )
                      : 0;


                  const currentLunchSeconds =
                    status ===
                      "lunch" &&
                      lunchStart
                      ? secondsBetween(
                        lunchStart,
                        now
                      )
                      : 0;


                  // ------------------------------------------
                  // TASK
                  // ------------------------------------------

                  const taskDuration =
                    getTaskDuration(
                      task,
                      now
                    );


                  // ------------------------------------------
                  // TASK START
                  // ------------------------------------------

                  const taskStart =
                    getTaskStart(
                      task
                    );


                  return (
                    <motion.div
                      key={
                        employee.id
                      }
                      initial={{
                        opacity: 0,
                        scale: 0.96,
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                      }}
                      className={`card p-5 border-l-4 ${status ===
                        "online"
                        ? "border-l-green-500"
                        : status ===
                          "break"
                          ? "border-l-amber-500"
                          : status ===
                            "lunch"
                            ? "border-l-orange-500"
                            : status ===
                              "meeting"
                              ? "border-l-purple-500"
                              : "border-l-slate-400"
                        }`}
                    >

                      {/* -------------------------------- */}
                      {/* EMPLOYEE HEADER */}
                      {/* -------------------------------- */}

                      <div className="flex items-start gap-3 mb-5">

                        <Avatar
                          name={
                            employee.full_name
                          }
                          src={
                            employee.avatar_url
                          }
                          size="lg"
                          presence={
                            status as any
                          }
                        />

                        <div className="flex-1 min-w-0">

                          <div className="flex items-center justify-between gap-2">

                            <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                              {
                                employee.full_name
                              }
                            </h4>

                            <span
                              className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(
                                status
                              )} ${status ===
                                "online"
                                ? "animate-pulse"
                                : ""
                                }`}
                            />

                          </div>

                          <p className="text-xs text-slate-400 mt-1">
                            {employee.employee_id
                              ? `${employee.employee_id} • `
                              : ""}
                            {
                              employee.position ||
                              "MIS Executive"
                            }
                          </p>

                          <Badge
                            variant={
                              status ===
                                "online"
                                ? "success"
                                : "warning"
                            }
                            className="mt-2"
                          >
                            {getLiveStatusLabel(
                              status
                            )}
                          </Badge>

                        </div>
                      </div>


                      {/* -------------------------------- */}
                      {/* MAIN LIVE TIMER */}
                      {/* -------------------------------- */}

                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 mb-4">

                        <div className="flex items-center justify-between mb-2">

                          <div className="flex items-center gap-2">

                            <Timer className="w-4 h-4 text-primary-500" />

                            <span className="text-xs font-medium text-slate-500">
                              Live Login Duration
                            </span>

                          </div>

                          <span className="text-xs text-slate-400">
                            {isLoggedIn
                              ? "LIVE"
                              : "ENDED"}
                          </span>

                        </div>

                        <p className="text-3xl font-mono font-bold text-slate-900 dark:text-white">
                          {formatDuration(
                            loginSeconds
                          )}
                        </p>

                      </div>


                      {/* -------------------------------- */}
                      {/* LOGIN / LOGOUT */}
                      {/* -------------------------------- */}

                      <div className="grid grid-cols-2 gap-3 mb-4">

                        <TimeCard
                          icon={
                            <LogIn className="w-4 h-4 text-green-500" />
                          }
                          title="Login Time"
                          value={
                            checkIn
                              ? formatShortClock(
                                checkIn
                              )
                              : "--:--"
                          }
                        />

                        <TimeCard
                          icon={
                            <LogOut className="w-4 h-4 text-red-500" />
                          }
                          title="Logout Time"
                          value={
                            checkOut
                              ? formatShortClock(
                                checkOut
                              )
                              : isLoggedIn
                                ? "Working"
                                : "--:--"
                          }
                        />

                      </div>


                      {/* -------------------------------- */}
                      {/* WORKING TIME */}
                      {/* -------------------------------- */}

                      <div className="grid grid-cols-2 gap-3 mb-4">

                        <TimeCard
                          icon={
                            <BriefcaseBusiness className="w-4 h-4 text-blue-500" />
                          }
                          title="Working Time"
                          value={formatDuration(
                            workingSeconds
                          )}
                        />

                        <TimeCard
                          icon={
                            <Clock3 className="w-4 h-4 text-primary-500" />
                          }
                          title="Login Hours"
                          value={formatDuration(
                            loginSeconds
                          )}
                        />

                      </div>


                      {/* -------------------------------- */}
                      {/* BREAK / LUNCH */}
                      {/* -------------------------------- */}

                      <div className="grid grid-cols-2 gap-3 mb-4">

                        <TimeCard
                          icon={
                            <Coffee className="w-4 h-4 text-amber-500" />
                          }
                          title={
                            status ===
                              "break"
                              ? "Break - LIVE"
                              : "Total Break"
                          }
                          value={formatDuration(
                            status ===
                              "break"
                              ? Math.max(
                                breakSeconds,
                                currentBreakSeconds
                              )
                              : breakSeconds
                          )}
                        />

                        <TimeCard
                          icon={
                            <Utensils className="w-4 h-4 text-orange-500" />
                          }
                          title={
                            status ===
                              "lunch"
                              ? "Lunch - LIVE"
                              : "Total Lunch"
                          }
                          value={formatDuration(
                            status ===
                              "lunch"
                              ? Math.max(
                                lunchSeconds,
                                currentLunchSeconds
                              )
                              : lunchSeconds
                          )}
                        />

                      </div>


                      {/* -------------------------------- */}
                      {/* BREAK / LUNCH TIMES */}
                      {/* -------------------------------- */}

                      {Boolean(breakStart ||
                        lunchStart) && (

                          <div className="grid grid-cols-2 gap-3 mb-4">

                            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 p-3">

                              <div className="flex items-center gap-2 mb-1">

                                <Coffee className="w-4 h-4 text-amber-500" />

                                <p className="text-xs text-slate-400">
                                  Break
                                </p>

                              </div>

                              <p className="text-xs font-medium text-slate-900 dark:text-white">

                                {breakStart
                                  ? `${formatShortClock(
                                    breakStart
                                  )} - ${breakEnd
                                    ? formatShortClock(
                                      breakEnd
                                    )
                                    : "LIVE"
                                  }`
                                  : "Not taken"}

                              </p>

                            </div>


                            <div className="rounded-xl bg-orange-50 dark:bg-orange-900/10 p-3">

                              <div className="flex items-center gap-2 mb-1">

                                <Utensils className="w-4 h-4 text-orange-500" />

                                <p className="text-xs text-slate-400">
                                  Lunch
                                </p>

                              </div>

                              <p className="text-xs font-medium text-slate-900 dark:text-white">

                                {lunchStart
                                  ? `${formatShortClock(
                                    lunchStart
                                  )} - ${lunchEnd
                                    ? formatShortClock(
                                      lunchEnd
                                    )
                                    : "LIVE"
                                  }`
                                  : "Not taken"}

                              </p>

                            </div>

                          </div>
                        )}


                      {/* -------------------------------- */}
                      {/* CURRENT TASK */}
                      {/* -------------------------------- */}

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-700">

                        <div className="flex items-center justify-between mb-2">

                          <p className="text-xs text-slate-400">
                            Current Task
                          </p>

                          {task && (
                            <span className="text-xs text-slate-400">
                              {taskStart
                                ? formatShortClock(
                                  taskStart
                                )
                                : ""}
                            </span>
                          )}

                        </div>


                        {task ? (

                          <div className="space-y-2">

                            <div className="flex items-center justify-between gap-2">

                              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {task.title}
                              </p>

                              <span
                                className={`badge ${TASK_STATUS_COLORS[
                                  task.status as TaskStatus
                                ] || ""
                                  } flex-shrink-0`}
                              >
                                {
                                  TASK_STATUS_LABELS[
                                  task.status as TaskStatus
                                  ] || String(task.status || "")
                                }
                              </span>

                            </div>


                            <div className="flex items-center gap-2 text-xs text-slate-500">

                              <Timer className="w-3.5 h-3.5" />

                              <span>
                                Task Duration:
                              </span>

                              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                {formatDuration(
                                  taskDuration
                                )}
                              </span>

                            </div>

                          </div>

                        ) : (

                          <p className="text-sm text-slate-400">
                            No active task
                          </p>

                        )}

                      </div>


                      {/* -------------------------------- */}
                      {/* LAST ACTIVITY */}
                      {/* -------------------------------- */}

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">

                        <div className="flex items-center gap-2">

                          <Activity className="w-3.5 h-3.5 text-slate-400" />

                          <span className="text-xs text-slate-400">
                            Last Activity
                          </span>

                        </div>

                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">

                          {presence?.last_seen
                            ? formatClock(
                              presence.last_seen
                            )
                            : "--:--"}

                        </span>

                      </div>

                    </motion.div>
                  );
                }
              )}

            </div>
          </div>
        )}


      {/* ================================================== */}
      {/* OFFLINE */}
      {/* ================================================== */}

      {offlineEmployees.length >
        0 && (

          <div>

            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">

              <span className="w-2 h-2 bg-slate-400 rounded-full" />

              Offline (
              {offlineEmployees.length}
              )

            </h3>


            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

              {offlineEmployees.map(
                ({
                  employee,
                  presence,
                  attendance,
                }) => {

                  const checkIn =
                    getCheckIn(
                      attendance
                    );

                  const checkOut =
                    getCheckOut(
                      attendance
                    );

                  const loginSeconds =
                    checkIn
                      ? secondsBetween(
                        checkIn,
                        checkOut ||
                        presence?.updated_at ||
                        now
                      )
                      : 0;


                  return (
                    <motion.div
                      key={
                        employee.id
                      }
                      initial={{
                        opacity: 0,
                      }}
                      animate={{
                        opacity: 1,
                      }}
                      className="card p-4 opacity-75"
                    >

                      <div className="flex items-center gap-3">

                        <Avatar
                          name={
                            employee.full_name
                          }
                          src={
                            employee.avatar_url
                          }
                          size="md"
                          presence="offline"
                        />

                        <div className="flex-1 min-w-0">

                          <div className="flex items-center justify-between">

                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {
                                employee.full_name
                              }
                            </p>

                            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />

                          </div>

                          <p className="text-xs text-slate-400">
                            {employee.employee_id
                              ? `${employee.employee_id} • `
                              : ""}
                            Offline
                          </p>

                          <div className="flex items-center gap-3 mt-2 text-xs">

                            <span className="text-slate-400">
                              Login:
                              <strong className="ml-1 text-slate-600 dark:text-slate-300">
                                {checkIn
                                  ? formatShortClock(
                                    checkIn
                                  )
                                  : "--:--"}
                              </strong>
                            </span>

                            <span className="text-slate-400">
                              Total:
                              <strong className="ml-1 text-slate-600 dark:text-slate-300 font-mono">
                                {formatDuration(
                                  loginSeconds
                                )}
                              </strong>
                            </span>

                          </div>

                        </div>
                      </div>
                    </motion.div>
                  );
                }
              )}

            </div>
          </div>
        )}


      {/* ================================================== */}
      {/* NO EMPLOYEES */}
      {/* ================================================== */}

      {employees.length ===
        0 && (

          <div className="card p-12 text-center">

            <Activity className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />

            <p className="text-slate-500 dark:text-slate-400">
              No employees to monitor
            </p>

          </div>
        )}


      {/* ================================================== */}
      {/* LIVE FOOTER */}
      {/* ================================================== */}

      {employees.length > 0 && (

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">

          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />

          Live monitoring • Updated every second

          <CalendarClock className="w-3.5 h-3.5 ml-1" />

          {now.toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }
          )}

        </div>
      )}

    </div>
  );
}


// ============================================================
// TIME CARD
// ============================================================

function TimeCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">

      <div className="flex items-center gap-2 mb-1">

        {icon}

        <p className="text-xs text-slate-400">
          {title}
        </p>

      </div>

      <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">
        {value}
      </p>

    </div>
  );
}