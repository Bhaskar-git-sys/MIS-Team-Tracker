import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/shared/Modal";
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
import type { Task, TaskStatus, Priority } from "../../types";
import {
  CheckSquare,
  Plus,
  Search,
  Calendar,
  Pencil,
} from "lucide-react";

export default function EmployeeTasks() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] =
    useState<TaskStatus | "all">("all");

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as Priority,
    due_date: "",
  });

  useEffect(() => {
    if (user?.id) {
      loadTasks();
    }
  }, [user?.id]);

  const loadTasks = async () => {
    if (!user?.id) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error("Failed to load tasks:", error);

        showToast(
          "error",
          error.message || "Failed to load your tasks"
        );

        setTasks([]);
        return;
      }

      setTasks((data ?? []) as Task[]);
    } catch (error) {
      console.error("Task loading error:", error);

      showToast(
        "error",
        "Unable to load your tasks"
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      priority: "medium",
      due_date: "",
    });

    setEditingTask(null);
  };

  const openAddWork = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditWork = (task: Task) => {
    setEditingTask(task);

    setForm({
      title: task.title || "",
      description: task.description || "",
      priority: task.priority || "medium",
      due_date: task.due_date || "",
    });

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!user?.id) {
      showToast(
        "error",
        "User session not found"
      );
      return;
    }

    if (!form.title.trim()) {
      showToast(
        "warning",
        "Please enter a work title"
      );
      return;
    }

    setSubmitting(true);

    try {
      /*
       * EDIT EXISTING WORK
       */
      if (editingTask) {
        const { error } = await supabase
          .from("tasks")
          .update({
            title: form.title.trim(),
            description:
              form.description.trim() || null,
            priority: form.priority,
            due_date:
              form.due_date || null,
          })
          .eq("id", editingTask.id)
          .eq("assigned_to", user.id);

        if (error) {
          console.error(
            "Update task error:",
            error
          );

          showToast(
            "error",
            error.message ||
              "Failed to update work"
          );

          return;
        }

        showToast(
          "success",
          "Work updated successfully"
        );

        closeModal();
        await loadTasks();

        return;
      }

      /*
       * CREATE NEW WORK
       *
       * assigned_to = current employee
       * assigned_by = current employee
       *
       * This makes the work visible to Manager
       * through the same tasks table.
       */
      const { error } = await supabase
        .from("tasks")
        .insert({
          title: form.title.trim(),
          description:
            form.description.trim() || null,

          assigned_to: user.id,

          assigned_by: user.id,

          status: "open",

          priority: form.priority,

          due_date:
            form.due_date || null,
        });

      if (error) {
        console.error(
          "Create task error:",
          error
        );

        showToast(
          "error",
          error.message ||
            "Failed to add your work"
        );

        return;
      }

      showToast(
        "success",
        "Your work has been added successfully"
      );

      closeModal();

      await loadTasks();
    } catch (error) {
      console.error(
        "Task submit error:",
        error
      );

      showToast(
        "error",
        "Unable to save your work"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (
    task: Task,
    status: TaskStatus
  ) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from("tasks")
      .update({
        status,
      })
      .eq("id", task.id)
      .eq("assigned_to", user.id);

    if (error) {
      console.error(
        "Status update error:",
        error
      );

      showToast(
        "error",
        "Failed to update task status"
      );

      return;
    }

    showToast(
      "success",
      "Task status updated"
    );

    await loadTasks();
  };

  const filteredTasks = tasks.filter(
    (task) => {
      const searchValue =
        search.trim().toLowerCase();

      const matchesSearch =
        !searchValue ||
        task.title
          .toLowerCase()
          .includes(searchValue) ||
        task.description
          ?.toLowerCase()
          .includes(searchValue);

      const matchesStatus =
        filterStatus === "all" ||
        task.status === filterStatus;

      return (
        matchesSearch &&
        matchesStatus
      );
    }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Work"
        subtitle="Add and manage your daily work"
        icon={
          <CheckSquare className="w-5 h-5" />
        }
        actions={
          <button
            type="button"
            onClick={openAddWork}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add My Work
          </button>
        }
      />

      {/* FILTERS */}

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              className="input-field pl-11"
              placeholder="Search my work..."
            />
          </div>

          <select
            value={filterStatus}
            onChange={(event) =>
              setFilterStatus(
                event.target.value as
                  | TaskStatus
                  | "all"
              )
            }
            className="input-field sm:w-48"
          >
            <option value="all">
              All Statuses
            </option>

            {TASK_STATUS_OPTIONS.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {
                    TASK_STATUS_LABELS[
                      status
                    ]
                  }
                </option>
              )
            )}
          </select>
        </div>
      </div>

      {/* TASK LIST */}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckSquare className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />

          <p className="text-slate-500 dark:text-slate-400">
            No work found
          </p>

          <button
            type="button"
            onClick={openAddWork}
            className="btn-primary mt-4"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Add My Work
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map(
            (task, index) => (
              <motion.div
                key={task.id}
                initial={{
                  opacity: 0,
                  y: 15,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay: index * 0.03,
                }}
                className="card p-5"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span
                        className={`badge ${
  TASK_STATUS_COLORS[
    task.status
  ]
} `}
                      >
                        {
                          TASK_STATUS_LABELS[
                            task.status
                          ]
                        }
                      </span>

                      <span
                        className={`badge ${
  PRIORITY_COLORS[
    task.priority
  ]
} `}
                      >
                        {
                          PRIORITY_LABELS[
                            task.priority
                          ]
                        }
                      </span>

                      {task.due_date && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />

                          {formatDate(
                            task.due_date
                          )}
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {task.title}
                    </h3>

                    {task.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {task.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={task.status}
                      onChange={(event) =>
                        updateStatus(
                          task,
                          event.target
                            .value as TaskStatus
                        )
                      }
                      className="input-field text-sm py-2"
                    >
                      {TASK_STATUS_OPTIONS.map(
                        (status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {
                              TASK_STATUS_LABELS[
                                status
                              ]
                            }
                          </option>
                        )
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        openEditWork(task)
                      }
                      className="btn-ghost p-2"
                      title="Edit work"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          )}
        </div>
      )}

      {/* ADD / EDIT MODAL */}

      <Modal
        open={showModal}
        onClose={closeModal}
        title={
          editingTask
            ? "Edit My Work"
            : "Add My Work"
        }
        size="md"
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div>
            <label className="label-text">
              Work Title *
            </label>

            <input
              type="text"
              value={form.title}
              onChange={(event) =>
                setForm({
                  ...form,
                  title:
                    event.target.value,
                })
              }
              className="input-field"
              placeholder="e.g. Prepare PMS report"
              required
            />
          </div>

          <div>
            <label className="label-text">
              Description
            </label>

            <textarea
              value={form.description}
              onChange={(event) =>
                setForm({
                  ...form,
                  description:
                    event.target.value,
                })
              }
              className="input-field min-h-[100px]"
              placeholder="Describe your work..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label-text">
                Priority
              </label>

              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({
                    ...form,
                    priority:
                      event.target
                        .value as Priority,
                  })
                }
                className="input-field"
              >
                <option value="low">
                  Low
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="high">
                  High
                </option>

                <option value="urgent">
                  Urgent
                </option>
              </select>
            </div>

            <div>
              <label className="label-text">
                Due Date
              </label>

              <input
                type="date"
                value={form.due_date}
                onChange={(event) =>
                  setForm({
                    ...form,
                    due_date:
                      event.target.value,
                  })
                }
                className="input-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="btn-secondary"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting
                ? "Saving..."
                : editingTask
                ? "Save Changes"
                : "Add My Work"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

