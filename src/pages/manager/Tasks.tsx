import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/shared/Modal";
import { Avatar } from "../../components/shared/Avatar";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_STATUS_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "../../utils/constants";
import { formatDate } from "../../utils/helpers";
import type { Task, TaskStatus, Priority, Profile } from "../../types";
import { CheckSquare, Plus, Search, Calendar } from "lucide-react";

export default function ManagerTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    priority: "medium" as Priority,
    due_date: "",
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const [tasksRes, empRes] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "mis_employee"),
    ]);
    setTasks((tasksRes.data ?? []) as Task[]);
    setEmployees((empRes.data ?? []) as Profile[]);
    setLoading(false);
  };

  const filtered = tasks.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchEmp = filterEmployee === "all" || t.assigned_to === filterEmployee;
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchEmp && matchStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim() || !form.assigned_to) {
      showToast("warning", "Please fill title and assign to an employee");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("tasks").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to,
      assigned_by: user.id,
      status: "open",
      priority: form.priority,
      due_date: form.due_date || null,
    });

    if (error) {
      showToast("error", "Failed to create task");
    } else {
      // Notify employee
      await supabase.from("notifications").insert({
        user_id: form.assigned_to,
        title: "New Task Assigned",
        message: form.title.trim(),
        type: "task",
        link: "/app/tasks",
      });
      showToast("success", "Task assigned successfully");
      setShowModal(false);
      setForm({ title: "", description: "", assigned_to: "", priority: "medium", due_date: "" });
      loadData();
    }
    setSubmitting(false);
  };

  const getEmployee = (id: string) => employees.find((e) => e.id === id);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Assign and manage tasks for your team"
        icon={<CheckSquare className="w-5 h-5" />}
        actions={
          <button
            onClick={() => setShowModal(true)}
            disabled={employees.length === 0}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Assign Task
          </button>
        }
      />

      {employees.length === 0 && (
        <div className="card p-4 mb-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            You need to add employees before assigning tasks.{" "}
            <Link to="/app/employees" className="underline font-medium">Add employees →</Link>
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-11"
            placeholder="Search tasks..."
          />
        </div>
        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          className="input-field sm:w-48"
        >
          <option value="all">All Employees</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
          className="input-field sm:w-44"
        >
          <option value="all">All Statuses</option>
          {TASK_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckSquare className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No tasks found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task, i) => {
            const emp = getEmployee(task.assigned_to);
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`badge ${TASK_STATUS_COLORS[task.status]}`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      <span className={`badge ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.due_date && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-slate-900 dark:text-white">{task.title}</h3>
                    {task.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{task.description}</p>
                    )}
                    {emp && (
                      <div className="flex items-center gap-2 mt-3">
                        <Avatar name={emp.full_name} src={emp.avatar_url} size="xs" />
                        <span className="text-xs text-slate-500 dark:text-slate-400">{emp.full_name}{emp.employee_id ? ` • ${emp.employee_id}` : ""}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Assign New Task" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text">Task Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input-field"
              placeholder="e.g., Prepare monthly sales report"
              required
            />
          </div>
          <div>
            <label className="label-text">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field min-h-[80px]"
              placeholder="Describe the task..."
            />
          </div>
          <div>
            <label className="label-text">Assign To *</label>
            <select
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className="input-field"
              required
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.full_name}{emp.employee_id ? ` (${emp.employee_id})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                className="input-field"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label-text">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Assigning..." : "Assign Task"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
