import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "../../components/shared/PageHeader";
import { Avatar } from "../../components/shared/Avatar";
import { Badge } from "../../components/shared/Badge";
import { supabase } from "../../services/supabaseClient";
import { getAllTodayAttendance, computeLiveWorkingSeconds } from "../../services/attendanceService";
import { formatDuration, formatDate, formatClockTime } from "../../utils/helpers";
import type { Profile, Attendance } from "../../types";
import { CalendarClock, LogIn, LogOut, Coffee, UtensilsCrossed } from "lucide-react";

export default function ManagerAttendance() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<Profile | null>(null);
  const [liveSeconds, setLiveSeconds] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveSeconds((prev) => {
        const updated: Record<string, number> = {};
        todayAttendance.forEach((a) => {
          if (a.check_in_at && !a.check_out_at) {
            updated[a.user_id] = computeLiveWorkingSeconds(a);
          }
        });
        return { ...prev, ...updated };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [todayAttendance]);

  const loadData = async () => {
    setLoading(true);
    const [empRes, today, histRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "mis_employee"),
      getAllTodayAttendance(),
      supabase
        .from("attendance")
        .select("*")
        .order("attendance_date", { ascending: false })
        .limit(100),
    ]);
    setEmployees((empRes.data ?? []) as Profile[]);
    setTodayAttendance(today);
    setHistory((histRes.data ?? []) as Attendance[]);
    setLoading(false);
  };

  const getTodayRecord = (userId: string) => todayAttendance.find((a) => a.user_id === userId);

  return (
    <div>
      <PageHeader
        title="Attendance Monitoring"
        subtitle="Monitor your team's attendance in real-time"
        icon={<CalendarClock className="w-5 h-5" />}
      />

      {/* Today's attendance */}
      <div className="card overflow-hidden mb-6">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">Today's Attendance</h3>
          <p className="text-sm text-slate-400">{formatDate(new Date())}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No employees to monitor</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="text-left p-3 font-medium">Employee</th>
                  <th className="text-left p-3 font-medium">Check In</th>
                  <th className="text-left p-3 font-medium">Check Out</th>
                  <th className="text-left p-3 font-medium">Working</th>
                  <th className="text-left p-3 font-medium">Break</th>
                  <th className="text-left p-3 font-medium">Lunch</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((emp) => {
                  const rec = getTodayRecord(emp.id);
                  const isPresent = rec?.check_in_at && !rec?.check_out_at;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={emp.full_name} src={emp.avatar_url} size="sm" />
                          <div className="flex flex-col">
                            <span className="text-slate-900 dark:text-white font-medium">{emp.full_name}</span>
                            {emp.employee_id && (
                              <span className="text-xs text-slate-400">{emp.employee_id}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {rec?.check_in_at ? formatClockTime(rec.check_in_at) : "-"}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {rec?.check_out_at ? formatClockTime(rec.check_out_at) : "-"}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {isPresent
                          ? formatDuration(liveSeconds[emp.id] || rec?.working_seconds || 0)
                          : formatDuration(rec?.working_seconds || 0)}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {formatDuration(rec?.break_seconds || 0)}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {formatDuration(rec?.lunch_seconds || 0)}
                      </td>
                      <td className="p-3">
                        {!rec?.check_in_at ? (
                          <Badge variant="default">Absent</Badge>
                        ) : rec?.check_out_at ? (
                          <Badge variant="info">Checked out</Badge>
                        ) : rec?.break_start_at && !rec?.break_end_at ? (
                          <Badge variant="warning">On Break</Badge>
                        ) : rec?.lunch_start_at && !rec?.lunch_end_at ? (
                          <Badge variant="warning">On Lunch</Badge>
                        ) : (
                          <Badge variant="success">Working</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">Recent Attendance History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="text-left p-3 font-medium">Employee</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Check In</th>
                <th className="text-left p-3 font-medium">Check Out</th>
                <th className="text-left p-3 font-medium">Working</th>
                <th className="text-left p-3 font-medium">Overtime</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.slice(0, 30).map((rec) => {
                const emp = employees.find((e) => e.id === rec.user_id);
                if (!emp) return null;
                return (
                  <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="p-3 text-slate-900 dark:text-white">
                      <div>{emp.full_name}</div>
                      {emp.employee_id && (
                        <div className="text-xs text-slate-400">{emp.employee_id}</div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(rec.attendance_date)}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {rec.check_in_at ? formatClockTime(rec.check_in_at) : "-"}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {rec.check_out_at ? formatClockTime(rec.check_out_at) : "-"}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatDuration(rec.working_seconds || 0)}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatDuration(rec.overtime_seconds || 0)}
                    </td>
                    <td className="p-3">
                      {rec.late_login ? <Badge variant="warning">Late</Badge> : rec.check_in_at ? <Badge variant="success">Present</Badge> : <Badge variant="default">-</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
