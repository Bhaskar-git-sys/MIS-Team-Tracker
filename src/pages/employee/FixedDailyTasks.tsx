import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/shared/Modal";
import { StatCard } from "../../components/shared/StatCard";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";
import {
  startTask,
  completeTask,
  holdTask,
  phaseTask,
  computeTaskDurationSeconds,
} from "../../services/fixedTaskService";
import {
  FDT_STATUS_LABELS,
  FDT_STATUS_COLORS,
  FDT_STATUS_DOT_COLORS,
  FDT_PRIORITY_LABELS,
  FDT_PRIORITY_COLORS,
} from "../../utils/constants";
import {
  formatClockTime,
  formatDuration,
} from "../../utils/helpers";
import type { DailyFixedTask } from "../../types";
import {
  ClipboardList,
  Play,
  CheckCircle2,
  Pause,
  Clock,
  CheckSquare,
  AlertCircle,
  RefreshCw,
  Plus,
  X,
} from "lucide-react";

type AddTaskForm = {
  report_name: string;
  type: string;
  working_type: string;
  estimation_duration: string;
  start_report_time: string;
  shift: string;
  start_time: string;
  end_time: string;
};

const EMPTY_ADD_TASK_FORM: AddTaskForm = {
  report_name: "",
  type: "",
  working_type: "",
  estimation_duration: "",
  start_report_time: "",
  shift: "",
  start_time: "",
  end_time: "",
};

export default function EmployeeFixedTasks() {
  const { user, profile } = useAuth();

  const [tasks, setTasks] = useState<DailyFixedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [holdTaskId, setHoldTaskId] = useState<string | null>(null);
  const [holdRemarks, setHoldRemarks] = useState("");

  const [, setClock] = useState(Date.now());

  /* ==========================================================
     ADD FIXED TASK
  ========================================================== */

  const [showAddFixedTask, setShowAddFixedTask] =
    useState(false);

  const [addTaskForm, setAddTaskForm] =
    useState<AddTaskForm>({
      ...EMPTY_ADD_TASK_FORM,
    });

  const [addingTask, setAddingTask] =
    useState(false);

  const updateAddTaskForm = (
    field: keyof AddTaskForm,
    value: string
  ) => {
    setAddTaskForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const closeAddFixedTask = () => {
    if (addingTask) {
      return;
    }

    setShowAddFixedTask(false);

    setAddTaskForm({
      ...EMPTY_ADD_TASK_FORM,
    });
  };

  /*
   * Create today's fixed task for the logged-in employee.
   */
  const addFixedTask = async () => {
    if (!user?.id) {
      showToast(
        "error",
        "User session not found. Please login again."
      );
      return;
    }

    if (!addTaskForm.report_name.trim()) {
      showToast(
        "warning",
        "Report Name is required."
      );
      return;
    }

    if (!addTaskForm.start_report_time) {
      showToast(
        "warning",
        "Start the Report time is required."
      );
      return;
    }

    if (!addTaskForm.shift) {
      showToast(
        "warning",
        "Please select Shift."
      );
      return;
    }

    if (
      addTaskForm.start_time &&
      addTaskForm.end_time &&
      addTaskForm.end_time <=
        addTaskForm.start_time
    ) {
      showToast(
        "warning",
        "End Time must be greater than Start Time."
      );
      return;
    }

    setAddingTask(true);

    try {
      /*
       * Get current employee profile.
       */
      const {
        data: currentProfile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("id, full_name, employee_id")
        .eq("id", user.id)
        .single();

      if (profileError || !currentProfile) {
        console.error(
          "Employee profile error:",
          profileError
        );

        showToast(
          "error",
          "Unable to find your employee profile."
        );

        return;
      }

      /*
       * IMPORTANT:
       * The task is automatically assigned to
       * the logged-in employee.
       */
      const payload = {
        task_date: todayStr,
        report_name:
          addTaskForm.report_name.trim(),

        type:
          addTaskForm.type.trim() || null,

        working_type:
          addTaskForm.working_type.trim() || null,

        assigned_to: currentProfile.id,

        estimation_duration:
          addTaskForm.estimation_duration.trim() ||
          null,

        start_report_time:
          addTaskForm.start_report_time || null,

        shift:
          addTaskForm.shift || null,

        start_time:
          addTaskForm.start_time
            ? `${todayStr}T${addTaskForm.start_time}:00`
            : null,

        end_time:
          addTaskForm.end_time
            ? `${todayStr}T${addTaskForm.end_time}:00`
            : null,

        /*
         * New employee-added task starts as OPEN.
         */
        status: "open",
      };

      console.log(
        "Adding Fixed Task:",
        payload
      );

      const {
        data,
        error,
      } = await supabase
        .from("daily_fixed_tasks")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        console.error(
          "Add fixed task error:",
          error
        );

        showToast(
          "error",
          error.message ||
            "Failed to add fixed task."
        );

        return;
      }

      if (!data) {
        showToast(
          "error",
          "Task was not created."
        );

        return;
      }

      showToast(
        "success",
        "Fixed task added successfully."
      );

      setShowAddFixedTask(false);

      setAddTaskForm({
        ...EMPTY_ADD_TASK_FORM,
      });

      await loadTasks(false);
    } catch (error) {
      console.error(
        "Unexpected add fixed task error:",
        error
      );

      showToast(
        "error",
        "Unable to add fixed task."
      );
    } finally {
      setAddingTask(false);
    }
  };

  /* ==========================================================
     TODAY
  ========================================================== */

  const todayStr = useMemo(() => {
    const today = new Date();

    const year =
      today.getFullYear();

    const month = String(
      today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      today.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }, []);

  /* ==========================================================
     LOAD TASKS
  ========================================================== */

  const loadTasks = useCallback(
    async (showLoader = true) => {
      if (!user?.id) {
        setTasks([]);
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        /*
         * Get logged-in employee profile.
         */
        const {
          data: currentProfile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            "id, full_name, employee_id"
          )
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error(
            "Unable to get employee profile:",
            profileError
          );

          setTasks([]);
          return;
        }

        if (!currentProfile) {
          setTasks([]);
          return;
        }

        /*
         * Today's tasks for this employee only.
         */
        const {
          data,
          error,
        } = await supabase
          .from("daily_fixed_tasks")
          .select("*")
          .eq(
            "assigned_to",
            currentProfile.id
          )
          .eq(
            "task_date",
            todayStr
          )
          .order(
            "start_report_time",
            {
              ascending: true,
              nullsFirst: false,
            }
          );

        if (error) {
          console.error(
            "Unable to load employee fixed tasks:",
            error
          );

          showToast(
            "error",
            "Unable to load today's fixed tasks."
          );

          setTasks([]);
          return;
        }

        setTasks(
          (data ?? []) as DailyFixedTask[]
        );
      } catch (error) {
        console.error(
          "Unexpected error loading fixed tasks:",
          error
        );

        setTasks([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, todayStr]
  );

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* ==========================================================
     LIVE CLOCK
  ========================================================== */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setClock(Date.now());
      }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /* ==========================================================
     AUTO REFRESH
  ========================================================== */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        loadTasks(false);
      }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadTasks]);

  /* ==========================================================
     STATS
  ========================================================== */

  const stats = useMemo(() => {
    const total = tasks.length;

    const completed =
      tasks.filter(
        (task) =>
          task.status === "completed"
      ).length;

    const wip =
      tasks.filter(
        (task) =>
          task.status === "wip"
      ).length;

    const open =
      tasks.filter(
        (task) =>
          task.status === "open"
      ).length;

    const hold =
      tasks.filter(
        (task) =>
          task.status === "hold"
      ).length;

    const pending =
      tasks.filter(
        (task) =>
          task.status === "pending"
      ).length;

    const completionPct =
      total > 0
        ? Math.round(
            (completed / total) * 100
          )
        : 0;

    return {
      total,
      completed,
      wip,
      open,
      hold,
      pending,
      completionPct,
    };
  }, [tasks]);

  /* ==========================================================
     START TASK
  ========================================================== */

  const handleStart = async (
    id: string
  ) => {
    const { error } =
      await startTask(id);

    if (error) {
      showToast(
        "error",
        error
      );
      return;
    }

    showToast(
      "success",
      "Task started"
    );

    await loadTasks(false);
  };

  /* ==========================================================
     COMPLETE TASK
  ========================================================== */

  const handleComplete =
    async (
      task: DailyFixedTask
    ) => {
      if (
        task.status !== "wip"
      ) {
        return;
      }

      const { error } =
        await completeTask(
          task.id
        );

      if (error) {
        showToast(
          "error",
          error
        );
        return;
      }

      showToast(
        "success",
        "Task completed"
      );

      await loadTasks(false);
    };

  /* ==========================================================
     HOLD TASK
  ========================================================== */

  const handleHoldSubmit =
    async () => {
      if (!holdTaskId) {
        return;
      }

      if (!holdRemarks.trim()) {
        showToast(
          "warning",
          "Please enter remarks"
        );
        return;
      }

      const { error } =
        await holdTask(
          holdTaskId,
          holdRemarks.trim()
        );

      if (error) {
        showToast(
          "error",
          error
        );
        return;
      }

      showToast(
        "success",
        "Task put on hold"
      );

      setHoldTaskId(null);
      setHoldRemarks("");

      await loadTasks(false);
    };

  /* ==========================================================
     RESUME / PHASE
  ========================================================== */

  const handlePhase = async (
    id: string
  ) => {
    const task =
      tasks.find(
        (item) =>
          item.id === id
      );

    if (
      task?.status !== "hold"
    ) {
      return;
    }

    const { error } =
      await phaseTask(id);

    if (error) {
      showToast(
        "error",
        error
      );
      return;
    }

    showToast(
      "success",
      "Task resumed"
    );

    await loadTasks(false);
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div>
      <PageHeader
        title="Fixed Daily Tasks"
        subtitle={`Today's tasks for ${
          profile?.full_name?.split(
            " "
          )[0] ?? ""
        }`}
        icon={
          <ClipboardList className="w-5 h-5" />
        }
        actions={
          <div className="flex items-center gap-2">
            {/* REFRESH */}

            <button
              type="button"
              onClick={() =>
                void loadTasks(false)
              }
              disabled={refreshing}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh
            </button>

            {/* ADD FIXED TASK */}

            <button
              type="button"
              onClick={() =>
                setShowAddFixedTask(
                  true
                )
              }
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />

              Add Fixed Task
            </button>
          </div>
        }
      />

      {/* ======================================================
          STATS
      ====================================================== */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Tasks"
          value={stats.total}
          icon={
            <CheckSquare className="w-6 h-6" />
          }
          color="primary"
        />

        <StatCard
          title="Completed"
          value={stats.completed}
          icon={
            <CheckCircle2 className="w-6 h-6" />
          }
          color="green"
        />

        <StatCard
          title="WIP"
          value={stats.wip}
          icon={
            <Clock className="w-6 h-6" />
          }
          color="amber"
        />

        <StatCard
          title="Open"
          value={stats.open}
          icon={
            <AlertCircle className="w-6 h-6" />
          }
          color="blue"
        />
      </div>

      {/* ======================================================
          PROGRESS
      ====================================================== */}

      {stats.total > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Today's Completion
            </h3>

            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {stats.completionPct}%
            </span>
          </div>

          <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              initial={{
                width: 0,
              }}
              animate={{
                width: `${stats.completionPct}%`,
              }}
              transition={{
                duration: 0.8,
                ease: "easeOut",
              }}
              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
            />
          </div>
        </div>
      )}

      {/* ======================================================
          LOADING / TASK LIST
      ====================================================== */}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />

          <p className="text-slate-500 dark:text-slate-400">
            No fixed tasks assigned to you for today.
          </p>

          <button
            type="button"
            onClick={() =>
              setShowAddFixedTask(true)
            }
            className="btn-primary mt-4 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />

            Add Fixed Task
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map(
            (task, i) => {
              const duration =
                computeTaskDurationSeconds(
                  task
                );

              return (
                <motion.div
                  key={task.id}
                  initial={{
                    opacity: 0,
                    y: 20,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  transition={{
                    delay:
                      i * 0.03,
                  }}
                  className="card p-5"
                >
                  {/* HEADER */}

                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                        {
                          task.report_name
                        }
                      </h3>

                      <p className="text-xs text-slate-400 mt-0.5">
                        {
                          task.category
                        }
                      </p>
                    </div>

                    <span
                      className={`badge ${
                        FDT_STATUS_COLORS[
                          task.status
                        ]
                      } flex-shrink-0 flex items-center gap-1.5`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          FDT_STATUS_DOT_COLORS[
                            task.status
                          ]
                        } animate-pulse`}
                      />

                      {
                        FDT_STATUS_LABELS[
                          task.status
                        ]
                      }
                    </span>
                  </div>

                  {/* INFO */}

                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3">
                    <div className="flex items-center justify-between">
                      <span>
                        Shift
                      </span>

                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {
                          task.shift
                        }
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>
                        Priority
                      </span>

                      <span
                        className={`badge ${
                          FDT_PRIORITY_COLORS[
                            task.priority
                          ]
                        }`}
                      >
                        {
                          FDT_PRIORITY_LABELS[
                            task.priority
                          ]
                        }
                      </span>
                    </div>

                    {task.estimation_duration && (
                      <div className="flex items-center justify-between">
                        <span>
                          Est. Duration
                        </span>

                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {
                            task.estimation_duration
                          }
                        </span>
                      </div>
                    )}

                    {task.start_report_time && (
                      <div className="flex items-center justify-between">
                        <span>
                          Start Report Time
                        </span>

                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {
                            task.start_report_time
                          }
                        </span>
                      </div>
                    )}

                    {task.start_time && (
                      <div className="flex items-center justify-between">
                        <span>
                          Started At
                        </span>

                        <span className="font-medium text-slate-700 dark:text-slate-200 font-mono">
                          {formatClockTime(
                            task.start_time
                          )}
                        </span>
                      </div>
                    )}

                    {task.completed_time && (
                      <div className="flex items-center justify-between">
                        <span>
                          Completed At
                        </span>

                        <span className="font-medium text-slate-700 dark:text-slate-200 font-mono">
                          {formatClockTime(
                            task.completed_time
                          )}
                        </span>
                      </div>
                    )}

                    {duration > 0 && (
                      <div className="flex items-center justify-between">
                        <span>
                          Worked Time
                        </span>

                        <span className="font-medium text-slate-700 dark:text-slate-200 font-mono">
                          {formatDuration(
                            duration
                          )}
                        </span>
                      </div>
                    )}

                    {task.remarks && (
                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/50">
                        <span className="block text-slate-400 mb-0.5">
                          Remarks
                        </span>

                        <span className="text-slate-600 dark:text-slate-300">
                          {
                            task.remarks
                          }
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ACTIONS */}

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    {task.status ===
                      "open" && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleStart(
                            task.id
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5" />

                        Start
                      </button>
                    )}

                    {task.status ===
                      "wip" && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleComplete(
                            task
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />

                        Complete
                      </button>
                    )}

                    {task.status ===
                      "wip" && (
                      <button
                        type="button"
                        onClick={() => {
                          setHoldTaskId(
                            task.id
                          );

                          setHoldRemarks(
                            task.remarks ??
                              ""
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Pause className="w-3.5 h-3.5" />

                        Hold
                      </button>
                    )}

                    {task.status ===
                      "hold" && (
                      <button
                        type="button"
                        onClick={() =>
                          void handlePhase(
                            task.id
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-500 hover:bg-slate-600 text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5" />

                        Phase
                      </button>
                    )}

                    {task.status ===
                      "completed" && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />

                        Completed
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            }
          )}
        </div>
      )}

      {/* ======================================================
          ADD FIXED TASK MODAL
      ====================================================== */}

      <Modal
        open={showAddFixedTask}
        onClose={closeAddFixedTask}
        title="Add Fixed Task"
        size="lg"
      >
        <div className="space-y-5">

          {/* EMPLOYEE */}

          <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/70 dark:bg-blue-900/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  MIS Executive
                </p>

                <p className="font-semibold text-slate-900 dark:text-white">
                  {profile?.full_name ||
                    "Current Employee"}
                </p>

                {profile?.employee_id && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Employee ID:{" "}
                    {
                      profile.employee_id
                    }
                  </p>
                )}
              </div>

              <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                Automatically Assigned
              </span>
            </div>
          </div>

          {/* REPORT NAME */}

          <div>
            <label className="label-text">
              Report Name *
            </label>

            <input
              type="text"
              value={
                addTaskForm.report_name
              }
              onChange={(event) =>
                updateAddTaskForm(
                  "report_name",
                  event.target.value
                )
              }
              className="input-field"
              placeholder="Enter report name"
              disabled={addingTask}
              autoFocus
            />
          </div>

          {/* TYPE + WORKING TYPE */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Type
              </label>

              <select
                value={
                  addTaskForm.type
                }
                onChange={(event) =>
                  updateAddTaskForm(
                    "type",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={addingTask}
              >
                <option value="">
                  Select Type
                </option>
                <option value="Download">
                  Download
                </option>
                <option value="Report">
                  Report
                </option>
                <option value="MIS">
                  MIS
                </option>
                <option value="Analysis">
                  Analysis
                </option>
                <option value="Other">
                  Other
                </option>
              </select>
            </div>

            <div>
              <label className="label-text">
                Working Type
              </label>

              <select
                value={
                  addTaskForm.working_type
                }
                onChange={(event) =>
                  updateAddTaskForm(
                    "working_type",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={addingTask}
              >
                <option value="">
                  Select Working Type
                </option>
                <option value="Daily">
                  Daily
                </option>
                <option value="Weekly">
                  Weekly
                </option>
                <option value="Monthly">
                  Monthly
                </option>
                <option value="Adhoc">
                  Adhoc
                </option>
              </select>
            </div>
          </div>

          {/* ESTIMATION + START REPORT */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Estimation Duration
              </label>

              <input
                type="text"
                value={
                  addTaskForm.estimation_duration
                }
                onChange={(event) =>
                  updateAddTaskForm(
                    "estimation_duration",
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="Example: 30 min"
                disabled={addingTask}
              />
            </div>

            <div>
              <label className="label-text">
                Start the Report
              </label>

              <input
                type="time"
                value={
                  addTaskForm.start_report_time
                }
                onChange={(event) =>
                  updateAddTaskForm(
                    "start_report_time",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={addingTask}
              />
            </div>
          </div>

          {/* SHIFT */}

          <div>
            <label className="label-text">
              Shift *
            </label>

            <select
              value={
                addTaskForm.shift
              }
              onChange={(event) =>
                updateAddTaskForm(
                  "shift",
                  event.target.value
                )
              }
              className="input-field"
              disabled={addingTask}
            >
              <option value="">
                Select Shift
              </option>

              <option value="1st Half">
                1st Half
              </option>

              <option value="2nd Half">
                2nd Half
              </option>

              <option value="Full Day">
                Full Day
              </option>
            </select>
          </div>

          {/* START / END TIME */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Start Time
              </label>

              <input
                type="time"
                value={
                  addTaskForm.start_time
                }
                onChange={(event) =>
                  updateAddTaskForm(
                    "start_time",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={addingTask}
              />
            </div>

            <div>
              <label className="label-text">
                End Time
              </label>

              <input
                type="time"
                value={
                  addTaskForm.end_time
                }
                onChange={(event) =>
                  updateAddTaskForm(
                    "end_time",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={addingTask}
              />
            </div>
          </div>

          {/* NOTE */}

          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This task will be created for{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {profile?.full_name ||
                  "you"}
              </span>{" "}
              and will appear in today's Fixed Daily Tasks.
            </p>
          </div>

          {/* BUTTONS */}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeAddFixedTask}
              disabled={addingTask}
              className="btn-secondary flex items-center gap-2"
            >
              <X className="w-4 h-4" />

              Cancel
            </button>

            <button
              type="button"
              onClick={() =>
                void addFixedTask()
              }
              disabled={addingTask}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />

              {addingTask
                ? "Adding..."
                : "Add Fixed Task"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ======================================================
          HOLD MODAL
      ====================================================== */}

      <Modal
        open={!!holdTaskId}
        onClose={() => {
          setHoldTaskId(null);
          setHoldRemarks("");
        }}
        title="Hold Task"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Please enter remarks for putting this task on hold.
          </p>

          <textarea
            value={holdRemarks}
            onChange={(event) =>
              setHoldRemarks(
                event.target.value
              )
            }
            className="input-field min-h-[80px]"
            placeholder="Reason for holding..."
            autoFocus
          />

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setHoldTaskId(null);
                setHoldRemarks("");
              }}
              className="btn-secondary"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() =>
                void handleHoldSubmit()
              }
              className="btn-primary"
            >
              Hold Task
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
