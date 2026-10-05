import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/shared/Modal";
import { Badge } from "../../components/shared/Badge";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from "../../utils/constants";
import { formatDate } from "../../utils/helpers";
import type { Leave, LeaveType, Profile } from "../../types";
import { Calendar, Plus, Clock } from "lucide-react";

export default function EmployeeLeaves() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [manager, setManager] = useState<Profile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leave_type: "casual" as LeaveType,
    start_date: "",
    end_date: "",
    reason: "",
  });

  useEffect(() => {
    loadLeaves();
  }, [user]);

  const loadLeaves = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("leaves")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLeaves((data ?? []) as Leave[]);

    const { data: mgr } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "manager")
      .maybeSingle();
    setManager(mgr as Profile | null);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.start_date || !form.end_date || !form.reason.trim()) {
      showToast("warning", "Please fill all fields");
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      showToast("warning", "End date must be after start date");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("leaves").insert({
      user_id: user.id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim(),
      status: "pending",
    });

    if (error) {
      showToast("error", "Failed to apply for leave");
    } else {
      // Notify manager
      if (manager) {
        await supabase.from("notifications").insert({
          user_id: manager.id,
          title: "New Leave Request",
          message: `${user.email} applied for ${form.leave_type} leave`,
          type: "leave",
          link: "/app/leaves",
        });
      }
      // Log activity
      await supabase.from("activities").insert({
        user_id: user.id,
        type: "leave_apply",
        description: `Applied for ${form.leave_type} leave`,
      });
      showToast("success", "Leave request submitted successfully");
      setShowModal(false);
      setForm({ leave_type: "casual", start_date: "", end_date: "", reason: "" });
      loadLeaves();
    }
    setSubmitting(false);
  };

  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;

  return (
    <div>
      <PageHeader
        title="Apply Leave"
        subtitle="Submit and track your leave requests"
        icon={<Calendar className="w-5 h-5" />}
        actions={
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Apply Leave
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{leaves.length}</p>
          <p className="text-xs text-slate-400 mt-1">Total Requests</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
          <p className="text-xs text-slate-400 mt-1">Pending</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{approvedCount}</p>
          <p className="text-xs text-slate-400 mt-1">Approved</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : leaves.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No leave requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave, i) => (
            <motion.div
              key={leave.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 capitalize">
                      {leave.leave_type} Leave
                    </span>
                    <span className={`badge ${LEAVE_STATUS_COLORS[leave.status]}`}>
                      {LEAVE_STATUS_LABELS[leave.status]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {formatDate(leave.start_date)} - {formatDate(leave.end_date)}
                  </p>
                  {leave.reason && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{leave.reason}</p>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Applied {formatDate(leave.created_at)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Apply for Leave">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text">Leave Type</label>
            <select
              value={form.leave_type}
              onChange={(e) => setForm({ ...form, leave_type: e.target.value as LeaveType })}
              className="input-field"
            >
              <option value="casual">Casual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="earned">Earned Leave</option>
              <option value="unpaid">Unpaid Leave</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="input-field"
                min={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
            <div>
              <label className="label-text">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="input-field"
                min={form.start_date || new Date().toISOString().split("T")[0]}
                required
              />
            </div>
          </div>
          <div>
            <label className="label-text">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input-field min-h-[100px]"
              placeholder="Explain the reason for your leave..."
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
