import { useState, useEffect } from "react";
import Papa from "papaparse";
import { PageHeader } from "../../components/shared/PageHeader";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import { downloadFile, formatDate, formatClockTime, formatDuration } from "../../utils/helpers";
import {
  FDT_STATUS_LABELS,
  FDT_PRIORITY_LABELS,
} from "../../utils/constants";
import type { Profile, DailyFixedTask } from "../../types";
import { FileText, Download, FileSpreadsheet, FileType, BarChart3, Calendar, CheckSquare, Users } from "lucide-react";

type FdtReportType = "today" | "employee_performance" | "daily_completion";

export default function FixedTaskReports() {
  const [activeReport, setActiveReport] = useState<FdtReportType>("today");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    supabase.from("profiles").select("*").eq("role", "mis_employee").then(({ data }) => {
      setEmployees((data ?? []) as Profile[]);
    });
  }, []);

  const reportConfig: Record<FdtReportType, { title: string; icon: typeof FileText; columns: string[] }> = {
    today: {
      title: "Today's Task Report",
      icon: Calendar,
      columns: ["employee_id", "employee", "category", "report_name", "type", "working_type", "shift", "priority", "status", "start_time", "completed_time", "duration", "remarks"],
    },
    employee_performance: {
      title: "Employee Performance Report",
      icon: Users,
      columns: ["employee_id", "employee", "total_tasks", "completed", "wip", "open", "hold", "pending", "completion_rate"],
    },
    daily_completion: {
      title: "Daily Completion Report",
      icon: BarChart3,
      columns: ["date", "total_tasks", "completed", "wip", "open", "hold", "pending", "cancelled", "completion_rate"],
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

    let rows: Record<string, unknown>[] = [];
    const { data: records } = await supabase
      .from("daily_fixed_tasks")
      .select("*")
      .gte("task_date", dateRange.start)
      .lte("task_date", dateRange.end)
      .order("task_date", { ascending: false });

    const allTasks = (records ?? []) as DailyFixedTask[];

    if (activeReport === "today") {
      const today = new Date().toISOString().split("T")[0];
      rows = allTasks
        .filter((t) => t.task_date === today)
        .map((t) => ({
          employee_id: empMap.get(t.assigned_to ?? "")?.employee_id || "-",
          employee: empMap.get(t.assigned_to ?? "")?.full_name || "Unassigned",
          category: t.category,
          report_name: t.report_name,
          type: t.type,
          working_type: t.working_type,
          shift: t.shift,
          priority: FDT_PRIORITY_LABELS[t.priority],
          status: FDT_STATUS_LABELS[t.status],
          start_time: t.start_time ? formatClockTime(t.start_time) : "-",
          completed_time: t.completed_time ? formatClockTime(t.completed_time) : "-",
          duration: t.duration_seconds > 0 ? formatDuration(t.duration_seconds) : "-",
          remarks: t.remarks || "-",
        }));
    } else if (activeReport === "employee_performance") {
      const byEmp = new Map<string, { total: number; completed: number; wip: number; open: number; hold: number; pending: number }>();
      allTasks.forEach((t) => {
        const uid = t.assigned_to ?? "unassigned";
        const cur = byEmp.get(uid) || { total: 0, completed: 0, wip: 0, open: 0, hold: 0, pending: 0 };
        cur.total++;
        if (t.status === "completed") cur.completed++;
        else if (t.status === "wip") cur.wip++;
        else if (t.status === "open") cur.open++;
        else if (t.status === "hold") cur.hold++;
        else if (t.status === "pending") cur.pending++;
        byEmp.set(uid, cur);
      });
      employees.forEach((emp) => {
        const s = byEmp.get(emp.id) || { total: 0, completed: 0, wip: 0, open: 0, hold: 0, pending: 0 };
        rows.push({
          employee_id: emp.employee_id || "-",
          employee: emp.full_name,
          total_tasks: s.total,
          completed: s.completed,
          wip: s.wip,
          open: s.open,
          hold: s.hold,
          pending: s.pending,
          completion_rate: s.total > 0 ? `${Math.round((s.completed / s.total) * 100)}%` : "0%",
        });
      });
    } else if (activeReport === "daily_completion") {
      const byDate = new Map<string, { total: number; completed: number; wip: number; open: number; hold: number; pending: number; cancelled: number }>();
      allTasks.forEach((t) => {
        const cur = byDate.get(t.task_date) || { total: 0, completed: 0, wip: 0, open: 0, hold: 0, pending: 0, cancelled: 0 };
        cur.total++;
        if (t.status === "completed") cur.completed++;
        else if (t.status === "wip") cur.wip++;
        else if (t.status === "open") cur.open++;
        else if (t.status === "hold") cur.hold++;
        else if (t.status === "pending") cur.pending++;
        else if (t.status === "cancelled") cur.cancelled++;
        byDate.set(t.task_date, cur);
      });
      rows = Array.from(byDate.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, s]) => ({
          date: formatDate(date),
          total_tasks: s.total,
          completed: s.completed,
          wip: s.wip,
          open: s.open,
          hold: s.hold,
          pending: s.pending,
          cancelled: s.cancelled,
          completion_rate: s.total > 0 ? `${Math.round((s.completed / s.total) * 100)}%` : "0%",
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
    downloadFile(csv, `fixed_tasks_${activeReport}_report.csv`, "text/csv");
    showToast("success", "CSV exported successfully");
  };

  const exportExcel = () => {
    if (data.length === 0) {
      showToast("warning", "No data to export. Load the report first.");
      return;
    }
    const headers = Object.keys(data[0]);
    const html = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadFile(html, `fixed_tasks_${activeReport}_report.xls`, "application/vnd.ms-excel");
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
        doc.save(`fixed_tasks_${activeReport}_report.pdf`);
        showToast("success", "PDF exported successfully");
      });
    });
  };

  const config = reportConfig[activeReport];

  return (
    <div>
      <PageHeader
        title="Fixed Task Reports"
        subtitle="Generate and export fixed task reports"
        icon={<FileText className="w-5 h-5" />}
      />

      {/* Report type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {(Object.keys(reportConfig) as FdtReportType[]).map((type) => {
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
