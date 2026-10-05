import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { AttendanceControls } from "../../components/AttendanceControls";
import { PageHeader } from "../../components/shared/PageHeader";
import { Badge } from "../../components/shared/Badge";
import { getAttendanceHistory } from "../../services/attendanceService";
import { formatDuration, formatDate, formatClockTime } from "../../utils/helpers";
import type { Attendance } from "../../types";
import { CalendarClock, LogIn, LogOut, Coffee, UtensilsCrossed, TrendingUp } from "lucide-react";

export default function EmployeeAttendance() {
  const { user } = useAuth();
  const [history, setHistory] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getAttendanceHistory(user.id, 30).then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, [user]);

  const totalWorking = history.reduce((sum, r) => sum + (r.working_seconds || 0), 0);
  const totalOvertime = history.reduce((sum, r) => sum + (r.overtime_seconds || 0), 0);
  const presentDays = history.filter((r) => r.status === "present" && r.check_in_at).length;
  const lateDays = history.filter((r) => r.late_login).length;

  return (
    <div>
      <PageHeader
        title="My Attendance"
        subtitle="Track your daily attendance and working hours"
        icon={<CalendarClock className="w-5 h-5" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <AttendanceControls />
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{presentDays}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Present Days</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{lateDays}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Late Logins</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDuration(totalWorking)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Working</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 flex items-center justify-center">
                <Coffee className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDuration(totalOvertime)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Overtime</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">Attendance History (Last 30 days)</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No attendance records yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Check In</th>
                  <th className="text-left p-3 font-medium">Check Out</th>
                  <th className="text-left p-3 font-medium">Working</th>
                  <th className="text-left p-3 font-medium">Break</th>
                  <th className="text-left p-3 font-medium">Lunch</th>
                  <th className="text-left p-3 font-medium">Overtime</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="p-3 text-slate-900 dark:text-white">{formatDate(r.attendance_date)}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {r.check_in_at ? formatClockTime(r.check_in_at) : "-"}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {r.check_out_at ? formatClockTime(r.check_out_at) : "-"}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatDuration(r.working_seconds || 0)}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatDuration(r.break_seconds || 0)}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatDuration(r.lunch_seconds || 0)}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatDuration(r.overtime_seconds || 0)}
                    </td>
                    <td className="p-3">
                      {r.late_login ? (
                        <Badge variant="warning">Late</Badge>
                      ) : r.check_in_at ? (
                        <Badge variant="success">Present</Badge>
                      ) : (
                        <Badge variant="default">-</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
