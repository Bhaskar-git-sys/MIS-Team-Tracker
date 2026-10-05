import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "../../components/shared/PageHeader";
import { Avatar } from "../../components/shared/Avatar";
import { Badge } from "../../components/shared/Badge";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from "../../utils/constants";
import { formatDate } from "../../utils/helpers";
import type { Leave, Profile } from "../../types";
import { Calendar, Check, X, Clock } from "lucide-react";

export default function ManagerLeaves() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadLeaves();
  }, []);

  const loadLeaves = async () => {
    setLoading(true);
    const [leavesRes, empRes] = await Promise.all([
      supabase.from("leaves").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "mis_employee"),
    ]);
    setLeaves((leavesRes.data ?? []) as Leave[]);
    setEmployees((empRes.data ?? []) as Profile[]);
    setLoading(false);
  };

  const getEmployee = (id: string) => employees.find((e) => e.id === id);

  const handleApprove = async (leave: Leave) => {
    setProcessing(leave.id);
    const { error } = await supabase
      .from("leaves")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave.id);

    if (error) {
      showToast("error", "Failed to approve leave");
    } else {
      // Notify employee
      await supabase.from("notifications").insert({
        user_id: leave.user_id,
        title: "Leave Approved",
        message: `Your ${leave.leave_type} leave from ${formatDate(leave.start_date)} to ${formatDate(leave.end_date)} has been approved`,
        type: "leave",
      });
      showToast("success", "Leave approved");
      loadLeaves();
    }
    setProcessing(null);
  };

  const handleReject = async (leave: Leave) => {
    setProcessing(leave.id);
    const { error } = await supabase
      .from("leaves")
      .update({
        status: "rejected",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave.id);

    if (error) {
      showToast("error", "Failed to reject leave");
    } else {
      await supabase.from("notifications").insert({
        user_id: leave.user_id,
        title: "Leave Rejected",
        message: `Your ${leave.leave_type} leave request has been rejected`,
        type: "leave",
      });
      showToast("success", "Leave rejected");
      loadLeaves();
    }
    setProcessing(null);
  };

  const filtered = filter === "all" ? leaves : leaves.filter((l) => l.status === filter);

  const counts = {
    pending: leaves.filter((l) => l.status === "pending").length,
    approved: leaves.filter((l) => l.status === "approved").length,
    rejected: leaves.filter((l) => l.status === "rejected").length,
  };

  return (
    <div>
      <PageHeader
        title="Leave Requests"
        subtitle="Review and approve employee leave requests"
        icon={<Calendar className="w-5 h-5" />}
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${
              filter === f
                ? "bg-primary-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f} ({f === "all" ? leaves.length : counts[f]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No leave requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((leave, i) => {
            const emp = getEmployee(leave.user_id);
            return (
              <motion.div
                key={leave.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    {emp && <Avatar name={emp.full_name} src={emp.avatar_url} size="md" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium text-slate-900 dark:text-white">
                          {emp?.full_name || "Unknown"}
                          {emp?.employee_id && (
                            <span className="text-xs font-normal text-slate-400 ml-1">({emp.employee_id})</span>
                          )}
                        </h3>
                        <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 capitalize">
                          {leave.leave_type}
                        </span>
                        <span className={`badge ${LEAVE_STATUS_COLORS[leave.status]}`}>
                          {LEAVE_STATUS_LABELS[leave.status]}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {formatDate(leave.start_date)} - {formatDate(leave.end_date)}
                      </p>
                      {leave.reason && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{leave.reason}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Applied {formatDate(leave.created_at)}
                      </p>
                    </div>
                  </div>

                  {leave.status === "pending" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApprove(leave)}
                        disabled={processing === leave.id}
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(leave)}
                        disabled={processing === leave.id}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
