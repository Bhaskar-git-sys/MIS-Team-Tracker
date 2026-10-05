import { useState } from "react";
import Papa from "papaparse";
import { PageHeader } from "../../components/shared/PageHeader";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import { downloadFile, formatDate, formatDuration } from "../../utils/helpers";
import { TASK_STATUS_LABELS, LEAVE_STATUS_LABELS } from "../../utils/constants";
import { useAuth } from "../../contexts/AuthContext";
import type { Attendance, Task, Leave } from "../../types";
import { FileText, Download, FileSpreadsheet, FileType, BarChart3 } from "lucide-react";

type ReportType = "attendance" | "tasks" | "leaves";

export default function EmployeeReports() {
  const { user } = useAuth();
  const [activeReport, setActiveReport] = useState<ReportType>("attendance");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  const reportConfig: Record<ReportType, { title: string; icon: typeof FileText }> = {
    attendance: { title: "My Attendance", icon: FileText },
    tasks: { title: "My Tasks", icon: BarChart3 },
    leaves: { title: "My Leaves", icon: FileText },
  };

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    let rows: Record<string, unknown>[] = [];

    if (activeReport === "attendance") {
      const { data: records } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user.id)
        .gte("attendance_date", dateRange.start)
        .lte("attendance_date", dateRange.end)
        .order("attendance_date", { ascending: false });
      rows = (records ?? []).map((r: Attendance) => ({
        date: formatDate(r.attendance_date),
        check_in: r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
        check_out: r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-",
        working_hours: formatDuration(r.working_seconds || 0),
        overtime: formatDuration(r.overtime_seconds || 0),
        late: r.late_login ? "Yes" : "No",
        status: r.check_in_at ? "Present" : "Absent",
      }));
    } else if (activeReport === "tasks") {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id)
        .order("created_at", { ascending: false });
      rows = (tasks ?? []).map((t: Task) => ({
        title: t.title,
        status: TASK_STATUS_LABELS[t.status],
        priority: t.priority,
        due_date: t.due_date ? formatDate(t.due_date) : "-",
        created: formatDate(t.created_at),
        completed: t.completed_at ? formatDate(t.completed_at) : "-",
      }));
    } else if (activeReport === "leaves") {
      const { data: leaves } = await supabase
        .from("leaves")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      rows = (leaves ?? []).map((l: Leave) => ({
        type: l.leave_type,
        start: formatDate(l.start_date),
        end: formatDate(l.end_date),
        reason: l.reason || "-",
        status: LEAVE_STATUS_LABELS[l.status],
        applied: formatDate(l.created_at),
      }));
    }

    setData(rows);
    setLoading(false);
  };

  const exportCSV = () => {
    if (data.length === 0) { showToast("warning", "Load the report first"); return; }
    downloadFile(Papa.unparse(data), `${activeReport}_report.csv`, "text/csv");
    showToast("success", "CSV exported");
  };

  const exportExcel = () => {
    if (data.length === 0) { showToast("warning", "Load the report first"); return; }
    const headers = Object.keys(data[0]);
    const html = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadFile(html, `${activeReport}_report.xls`, "application/vnd.ms-excel");
    showToast("success", "Excel exported");
  };

  const exportPDF = () => {
    if (data.length === 0) { showToast("warning", "Load the report first"); return; }
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(() => {
        const doc = new jsPDF();
        const headers = Object.keys(data[0]);
        const rows = data.map((row) => headers.map((h) => String(row[h] ?? "")));
        doc.setFontSize(16);
        doc.text(reportConfig[activeReport].title, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${formatDate(new Date())}`, 14, 27);
        (doc as unknown as { autoTable: (config: unknown) => void }).autoTable({
          head: [headers],
          body: rows,
          startY: 33,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [14, 165, 233], textColor: 255 },
        });
        doc.save(`${activeReport}_report.pdf`);
        showToast("success", "PDF exported");
      });
    });
  };

  return (
    <div>
      <PageHeader title="My Reports" subtitle="View and export your reports" icon={<FileText className="w-5 h-5" />} />

      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.keys(reportConfig) as ReportType[]).map((type) => {
          const cfg = reportConfig[type];
          return (
            <button
              key={type}
              onClick={() => { setActiveReport(type); setData([]); }}
              className={`card p-4 text-center transition-all ${activeReport === type ? "ring-2 ring-primary-500 border-primary-500" : "hover:shadow-md"}`}
            >
              <cfg.icon className={`w-6 h-6 mx-auto mb-2 ${activeReport === type ? "text-primary-600" : "text-slate-400"}`} />
              <p className={`text-xs font-medium ${activeReport === type ? "text-primary-600" : "text-slate-500"}`}>{cfg.title}</p>
            </button>
          );
        })}
      </div>

      <div className="card p-5 mb-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Start Date</label>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="label-text">End Date</label>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="input-field" />
            </div>
          </div>
          <button onClick={loadReport} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>

      {data.length > 0 && (
        <>
          <div className="flex gap-2 mb-4">
            <button onClick={exportCSV} className="btn-secondary text-sm flex items-center gap-2"><Download className="w-4 h-4" />CSV</button>
            <button onClick={exportExcel} className="btn-secondary text-sm flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Excel</button>
            <button onClick={exportPDF} className="btn-secondary text-sm flex items-center gap-2"><FileType className="w-4 h-4" />PDF</button>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
                  <tr>
                    {Object.keys(data[0]).map((col) => (
                      <th key={col} className="text-left p-3 font-medium whitespace-nowrap">{col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="p-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
