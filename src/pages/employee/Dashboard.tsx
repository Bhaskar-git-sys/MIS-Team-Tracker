import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { usePresence } from "../../contexts/PresenceContext";
import { AttendanceControls } from "../../components/AttendanceControls";
import { StatCard } from "../../components/shared/StatCard";
import { PageHeader } from "../../components/shared/PageHeader";
import { supabase } from "../../services/supabaseClient";
import { getTodayAttendance, computeLiveWorkingSeconds } from "../../services/attendanceService";
import { getTodayFixedTasks, generateTodayTasks } from "../../services/fixedTaskService";
import { formatDuration } from "../../utils/helpers";
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, FDT_STATUS_LABELS, FDT_STATUS_COLORS, FDT_STATUS_DOT_COLORS } from "../../utils/constants";
import type { Task, Attendance, DailyFixedTask } from "../../types";
import {
  CheckSquare,
  Clock,
  Calendar,
  TrendingUp,
  Coffee,
  UtensilsCrossed,
  CheckCircle2,
  AlertCircle,
  ListChecks,
} from "lucide-react";

export default function EmployeeDashboard() {
  const { user, profile } = useAuth();
  const { presence } = usePresence();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [fdtTasks, setFdtTasks] = useState<DailyFixedTask[]>([]);
  const [liveSeconds, setLiveSeconds] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      await generateTodayTasks(todayStr);
      const [tasksRes, attendance, fdt] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .eq("assigned_to", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        getTodayAttendance(user.id),
        getTodayFixedTasks(user.id, todayStr),
      ]);
      setTasks((tasksRes.data ?? []) as Task[]);
      setTodayRecord(attendance);
      setFdtTasks(fdt);
    })();
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveSeconds(computeLiveWorkingSeconds(todayRecord));
    }, 1000);
    return () => clearInterval(interval);
  }, [todayRecord]);

  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const pendingTasks = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  ).length;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(" ")[0] ?? ""}!`}
        subtitle="Here's your overview for today"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Working Time"
          value={formatDuration(liveSeconds)}
          icon={<Clock className="w-6 h-6" />}
          color="primary"
        />
        <StatCard
          title="Total Tasks"
          value={tasks.length}
          icon={<CheckSquare className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Completed"
          value={completedTasks}
          icon={<CheckCircle2 className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Pending"
          value={pendingTasks}
          icon={<AlertCircle className="w-6 h-6" />}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance controls */}
        <div className="lg:col-span-1">
          <AttendanceControls />

          {/* Current status */}
          <div className="card p-5 mt-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Current Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Status</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {presence?.status || "offline"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Late Login</span>
                <span className={`font-medium ${todayRecord?.late_login ? "text-amber-500" : "text-green-500"}`}>
                  {todayRecord?.late_login ? "Yes" : "No"}
                </span>
              </div>
              {todayRecord?.overtime_seconds ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Overtime</span>
                  <span className="font-medium text-green-500">
                    {formatDuration(todayRecord.overtime_seconds)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="lg:col-span-2">
          {/* Fixed Daily Tasks widget */}
          {fdtTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5 mb-4"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-primary-500" />
                  <h3 className="font-semibold text-slate-900 dark:text-white">Fixed Daily Tasks</h3>
                </div>
                <Link to="/app/fixed-tasks" className="text-sm text-primary-600 hover:text-primary-700">View all</Link>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{fdtTasks.filter((t) => t.status === "completed").length}</p>
                  <p className="text-xs text-slate-400">Completed</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{fdtTasks.filter((t) => t.status === "wip").length}</p>
                  <p className="text-xs text-slate-400">WIP</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{fdtTasks.filter((t) => t.status === "open").length}</p>
                  <p className="text-xs text-slate-400">Open</p>
                </div>
              </div>
              <div className="space-y-2">
                {fdtTasks.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-slate-700 dark:text-slate-200 truncate flex-1 font-medium">{t.report_name}</span>
                    <span className={`badge ${FDT_STATUS_COLORS[t.status]} flex items-center gap-1 flex-shrink-0 ml-2`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${FDT_STATUS_DOT_COLORS[t.status]}`} />
                      {FDT_STATUS_LABELS[t.status]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Completion</span>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {fdtTasks.length > 0 ? Math.round((fdtTasks.filter((t) => t.status === "completed").length / fdtTasks.length) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-700"
                    style={{ width: `${fdtTasks.length > 0 ? Math.round((fdtTasks.filter((t) => t.status === "completed").length / fdtTasks.length) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">My Tasks</h3>
              <Link to="/app/tasks" className="text-sm text-primary-600 hover:text-primary-700">
                View all
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tasks assigned yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 6).map((task, i) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <span className={`badge ${TASK_STATUS_COLORS[task.status]} flex-shrink-0`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Link to="/app/leaves" className="card p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Apply Leave</p>
                  <p className="text-xs text-slate-400">Request time off</p>
                </div>
              </div>
            </Link>
            <Link to="/app/activity" className="card p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">My Activity</p>
                  <p className="text-xs text-slate-400">View your logs</p>
                </div>
              </div>
            </Link>
            <Link to="/app/chat" className="card p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 flex items-center justify-center">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Chat</p>
                  <p className="text-xs text-slate-400">Message your team</p>
                </div>
              </div>
            </Link>
            <Link to="/app/meetings" className="card p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Meetings</p>
                  <p className="text-xs text-slate-400">Join video calls</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
