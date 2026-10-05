import { useState, useEffect } from "react";
import Papa from "papaparse";
import { PageHeader } from "../../components/shared/PageHeader";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import { downloadFile, formatDate, formatDuration, formatClockTime } from "../../utils/helpers";
import { TASK_STATUS_LABELS, LEAVE_STATUS_LABELS } from "../../utils/constants";
import type { Profile, Attendance, Task, Leave } from "../../types";
import { FileText, Download, FileSpreadsheet, FileType, BarChart3, Users, Calendar, CheckSquare, Plane } from "lucide-react";

type ReportType = "attendance" | "working_hours" | "productivity" | "tasks" | "leaves";

export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>("attendance");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    supabase.from("profiles").select("*").eq("role", "mis_employee").then(({ data }) => {
      setEmployees((data ?? []) as Profile[]);
    });
  }, []);

  const reportConfig: Record<ReportType, { title: string; icon: typeof FileText; columns: string[] }> = {
    attendance: {
      title: "Attendance Report",
      icon: Calendar,
      columns: ["employee", "date", "check_in", "check_out", "working_hours", "break", "lunch", "overtime", "late", "status"],
    },
    working_hours: {
      title: "Working Hours Report",
      icon: BarChart3,
      columns: ["employee", "total_working", "total_overtime", "total_break", "total_lunch", "days_present", "late_days"],
    },
    productivity: {
      title: "Employee Productivity Report",
      icon: Users,
      columns: ["employee", "total_tasks", "completed", "pending", "completion_rate", "avg_working_hours"],
    },
    tasks: {
      title: "Task Report",
      icon: CheckSquare,
      columns: ["title", "assigned_to", "assigned_by", "status", "priority", "due_date", "created_at", "completed_at"],
    },
    leaves: {
      title: "Leave Report",
      icon: Plane,
      columns: ["employee", "type", "start_date", "end_date", "reason", "status", "applied_date"],
    },
  };

  const loadReport = async () => {
    setLoading(true);
    const empMap = new Map<string, Profile>();

    if (employees.length === 0) {
      const { data: empData } = await supabase.from("profiles").select("*").eq("role", "mis_employee");
      (empData ?? []).forEach((e) => empMap.set(e.id, e as Profile));
      setEmployees((empData ?? []) as Profile[]);
    } else {
      employees.forEach((e) => empMap.set(e.id, e));
    }

    // Also get manager for task report
    const { data: mgrData } = await supabase.from("profiles").select("*").eq("role", "manager").maybeSingle();
    if (mgrData) empMap.set(mgrData.id, mgrData as Profile);

    let rows: Record<string, unknown>[] = [];

    if (activeReport === "attendance") {
      const { data: records } = await supabase
        .from("attendance")
        .select("*")
        .gte("attendance_date", dateRange.start)
        .lte("attendance_date", dateRange.end)
        .order("attendance_date", { ascending: false });
      rows = (records ?? []).map((r: Attendance) => ({
        employee_id: empMap.get(r.user_id)?.employee_id || "-",
        employee: empMap.get(r.user_id)?.full_name || "Unknown",
        date: formatDate(r.attendance_date),
        check_in: r.check_in_at ? formatClockTime(r.check_in_at) : "-",
        check_out: r.check_out_at ? formatClockTime(r.check_out_at) : "-",
        working_hours: formatDuration(r.working_seconds || 0),
        break: formatDuration(r.break_seconds || 0),
        lunch: formatDuration(r.lunch_seconds || 0),
        overtime: formatDuration(r.overtime_seconds || 0),
        late: r.late_login ? "Yes" : "No",
        status: r.check_in_at ? "Present" : "Absent",
      }));
    } else if (activeReport === "working_hours") {
      const { data: records } = await supabase
        .from("attendance")
        .select("*")
        .gte("attendance_date", dateRange.start)
        .lte("attendance_date", dateRange.end);
      const byEmp = new Map<string, { working: number; overtime: number; break: number; lunch: number; days: number; late: number }>();
      (records ?? []).forEach((r: Attendance) => {
        const cur = byEmp.get(r.user_id) || { working: 0, overtime: 0, break: 0, lunch: 0, days: 0, late: 0 };
        cur.working += r.working_seconds || 0;
        cur.overtime += r.overtime_seconds || 0;
        cur.break += r.break_seconds || 0;
        cur.lunch += r.lunch_seconds || 0;
        if (r.check_in_at) cur.days++;
        if (r.late_login) cur.late++;
        byEmp.set(r.user_id, cur);
      });
      rows = Array.from(byEmp.entries()).map(([uid, v]) => ({
        employee_id: empMap.get(uid)?.employee_id || "-",
        employee: empMap.get(uid)?.full_name || "Unknown",
        total_working: formatDuration(v.working),
        total_overtime: formatDuration(v.overtime),
        total_break: formatDuration(v.break),
        total_lunch: formatDuration(v.lunch),
        days_present: v.days,
        late_days: v.late,
      }));
    } else if (activeReport === "productivity") {
      const { data: tasks } = await supabase.from("tasks").select("*");
      const { data: att } = await supabase
        .from("attendance")
        .select("*")
        .gte("attendance_date", dateRange.start)
        .lte("attendance_date", dateRange.end);
      const taskByEmp = new Map<string, { total: number; completed: number }>();
      const attByEmp = new Map<string, { total: number; days: number }>();
      (tasks ?? []).forEach((t: Task) => {
        const cur = taskByEmp.get(t.assigned_to) || { total: 0, completed: 0 };
        cur.total++;
        if (t.status === "completed") cur.completed++;
        taskByEmp.set(t.assigned_to, cur);
      });
      (att ?? []).forEach((a: Attendance) => {
        const cur = attByEmp.get(a.user_id) || { total: 0, days: 0 };
        cur.total += a.working_seconds || 0;
        if (a.check_in_at) cur.days++;
        attByEmp.set(a.user_id, cur);
      });
      employees.forEach((emp) => {
        const t = taskByEmp.get(emp.id) || { total: 0, completed: 0 };
        const a = attByEmp.get(emp.id) || { total: 0, days: 0 };
        rows.push({
          employee_id: emp.employee_id || "-",
          employee: emp.full_name,
          total_tasks: t.total,
          completed: t.completed,
          pending: t.total - t.completed,
          completion_rate: t.total > 0 ? `${Math.round((t.completed / t.total) * 100)}%` : "0%",
          avg_working_hours: a.days > 0 ? formatDuration(Math.floor(a.total / a.days)) : "0",
        });
      });
    } else if (activeReport === "tasks") {
      const { data: tasks } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      rows = (tasks ?? []).map((t: Task) => ({
        title: t.title,
        assigned_to: empMap.get(t.assigned_to)?.full_name || "Unknown",
        assigned_by: empMap.get(t.assigned_by)?.full_name || "Manager",
        status: TASK_STATUS_LABELS[t.status],
        priority: t.priority,
        due_date: t.due_date ? formatDate(t.due_date) : "-",
        created_at: formatDate(t.created_at),
        completed_at: t.completed_at ? formatDate(t.completed_at) : "-",
      }));
    } else if (activeReport === "leaves") {
      const { data: leaves } = await supabase.from("leaves").select("*").order("created_at", { ascending: false });
      rows = (leaves ?? []).map((l: Leave) => ({
        employee_id: empMap.get(l.user_id)?.employee_id || "-",
        employee: empMap.get(l.user_id)?.full_name || "Unknown",
        type: l.leave_type,
        start_date: formatDate(l.start_date),
        end_date: formatDate(l.end_date),
        reason: l.reason || "-",
        status: LEAVE_STATUS_LABELS[l.status],
        applied_date: formatDate(l.created_at),
      }));
    }

    setData(rows);
    setLoading(false);
  };

  const exportCSV = () => {
    if (data.length === 0) {
      showToast("warning", "No data to export. Load the report first.");
      return;
    }
    const csv = Papa.unparse(data);
    downloadFile(csv, `${activeReport}_report.csv`, "text/csv");
    showToast("success", "CSV exported successfully");
  };

  const exportExcel = () => {
    if (data.length === 0) {
      showToast("warning", "No data to export. Load the report first.");
      return;
    }
    // Create an HTML table that Excel can open
    const headers = Object.keys(data[0]);
    const html = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadFile(html, `${activeReport}_report.xls`, "application/vnd.ms-excel");
    showToast("success", "Excel exported successfully");
  };

  const exportPDF = () => {
    if (data.length === 0) {
      showToast("warning", "No data to export. Load the report first.");
      return;
    }
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(() => {
        const doc = new jsPDF();
        const headers = Object.keys(data[0]);
        const rows = data.map((row) => headers.map((h) => String(row[h] ?? "")));
        doc.setFontSize(16);
        doc.text(reportConfig[activeReport].title, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${formatDate(new Date())}`, 14, 27);
        doc.setFontSize(8);
        doc.text(`Period: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`, 14, 32);
        (doc as unknown as { autoTable: (config: unknown) => void }).autoTable({
          head: [headers],
          body: rows,
          startY: 38,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [14, 165, 233], textColor: 255 },
          alternateRowStyles: { fillColor: [240, 249, 255] },
        });
        doc.save(`${activeReport}_report.pdf`);
        showToast("success", "PDF exported successfully");
      });
    });
  };

  const config = reportConfig[activeReport];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Generate and export detailed reports"
        icon={<FileText className="w-5 h-5" />}
      />

      {/* Report type selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {(Object.keys(reportConfig) as ReportType[]).map((type) => {
          const cfg = reportConfig[type];
          return (
            <button
              key={type}
              onClick={() => {
                setActiveReport(type);
                setData([]);
              }}
              className={`card p-4 text-center transition-all ${
                activeReport === type ? "ring-2 ring-primary-500 border-primary-500" : "hover:shadow-md"
              }`}
            >
              <cfg.icon className={`w-6 h-6 mx-auto mb-2 ${activeReport === type ? "text-primary-600" : "text-slate-400"}`} />
              <p className={`text-xs font-medium ${activeReport === type ? "text-primary-600" : "text-slate-500 dark:text-slate-400"}`}>
                {cfg.title}
              </p>
            </button>
          );
        })}
      </div>

      {/* Date range and actions */}
      <div className="card p-5 mb-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <button onClick={loadReport} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            Generate Report
          </button>
        </div>
      </div>

      {/* Export buttons */}
      {data.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button onClick={exportCSV} className="btn-secondary text-sm flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button onClick={exportExcel} className="btn-secondary text-sm flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
          <button onClick={exportPDF} className="btn-secondary text-sm flex items-center gap-2">
            <FileType className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      )}

      {/* Report table */}
      {data.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white">{config.title}</h3>
            <p className="text-sm text-slate-400">{data.length} records</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  {Object.keys(data[0]).map((col) => (
                    <th key={col} className="text-left p-3 font-medium whitespace-nowrap">
                      {col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="p-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
