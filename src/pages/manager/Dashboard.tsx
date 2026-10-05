import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { usePresence } from "../../contexts/PresenceContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { StatCard } from "../../components/shared/StatCard";
import { Avatar } from "../../components/shared/Avatar";
import { supabase } from "../../services/supabaseClient";
import { getAllTodayAttendance } from "../../services/attendanceService";
import { PRESENCE_LABELS, PRESENCE_COLORS, TASK_STATUS_LABELS, TASK_STATUS_COLORS, FDT_STATUS_LABELS, FDT_STATUS_COLORS, FDT_STATUS_DOT_COLORS } from "../../utils/constants";
import { formatDuration } from "../../utils/helpers";
import type { Profile, Task, Attendance, Leave, DailyFixedTask } from "../../types";
import {
  Users,
  CheckSquare,
  Calendar,
  Radio,
  TrendingUp,
  UserCheck,
  Clock,
  AlertCircle,
  ListChecks,
} from "lucide-react";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const { allPresence } = usePresence();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([]);
  const [fdtTasks, setFdtTasks] = useState<DailyFixedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, [user]);

  const loadAll = async () => {
    setLoading(true);
    const [empRes, attendance, tasksRes, leavesRes, fdtRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "mis_employee"),
      getAllTodayAttendance(),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("leaves").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("daily_fixed_tasks").select("*").eq("task_date", new Date().toISOString().split("T")[0]),
    ]);
    setEmployees((empRes.data ?? []) as Profile[]);
    setTodayAttendance(attendance);
    setTasks((tasksRes.data ?? []) as Task[]);
    setPendingLeaves((leavesRes.data ?? []) as Leave[]);
    setFdtTasks((fdtRes.data ?? []) as DailyFixedTask[]);
    setLoading(false);
  };

  const onlineCount = allPresence.filter((p) => p.status === "online").length;
  const presentCount = todayAttendance.filter((a) => a.check_in_at && !a.check_out_at).length;
  const pendingTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;

  const getPresenceFor = (userId: string) => allPresence.find((p) => p.user_id === userId);

  return (
    <div>
      <PageHeader
        title="Manager Dashboard"
        subtitle="Monitor your team and manage operations"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Employees"
          value={employees.length}
          icon={<Users className="w-6 h-6" />}
          color="primary"
        />
        <StatCard
          title="Present Today"
          value={presentCount}
          icon={<UserCheck className="w-6 h-6" />}
          color="green"
          trend={`${onlineCount} online now`}
        />
        <StatCard
          title="Active Tasks"
          value={pendingTasks}
          icon={<CheckSquare className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Pending Leaves"
          value={pendingLeaves.length}
          icon={<Calendar className="w-6 h-6" />}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee live status */}
        <div className="lg:col-span-2">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">Team Status</h3>
              <Link to="/app/live-status" className="text-sm text-primary-600 hover:text-primary-700">
                View all
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No employees yet</p>
                <Link to="/app/employees" className="text-primary-600 text-sm mt-2 inline-block">
                  Add employees
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {employees.slice(0, 5).map((emp) => {
                  const pres = getPresenceFor(emp.id);
                  const att = todayAttendance.find((a) => a.user_id === emp.id);
                  return (
                    <div
                      key={emp.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"
                    >
                      <Avatar name={emp.full_name} src={emp.avatar_url} size="md" presence={pres?.status ?? "offline"} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {emp.full_name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {emp.employee_id ? `${emp.employee_id} • ` : ""}{pres?.current_task || emp.position || "MIS Executive"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-slate-400">
                          {pres ? PRESENCE_LABELS[pres.status] : "Offline"}
                        </p>
                        {att?.check_in_at && !att?.check_out_at && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {formatDuration(att.working_seconds || 0)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent tasks */}
          <div className="card p-5 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">Recent Tasks</h3>
              <Link to="/app/tasks" className="text-sm text-primary-600 hover:text-primary-700">
                View all
              </Link>
            </div>
            {tasks.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tasks created yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 5).map((task) => {
                  const assignee = employees.find((e) => e.id === task.assigned_to);
                  return (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.title}</p>
                        <p className="text-xs text-slate-400 truncate">{assignee?.full_name}</p>
                      </div>
                      <span className={`badge ${TASK_STATUS_COLORS[task.status]} flex-shrink-0`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link to="/app/employees" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Manage Employees</p>
                  <p className="text-xs text-slate-400">Add, edit, reset password</p>
                </div>
              </Link>
              <Link to="/app/tasks" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Assign Task</p>
                  <p className="text-xs text-slate-400">Create new tasks</p>
                </div>
              </Link>
              <Link to="/app/fixed-tasks" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                  <ListChecks className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Fixed Daily Tasks</p>
                  <p className="text-xs text-slate-400">{fdtTasks.length} tasks today</p>
                </div>
              </Link>
              <Link to="/app/leaves" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Approve Leaves</p>
                  <p className="text-xs text-slate-400">{pendingLeaves.length} pending</p>
                </div>
              </Link>
              <Link to="/app/live-status" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                  <Radio className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Live Status</p>
                  <p className="text-xs text-slate-400">Monitor team in real-time</p>
                </div>
              </Link>
              <Link to="/app/reports" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">View Reports</p>
                  <p className="text-xs text-slate-400">Analytics & exports</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Fixed Daily Tasks widget */}
          {fdtTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-primary-500" />
                  <h3 className="font-semibold text-slate-900 dark:text-white">Fixed Daily Tasks</h3>
                </div>
                <Link to="/app/fixed-tasks" className="text-sm text-primary-600 hover:text-primary-700">View</Link>
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
              <div className="space-y-1.5">
                {fdtTasks.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 truncate flex-1">{t.report_name}</span>
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

          {/* Pending leaves alert */}
          {pendingLeaves.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card p-5 border-amber-200 dark:border-amber-900/50"
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-slate-900 dark:text-white">Pending Approvals</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                {pendingLeaves.length} leave request{pendingLeaves.length > 1 ? "s" : ""} waiting for approval
              </p>
              <Link to="/app/leaves" className="btn-primary text-sm w-full text-center block">
                Review Now
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
