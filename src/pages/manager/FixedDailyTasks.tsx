import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { motion } from "framer-motion";
import {
  Plus,
  X,
  Upload,
  Download,
  RefreshCw,
  Search,
  ClipboardList,
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Pencil,
} from "lucide-react";
import * as XLSX from "xlsx";

import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { Modal } from "../../components/shared/Modal";
import { StatCard } from "../../components/shared/StatCard";
import { showToast } from "../../components/shared/Toast";
import { supabase } from "../../services/supabaseClient";

/* =========================================================
   TYPES
========================================================= */

type Employee = {
  id: string;
  full_name: string;
  employee_id: string | null;
  email: string | null;
  username: string | null;
  status: string | null;
  department: string | null;
};

type FixedTask = {
  id: string;
  task_date: string;
  report_name: string;
  type: string | null;
  working_type: string | null;
  assigned_to: string;
  estimation_duration: string | null;
  start_report_time: string | null;
  shift: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  priority: string | null;
  remarks: string | null;
  created_at: string | null;
};

type AddTaskForm = {
  employee_id: string;
  report_name: string;
  type: string;
  working_type: string;
  estimation_duration: string;
  start_the_report: string;
  shift: string;
  start_time: string;
  end_time: string;
  priority: string;
  remarks: string;
};

type ImportRow = {
  rowNumber: number;
  employeeName: string;
  employeeId: string;
  reportName: string;
  type: string;
  workingType: string;
  estimationDuration: string;
  startReportTime: string;
  shift: string;
  startTime: string;
  endTime: string;
  priority: string;
  remarks: string;
};

type ImportResult = {
  rowNumber: number;
  employee: string;
  report: string;
  success: boolean;
  message: string;
};

/* =========================================================
   CONSTANTS
========================================================= */

const EMPTY_FORM: AddTaskForm = {
  employee_id: "",
  report_name: "",
  type: "",
  working_type: "",
  estimation_duration: "",
  start_the_report: "",
  shift: "",
  start_time: "",
  end_time: "",
  priority: "medium",
  remarks: "",
};

/* =========================================================
   DATE HELPERS
========================================================= */

/**
 * Returns the local date in database-safe format:
 *
 * 2026-10-01
 */
const getToday = (): string => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-");
  return `${month}-${day}-${year}`;
};

/**
 * Safely converts any date-like value into YYYY-MM-DD.
 *
 * Examples:
 *
 * 2026 -10 -01
 * 2026-10-01
 * 2026 / 10 / 01
 *
 * all become:
 *
 * 2026-10-01
 */
const normalizeDate = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  let text = String(value).trim();

  if (!text) {
    return "";
  }

  /*
   * Remove all spaces.
   */
  text = text.replace(/\s+/g, "");

  /*
   * Convert / to -
   */
  text = text.replace(/\//g, "-");

  /*
   * Match YYYY-MM-DD
   */
  const match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (match) {
    const year = match[1];
    const month = String(
      Number(match[2])
    ).padStart(2, "0");
    const day = String(
      Number(match[3])
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /*
   * If Excel sends a Date string.
   */
  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(
      parsed.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      parsed.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "";
};

/**
 * Final protection before sending date to Supabase.
 */
const getSafeToday = (): string => {
  const date = normalizeDate(
    getToday()
  );

  if (!date) {
    throw new Error(
      "Unable to generate today's date."
    );
  }

  return date;
};

/* =========================================================
   GENERAL HELPERS
========================================================= */

const normalize = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const clean = (value: unknown): string => {
  return String(value ?? "").trim();
};

/* =========================================================
   TIME HELPERS
========================================================= */

/**
 * Converts Excel / browser / text time values to HH:mm.
 */
const excelTimeToString = (
  value: unknown
): string => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  /* Excel serial time */
  if (typeof value === "number") {
    const fraction =
      value % 1;

    const totalMinutes =
      Math.round(
        fraction * 24 * 60
      );

    const hours =
      Math.floor(
        totalMinutes / 60
      ) % 24;

    const minutes =
      totalMinutes % 60;

    return `${String(
      hours
    ).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}`;
  }

  /* JavaScript Date */
  if (value instanceof Date) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return "";
    }

    return `${String(
      value.getHours()
    ).padStart(2, "0")}:${String(
      value.getMinutes()
    ).padStart(2, "0")}`;
  }

  let text = clean(value);

  if (!text) {
    return "";
  }

  /*
   * Remove spaces around time.
   */
  text = text.replace(
    /\s+/g,
    " "
  );

  /*
   * Remove seconds.
   */
  text = text.replace(
    /^(\d{1,2}:\d{2}):\d{2}$/,
    "$1"
  );

  /*
   * 9:15 AM
   */
  const ampmMatch =
    text.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    );

  if (ampmMatch) {
    let hour = Number(
      ampmMatch[1]
    );

    const minute = Number(
      ampmMatch[2]
    );

    const ampm =
      ampmMatch[3].toUpperCase();

    if (
      ampm === "PM" &&
      hour !== 12
    ) {
      hour += 12;
    }

    if (
      ampm === "AM" &&
      hour === 12
    ) {
      hour = 0;
    }

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return "";
    }

    return `${String(
      hour
    ).padStart(2, "0")}:${String(
      minute
    ).padStart(2, "0")}`;
  }

  /*
   * HH:mm
   */
  const timeMatch =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (timeMatch) {
    const hour = Number(
      timeMatch[1]
    );

    const minute = Number(
      timeMatch[2]
    );

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return `${String(
        hour
      ).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;
    }
  }

  return "";
};

const timeToMinutes = (
  value: string
): number | null => {
  if (!value) {
    return null;
  }

  const match =
    value.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const hours = Number(
    match[1]
  );

  const minutes = Number(
    match[2]
  );

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return (
    hours * 60 +
    minutes
  );
};

const isTimeRangeInvalid = (
  start: string,
  end: string
): boolean => {
  if (!start || !end) {
    return false;
  }

  const startMinutes =
    timeToMinutes(start);

  const endMinutes =
    timeToMinutes(end);

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return false;
  }

  return (
    endMinutes <=
    startMinutes
  );
};

/**
 * Creates timestamp for Supabase.
 *
 * Example:
 * 2026-10-01 + 09:15
 *
 * => 2026-10-01T09:15:00
 */
const makeDateTime = (
  date: string,
  time: string
): string | null => {
  const safeDate =
    normalizeDate(date);

  const safeTime =
    excelTimeToString(time);

  if (
    !safeDate ||
    !safeTime
  ) {
    return null;
  }

  return `${safeDate}T${safeTime}:00`;
};

const toTimeInputValue = (
  value: string | null
): string => {
  if (!value) {
    return "";
  }

  const text = clean(value);

  // Plain SQL time values, including HH:mm:ss.
  const plainTime = text.match(/^(\\d{1,2}:\\d{2})/);
  if (plainTime) {
    return excelTimeToString(plainTime[1]);
  }

  // Timestamp values returned by Supabase need local HH:mm for <input type="time">.
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
  }

  return excelTimeToString(text);
};

const formatTime = (
  value: string | null
): string => {
  if (!value) {
    return "-";
  }

  const text =
    clean(value);

  /*
   * HH:mm
   */
  if (
    /^\d{2}:\d{2}$/.test(
      text
    )
  ) {
    return text;
  }

  /*
   * HH:mm:ss
   */
  if (
    /^\d{2}:\d{2}:\d{2}$/.test(
      text
    )
  ) {
    return text.substring(
      0,
      5
    );
  }

  const date =
    new Date(text);

  if (
    !Number.isNaN(
      date.getTime()
    )
  ) {
    return date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
    );
  }

  return text;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function FixedDailyTasks() {
  const { profile } =
    useAuth();

  void profile;

  /*
   * IMPORTANT:
   *
   * This value is generated once when the page loads.
   *
   * It will ALWAYS be:
   *
   * YYYY-MM-DD
   */
  const todayStr =
    useMemo(
      () => getSafeToday(),
      []
    );

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  /* =========================================================
     STATE
  ========================================================= */

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [tasks, setTasks] =
    useState<FixedTask[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [employeeFilter, setEmployeeFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [showAddModal, setShowAddModal] =
    useState(false);

  // When set, the shared task form edits an existing task instead of inserting one.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [adding, setAdding] =
    useState(false);

  const [form, setForm] =
    useState<AddTaskForm>({
      ...EMPTY_FORM,
    });

  const [showImportModal, setShowImportModal] =
    useState(false);

  const [importing, setImporting] =
    useState(false);

  const [importRows, setImportRows] =
    useState<ImportRow[]>([]);

  const [importResults, setImportResults] =
    useState<ImportResult[]>([]);

  const [selectedFileName, setSelectedFileName] =
    useState("");

  /* =========================================================
     LOAD EMPLOYEES
  ========================================================= */

  const loadEmployees =
    useCallback(async () => {
      try {
        const {
          data,
          error,
        } = await supabase
          .from("profiles")
          .select(
            `
              id,
              full_name,
              employee_id,
              email,
              username,
              status,
              department
            `
          )
          .eq(
            "role",
            "mis_employee"
          )
          .order(
            "full_name",
            {
              ascending: true,
            }
          );

        if (error) {
          console.error(
            "Load employees error:",
            error
          );

          showToast(
            "error",
            "Unable to load MIS employees."
          );

          return;
        }

        setEmployees(
          (data ??
            []) as Employee[]
        );
      } catch (error) {
        console.error(
          "Unexpected employee loading error:",
          error
        );

        showToast(
          "error",
          "Unable to load MIS employees."
        );
      }
    }, []);

  /* =========================================================
     LOAD TODAY TASKS
  ========================================================= */

  const loadTasks =
    useCallback(
      async (
        showLoader = true
      ) => {
        if (showLoader) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        try {
          /*
           * FINAL DATE SAFETY CHECK
           */
          const safeDate =
            normalizeDate(
              todayStr
            );

          if (!safeDate) {
            throw new Error(
              `Invalid task date: ${todayStr}`
            );
          }

          console.log(
            "Loading tasks for date:",
            safeDate
          );

          const {
            data,
            error,
          } = await supabase
            .from(
              "daily_fixed_tasks"
            )
            .select(
              `
                id,
                task_date,
                report_name,
                type,
                working_type,
                assigned_to,
                estimation_duration,
                start_report_time,
                shift,
                start_time,
                end_time,
                status,
                priority,
                remarks,
                created_at
              `
            )
            .eq(
              "task_date",
              safeDate
            )
            .order(
              "start_report_time",
              {
                ascending: true,
                nullsFirst: false,
              }
            )
            .order(
              "created_at",
              {
                ascending: true,
              }
            );

          if (error) {
            console.error(
              "Load fixed tasks error:",
              error
            );

            showToast(
              "error",
              error.message ||
              "Unable to load today's fixed tasks."
            );

            setTasks([]);

            return;
          }

          setTasks(
            (data ??
              []) as FixedTask[]
          );
        } catch (error) {
          console.error(
            "Unexpected task loading error:",
            error
          );

          showToast(
            "error",
            error instanceof Error
              ? error.message
              : "Unable to load today's fixed tasks."
          );

          setTasks([]);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [todayStr]
    );

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    void Promise.all([
      loadEmployees(),
      loadTasks(true),
    ]);
  }, [
    loadEmployees,
    loadTasks,
  ]);

  /* =========================================================
     EMPLOYEE MAP
  ========================================================= */

  const employeeMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          Employee
        >();

      employees.forEach(
        (employee) => {
          map.set(
            employee.id,
            employee
          );
        }
      );

      return map;
    }, [employees]);

  /* =========================================================
     STATS
  ========================================================= */

  const stats =
    useMemo(() => {
      const total =
        tasks.length;

      const completed =
        tasks.filter(
          (task) =>
            task.status ===
            "completed"
        ).length;

      const wip =
        tasks.filter(
          (task) =>
            task.status ===
            "wip"
        ).length;

      const open =
        tasks.filter(
          (task) =>
            task.status ===
            "open"
        ).length;

      const hold =
        tasks.filter(
          (task) =>
            task.status ===
            "hold"
        ).length;

      const employeesWithTasks =
        new Set(
          tasks.map(
            (task) =>
              task.assigned_to
          )
        ).size;

      return {
        total,
        completed,
        wip,
        open,
        hold,
        employeesWithTasks,
      };
    }, [tasks]);

  /* =========================================================
     FILTER TASKS
  ========================================================= */

  const filteredTasks =
    useMemo(() => {
      const searchText =
        normalize(search);

      return tasks.filter(
        (task) => {
          const employee =
            employeeMap.get(
              task.assigned_to
            );

          const employeeName =
            normalize(
              employee?.full_name
            );

          const employeeId =
            normalize(
              employee?.employee_id
            );

          const reportName =
            normalize(
              task.report_name
            );

          const matchesSearch =
            !searchText ||
            employeeName.includes(
              searchText
            ) ||
            employeeId.includes(
              searchText
            ) ||
            reportName.includes(
              searchText
            );

          const matchesEmployee =
            employeeFilter ===
            "all" ||
            task.assigned_to ===
            employeeFilter;

          const matchesStatus =
            statusFilter ===
            "all" ||
            task.status ===
            statusFilter;

          return (
            matchesSearch &&
            matchesEmployee &&
            matchesStatus
          );
        }
      );
    }, [
      tasks,
      search,
      employeeFilter,
      statusFilter,
      employeeMap,
    ]);

  /* =========================================================
     FORM
  ========================================================= */

  const updateForm = (
    field: keyof AddTaskForm,
    value: string
  ) => {
    setForm(
      (previous) => ({
        ...previous,
        [field]: value,
      })
    );
  };

  const closeAddModal =
    () => {
      if (adding) {
        return;
      }

      setShowAddModal(false);
      setEditingTaskId(null);

      setForm({
        ...EMPTY_FORM,
      });
    };

  /* =========================================================
     ADD FIXED TASK
  ========================================================= */

  const addFixedTask =
    async () => {
      if (!form.employee_id) {
        showToast(
          "warning",
          "Please select an employee."
        );
        return;
      }

      if (
        !form.report_name.trim()
      ) {
        showToast(
          "warning",
          "Report Name is required."
        );
        return;
      }

      if (!form.shift) {
        showToast(
          "warning",
          "Please select Shift."
        );
        return;
      }

      if (
        isTimeRangeInvalid(
          form.start_time,
          form.end_time
        )
      ) {
        showToast(
          "warning",
          "End Time must be greater than Start Time."
        );
        return;
      }

      setAdding(true);

      try {
        /*
         * FINAL DATE NORMALIZATION
         */
        const safeDate =
          normalizeDate(
            todayStr
          );

        if (!safeDate) {
          throw new Error(
            "Invalid task date."
          );
        }

        /*
         * Duplicate check
         */
        let duplicateQuery = supabase
          .from("daily_fixed_tasks")
          .select("id")
          .eq("task_date", safeDate)
          .eq("assigned_to", form.employee_id)
          .eq("report_name", form.report_name.trim());

        // Do not treat the record being edited as a duplicate of itself.
        if (editingTaskId) {
          duplicateQuery = duplicateQuery.neq("id", editingTaskId);
        }

        const {
          data: existing,
          error: duplicateError,
        } = await duplicateQuery.limit(1);

        if (duplicateError) {
          showToast(
            "error",
            duplicateError.message
          );
          return;
        }

        if (
          existing &&
          existing.length > 0
        ) {
          showToast(
            "warning",
            "Same report is already assigned to this employee today."
          );
          return;
        }

        /*
         * FINAL PAYLOAD
         *
         * task_date is guaranteed:
         *
         * YYYY-MM-DD
         */
        const payload = {
          task_date: safeDate,

          report_name:
            form.report_name.trim(),

          type:
            form.type.trim() ||
            null,

          working_type:
            form.working_type.trim() ||
            null,

          assigned_to:
            form.employee_id,

          estimation_duration:
            form.estimation_duration.trim() ||
            null,

          start_report_time:
            form.start_the_report ||
            null,

          shift:
            form.shift ||
            null,

          start_time:
            makeDateTime(
              safeDate,
              form.start_time
            ),

          end_time:
            makeDateTime(
              safeDate,
              form.end_time
            ),

          priority:
            form.priority ||
            "medium",

          remarks:
            form.remarks.trim() ||
            null,
        };

        console.log(
          editingTaskId ? "Updating fixed task:" : "Adding fixed task:",
          { ...payload, id: editingTaskId }
        );

        const { error } = editingTaskId
          ? await supabase
              .from("daily_fixed_tasks")
              .update(payload)
              .eq("id", editingTaskId)
          : await supabase
              .from("daily_fixed_tasks")
              .insert({ ...payload, status: "open" });

        if (error) {
          console.error(
            editingTaskId ? "Manager update task error:" : "Manager add task error:",
            error
          );

          showToast(
            "error",
            error.message ||
              (editingTaskId
                ? "Failed to update fixed task."
                : "Failed to create fixed task.")
          );

          return;
        }

        const employee =
          employeeMap.get(
            form.employee_id
          );

        showToast(
          "success",
          editingTaskId
            ? `Task updated successfully for ${employee?.full_name || "employee"}.`
            : `Task assigned to ${employee?.full_name || "employee"} successfully.`
        );

        closeAddModal();

        await loadTasks(false);
      } catch (error) {
        console.error(
          "Unexpected add task error:",
          error
        );

        showToast(
          "error",
          error instanceof Error
            ? error.message
            : "Unable to create fixed task."
        );
      } finally {
        setAdding(false);
      }
    };

  /* =========================================================
     EDIT FIXED TASK
  ========================================================= */

  const editTask = (task: FixedTask) => {
    setEditingTaskId(task.id);
    setForm({
      employee_id: task.assigned_to,
      report_name: task.report_name ?? "",
      type: task.type ?? "",
      working_type: task.working_type ?? "",
      estimation_duration: task.estimation_duration ?? "",
      start_the_report: toTimeInputValue(task.start_report_time),
      shift: task.shift ?? "",
      start_time: toTimeInputValue(task.start_time),
      end_time: toTimeInputValue(task.end_time),
      priority: task.priority ?? "medium",
      remarks: task.remarks ?? "",
    });
    setShowAddModal(true);
  };

  /* =========================================================
     DOWNLOAD TEMPLATE
  ========================================================= */

  const downloadTemplate =
    () => {
      const rows = [
        {
          "Employee ID": "",
          "Employee Name": "",
          "Report Name": "",
          Type: "Report",
          "Working Type": "Daily",
          "Estimation Duration":
            "30 min",
          "Start Report Time":
            "09:15",
          Shift: "1st Half",
          "Start Time":
            "09:15",
          "End Time":
            "09:45",
          Priority: "medium",
          Remarks: "",
        },
      ];

      const worksheet =
        XLSX.utils.json_to_sheet(
          rows
        );

      worksheet["!cols"] = [
        { wch: 16 },
        { wch: 24 },
        { wch: 35 },
        { wch: 15 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 14 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 40 },
      ];

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Fixed Tasks"
      );

      XLSX.writeFile(
        workbook,
        "MIS_Fixed_Task_Template.xlsx"
      );

      showToast(
        "success",
        "Excel template downloaded."
      );
    };

  /* =========================================================
     GET EXCEL CELL
  ========================================================= */

  const getCell = (
    row: Record<
      string,
      unknown
    >,
    names: string[]
  ): unknown => {
    const keys =
      Object.keys(row);

    for (
      const wanted of names
    ) {
      const normalizedWanted =
        normalize(wanted);

      const exact =
        keys.find(
          (key) =>
            normalize(key) ===
            normalizedWanted
        );

      if (
        exact !== undefined
      ) {
        return row[exact];
      }
    }

    return "";
  };

  /* =========================================================
     HANDLE EXCEL FILE
  ========================================================= */

  const handleExcelFile =
    async (
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      setSelectedFileName(
        file.name
      );

      setImportResults([]);

      try {
        const extension =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase();

        if (
          ![
            "xlsx",
            "xls",
            "csv",
          ].includes(
            extension || ""
          )
        ) {
          showToast(
            "error",
            "Please select an Excel or CSV file."
          );

          return;
        }

        const buffer =
          await file.arrayBuffer();

        const workbook =
          XLSX.read(buffer, {
            type: "array",
            cellDates: true,
            raw: true,
          });

        if (
          !workbook.SheetNames ||
          workbook.SheetNames
            .length === 0
        ) {
          showToast(
            "error",
            "No worksheet found in the Excel file."
          );

          return;
        }

        const firstSheet =
          workbook.Sheets[
          workbook.SheetNames[0]
          ];

        if (!firstSheet) {
          showToast(
            "error",
            "Excel worksheet could not be read."
          );

          return;
        }

        const rawRows =
          XLSX.utils.sheet_to_json<
            Record<
              string,
              unknown
            >
          >(firstSheet, {
            defval: "",
            raw: true,
          });

        if (
          rawRows.length === 0
        ) {
          showToast(
            "warning",
            "Excel file is empty."
          );

          return;
        }

        const parsed: ImportRow[] =
          rawRows.map(
            (
              row,
              index
            ) => {
              return {
                rowNumber:
                  index + 2,

                employeeName:
                  clean(
                    getCell(
                      row,
                      [
                        "Employee Name",
                        "Employee",
                        "EMP Name",
                        "Name",
                      ]
                    )
                  ),

                employeeId:
                  clean(
                    getCell(
                      row,
                      [
                        "Employee ID",
                        "Emp ID",
                        "EMP ID",
                        "Employee Code",
                        "Emp Code",
                      ]
                    )
                  ),

                reportName:
                  clean(
                    getCell(
                      row,
                      [
                        "Report Name",
                        "Report",
                        "Task Name",
                        "Task",
                      ]
                    )
                  ),

                type:
                  clean(
                    getCell(
                      row,
                      [
                        "Type",
                        "Report Type",
                      ]
                    )
                  ),

                workingType:
                  clean(
                    getCell(
                      row,
                      [
                        "Working Type",
                        "Working",
                        "Frequency",
                      ]
                    )
                  ),

                estimationDuration:
                  clean(
                    getCell(
                      row,
                      [
                        "Estimation Duration",
                        "Estimated Duration",
                        "Duration",
                      ]
                    )
                  ),

                startReportTime:
                  excelTimeToString(
                    getCell(
                      row,
                      [
                        "Start Report Time",
                        "Start the Report",
                        "Start Report",
                        "Report Start Time",
                      ]
                    )
                  ),

                shift:
                  clean(
                    getCell(
                      row,
                      ["Shift"]
                    )
                  ),

                startTime:
                  excelTimeToString(
                    getCell(
                      row,
                      [
                        "Start Time",
                        "Task Start Time",
                      ]
                    )
                  ),

                endTime:
                  excelTimeToString(
                    getCell(
                      row,
                      [
                        "End Time",
                        "Task End Time",
                      ]
                    )
                  ),

                priority:
                  clean(
                    getCell(
                      row,
                      ["Priority"]
                    )
                  ) ||
                  "medium",

                remarks:
                  clean(
                    getCell(
                      row,
                      [
                        "Remarks",
                        "Remark",
                        "Comments",
                      ]
                    )
                  ),
              };
            }
          );

        const meaningfulRows =
          parsed.filter(
            (row) =>
              row.employeeName ||
              row.employeeId ||
              row.reportName ||
              row.startReportTime ||
              row.shift
          );

        if (
          meaningfulRows.length ===
          0
        ) {
          showToast(
            "warning",
            "No usable task rows were found."
          );

          return;
        }

        setImportRows(
          meaningfulRows
        );

        setShowImportModal(
          true
        );

        showToast(
          "success",
          `${meaningfulRows.length} Excel row(s) loaded.`
        );
      } catch (error) {
        console.error(
          "Excel read error:",
          error
        );

        showToast(
          "error",
          "Unable to read Excel file."
        );
      } finally {
        event.target.value =
          "";
      }
    };

  /* =========================================================
     FIND EMPLOYEE
  ========================================================= */

  const findEmployee = (
    row: ImportRow
  ): Employee | null => {
    const employeeId =
      normalize(
        row.employeeId
      );

    const employeeName =
      normalize(
        row.employeeName
      );

    /*
     * Employee ID first.
     */
    if (employeeId) {
      const byId =
        employees.find(
          (employee) =>
            normalize(
              employee.employee_id
            ) === employeeId
        );

      if (byId) {
        return byId;
      }
    }

    /*
     * Employee name second.
     */
    if (employeeName) {
      const byName =
        employees.find(
          (employee) =>
            normalize(
              employee.full_name
            ) === employeeName
        );

      if (byName) {
        return byName;
      }
    }

    return null;
  };

  /* =========================================================
     IMPORT EXCEL TASKS
  ========================================================= */

  const importExcelTasks =
    async () => {
      if (
        importRows.length ===
        0
      ) {
        showToast(
          "warning",
          "No Excel rows available."
        );

        return;
      }

      setImporting(true);

      const results: ImportResult[] =
        [];

      /*
       * Normalize today's date ONCE.
       */
      const safeDate =
        normalizeDate(
          todayStr
        );

      if (!safeDate) {
        setImporting(false);

        showToast(
          "error",
          "Invalid task date."
        );

        return;
      }

      /*
       * Keep duplicate keys from the current
       * Excel import itself.
       *
       * This prevents:
       *
       * Row 2 -> inserted
       * Row 3 -> duplicate
       *
       * even before checking database again.
       */
      const importedKeys =
        new Set<string>();

      try {
        for (
          const row of importRows
        ) {
          const employeeLabel =
            row.employeeName ||
            row.employeeId ||
            "";

          /* ---------------------------------------------
             VALIDATION
          --------------------------------------------- */

          if (
            !row.employeeId &&
            !row.employeeName
          ) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee: "",
              report:
                row.reportName,
              success: false,
              message:
                "Employee ID or Employee Name is required.",
            });

            continue;
          }

          if (
            !row.reportName
          ) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employeeLabel,
              report: "",
              success: false,
              message:
                "Report Name is required.",
            });

            continue;
          }

          const employee =
            findEmployee(row);

          if (!employee) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employeeLabel,
              report:
                row.reportName,
              success: false,
              message:
                "Employee not found in MIS profiles.",
            });

            continue;
          }

          if (
            !row.startReportTime
          ) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                "Start Report Time is required.",
            });

            continue;
          }

          if (!row.shift) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                "Shift is required.",
            });

            continue;
          }

          if (
            isTimeRangeInvalid(
              row.startTime,
              row.endTime
            )
          ) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                "End Time must be greater than Start Time.",
            });

            continue;
          }

          /*
           * Duplicate key.
           */
          const duplicateKey =
            `${employee.id}::${normalize(
              row.reportName
            )}`;

          if (
            importedKeys.has(
              duplicateKey
            )
          ) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                "Duplicate task found in the same Excel file.",
            });

            continue;
          }

          importedKeys.add(
            duplicateKey
          );

          /* ---------------------------------------------
             DATABASE DUPLICATE CHECK
          --------------------------------------------- */

          const {
            data: existing,
            error:
            duplicateError,
          } = await supabase
            .from(
              "daily_fixed_tasks"
            )
            .select("id")
            .eq(
              "task_date",
              safeDate
            )
            .eq(
              "assigned_to",
              employee.id
            )
            .eq(
              "report_name",
              row.reportName.trim()
            )
            .limit(1);

          if (duplicateError) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                duplicateError.message,
            });

            continue;
          }

          if (
            existing &&
            existing.length > 0
          ) {
            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                "Same task already exists for this employee today.",
            });

            continue;
          }

          /* ---------------------------------------------
             INSERT
          --------------------------------------------- */

          const payload = {
            /*
             * IMPORTANT:
             *
             * This is guaranteed to be:
             *
             * YYYY-MM-DD
             */
            task_date:
              safeDate,

            report_name:
              row.reportName.trim(),

            type:
              row.type ||
              null,

            working_type:
              row.workingType ||
              null,

            assigned_to:
              employee.id,

            estimation_duration:
              row.estimationDuration ||
              null,

            start_report_time:
              row.startReportTime ||
              null,

            shift:
              row.shift ||
              null,

            start_time:
              makeDateTime(
                safeDate,
                row.startTime
              ),

            end_time:
              makeDateTime(
                safeDate,
                row.endTime
              ),

            priority:
              row.priority ||
              "medium",

            remarks:
              row.remarks ||
              null,

            status: "open",
          };

          console.log(
            `Import row ${row.rowNumber}:`,
            payload
          );

          const {
            error,
          } = await supabase
            .from(
              "daily_fixed_tasks"
            )
            .insert(
              payload
            );

          if (error) {
            console.error(
              `Import row ${row.rowNumber} error:`,
              error
            );

            results.push({
              rowNumber:
                row.rowNumber,
              employee:
                employee.full_name,
              report:
                row.reportName,
              success: false,
              message:
                error.message ||
                "Database insert failed.",
            });

            continue;
          }

          results.push({
            rowNumber:
              row.rowNumber,
            employee:
              employee.full_name,
            report:
              row.reportName,
            success: true,
            message:
              "Task allocated successfully.",
          });
        }

        setImportResults(
          results
        );

        const successCount =
          results.filter(
            (item) =>
              item.success
          ).length;

        const failedCount =
          results.filter(
            (item) =>
              !item.success
          ).length;

        if (
          failedCount ===
          0
        ) {
          showToast(
            "success",
            `${successCount} task(s) imported successfully.`
          );
        } else if (
          successCount > 0
        ) {
          showToast(
            "warning",
            `${successCount} imported, ${failedCount} failed.`
          );
        } else {
          showToast(
            "error",
            "No tasks were imported. Please check the errors."
          );
        }

        await loadTasks(
          false
        );
      } catch (error) {
        console.error(
          "Excel import error:",
          error
        );

        showToast(
          "error",
          error instanceof Error
            ? error.message
            : "Excel import failed."
        );
      } finally {
        setImporting(false);
      }
    };

  /* =========================================================
     CLOSE IMPORT
  ========================================================= */

  const closeImportModal =
    () => {
      if (importing) {
        return;
      }

      setShowImportModal(
        false
      );

      setImportRows([]);

      setImportResults([]);

      setSelectedFileName(
        ""
      );
    };

  /* =========================================================
     DELETE TASK
  ========================================================= */

  const deleteTask =
    async (
      task: FixedTask
    ) => {
      const employee =
        employeeMap.get(
          task.assigned_to
        );

      const confirmed =
        window.confirm(
          `Delete "${task.report_name}" assigned to ${employee?.full_name ||
          "employee"
          }?`
        );

      if (!confirmed) {
        return;
      }

      try {
        const {
          error,
        } = await supabase
          .from(
            "daily_fixed_tasks"
          )
          .delete()
          .eq(
            "id",
            task.id
          );

        if (error) {
          console.error(
            "Delete task error:",
            error
          );

          showToast(
            "error",
            error.message ||
            "Unable to delete task."
          );

          return;
        }

        showToast(
          "success",
          "Task deleted successfully."
        );

        await loadTasks(
          false
        );
      } catch (error) {
        console.error(
          "Unexpected delete error:",
          error
        );

        showToast(
          "error",
          "Unable to delete task."
        );
      }
    };

  /* =========================================================
     STATUS STYLE
  ========================================================= */

  const getStatusClasses = (
    status: string
  ) => {
    switch (
    status.toLowerCase()
    ) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300";

      case "wip":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";

      case "hold":
        return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300";

      default:
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300";
    }
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="space-y-6">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <PageHeader
        title="Fixed Daily Tasks"
        subtitle="Manager — assign and monitor MIS fixed daily tasks"
        icon={
          <ClipboardList className="w-5 h-5" />
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={
                downloadTemplate
              }
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Template
            </button>

            <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />

              Import Excel

              <input
                ref={
                  fileInputRef
                }
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={
                  handleExcelFile
                }
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setForm({
                  ...EMPTY_FORM,
                });

                setShowAddModal(
                  true
                );
              }}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Fixed Task
            </button>

            <button
              type="button"
              onClick={() =>
                void loadTasks(
                  false
                )
              }
              disabled={
                refreshing
              }
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing
                    ? "animate-spin"
                    : ""
                  }`}
              />

              Refresh
            </button>
          </div>
        }
      />

      {/* =====================================================
          TODAY DATE INFO
      ===================================================== */}

      <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-900/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-blue-600 dark:text-blue-300">
              Task Date
            </p>

            <p className="font-semibold text-blue-800 dark:text-blue-200">
              {formatDisplayDate(todayStr)}
            </p>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            All new fixed tasks are
            created for today's date.
          </div>
        </div>
      </div>

      {/* =====================================================
          STATS
      ===================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          title="Today's Tasks"
          value={
            stats.total
          }
          icon={
            <ClipboardList className="w-6 h-6" />
          }
          color="primary"
        />

        <StatCard
          title="Employees"
          value={
            stats.employeesWithTasks
          }
          icon={
            <Users className="w-6 h-6" />
          }
          color="blue"
        />

        <StatCard
          title="Open"
          value={
            stats.open
          }
          icon={
            <AlertCircle className="w-6 h-6" />
          }
          color="amber"
        />

        <StatCard
          title="WIP"
          value={
            stats.wip
          }
          icon={
            <ClipboardList className="w-6 h-6" />
          }
          color="amber"
        />

        <StatCard
          title="Completed"
          value={
            stats.completed
          }
          icon={
            <CheckCircle2 className="w-6 h-6" />
          }
          color="green"
        />
      </div>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

            <input
              type="text"
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              className="input-field pl-10"
              placeholder="Search employee / ID / report..."
            />
          </div>

          <select
            value={
              employeeFilter
            }
            onChange={(
              event
            ) =>
              setEmployeeFilter(
                event.target.value
              )
            }
            className="input-field"
          >
            <option value="all">
              All Employees
            </option>

            {employees.map(
              (
                employee
              ) => (
                <option
                  key={
                    employee.id
                  }
                  value={
                    employee.id
                  }
                >
                  {
                    employee.full_name
                  }

                  {employee.employee_id
                    ? ` (${employee.employee_id})`
                    : ""}
                </option>
              )
            )}
          </select>

          <select
            value={
              statusFilter
            }
            onChange={(
              event
            ) =>
              setStatusFilter(
                event.target.value
              )
            }
            className="input-field"
          >
            <option value="all">
              All Status
            </option>

            <option value="open">
              Open
            </option>

            <option value="wip">
              WIP
            </option>

            <option value="hold">
              Hold
            </option>

            <option value="completed">
              Completed
            </option>
          </select>
        </div>
      </div>

      {/* =====================================================
          TASK LIST
      ===================================================== */}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-9 h-9 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTasks.length ===
        0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />

          <h3 className="font-semibold text-slate-800 dark:text-white">
            No Fixed Tasks
          </h3>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            No tasks match the
            current filters.
          </p>

          <button
            type="button"
            onClick={() => {
              setForm({
                ...EMPTY_FORM,
              });

              setShowAddModal(
                true
              );
            }}
            className="btn-primary mt-5 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Fixed Task
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTasks.map(
            (
              task,
              index
            ) => {
              const employee =
                employeeMap.get(
                  task.assigned_to
                );

              return (
                <motion.div
                  key={
                    task.id
                  }
                  initial={{
                    opacity: 0,
                    y: 15,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  transition={{
                    delay:
                      index *
                      0.02,
                  }}
                  className="card p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                        {
                          task.report_name
                        }
                      </h3>

                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {task.type ||
                          "Fixed Task"}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusClasses(
                        task.status
                      )}`}
                    >
                      {task.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-900/10 p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                        {(
                          employee?.full_name ||
                          "?"
                        )
                          .charAt(
                            0
                          )
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          MIS Executive
                        </p>

                        <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">
                          {employee?.full_name ||
                            "Unknown Employee"}
                        </p>

                        {employee?.employee_id && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            ID:{" "}
                            {
                              employee.employee_id
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Working Type
                      </span>

                      <span className="font-medium text-right text-slate-700 dark:text-slate-200">
                        {task.working_type ||
                          "-"}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Shift
                      </span>

                      <span className="font-medium text-right text-slate-700 dark:text-slate-200">
                        {task.shift ||
                          "-"}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Start Report
                      </span>

                      <span className="font-medium text-right text-slate-700 dark:text-slate-200">
                        {formatTime(
                          task.start_report_time
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Estimation
                      </span>

                      <span className="font-medium text-right text-slate-700 dark:text-slate-200">
                        {task.estimation_duration ||
                          "-"}
                      </span>
                    </div>

                    {task.start_time && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">
                          Start Time
                        </span>

                        <span className="font-medium text-right text-slate-700 dark:text-slate-200">
                          {formatTime(
                            task.start_time
                          )}
                        </span>
                      </div>
                    )}

                    {task.end_time && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">
                          End Time
                        </span>

                        <span className="font-medium text-right text-slate-700 dark:text-slate-200">
                          {formatTime(
                            task.end_time
                          )}
                        </span>
                      </div>
                    )}

                    {task.priority && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">
                          Priority
                        </span>

                        <span className="font-medium capitalize text-right text-slate-700 dark:text-slate-200">
                          {
                            task.priority
                          }
                        </span>
                      </div>
                    )}

                    {task.remarks && (
                      <div className="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2">
                        <p className="text-slate-400">
                          Remarks
                        </p>

                        <p className="text-slate-600 dark:text-slate-300 mt-1">
                          {
                            task.remarks
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-700 mt-4 pt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => editTask(task)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void deleteTask(
                          task
                        )
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </motion.div>
              );
            }
          )}
        </div>
      )}

      {/* =====================================================
          ADD FIXED TASK MODAL
      ===================================================== */}

      <Modal
        open={
          showAddModal
        }
        onClose={
          closeAddModal
        }
        title={editingTaskId ? "Edit Fixed Task" : "Add Fixed Task"}
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label className="label-text">
              MIS Executive *
            </label>

            <select
              value={
                form.employee_id
              }
              onChange={(
                event
              ) =>
                updateForm(
                  "employee_id",
                  event.target.value
                )
              }
              className="input-field"
              disabled={
                adding
              }
            >
              <option value="">
                Select Employee
              </option>

              {employees.map(
                (
                  employee
                ) => (
                  <option
                    key={
                      employee.id
                    }
                    value={
                      employee.id
                    }
                  >
                    {
                      employee.full_name
                    }

                    {employee.employee_id
                      ? ` — ${employee.employee_id}`
                      : ""}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="label-text">
              Report Name *
            </label>

            <input
              type="text"
              value={
                form.report_name
              }
              onChange={(
                event
              ) =>
                updateForm(
                  "report_name",
                  event.target.value
                )
              }
              className="input-field"
              placeholder="Enter report name"
              disabled={
                adding
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Type
              </label>

              <select
                value={
                  form.type
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "type",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
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
                  form.working_type
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "working_type",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Estimation Duration
              </label>

              <input
                type="text"
                value={
                  form.estimation_duration
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "estimation_duration",
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="Example: 30 min"
                disabled={
                  adding
                }
              />
            </div>

            <div>
              <label className="label-text">
                Start the Report
              </label>

              <input
                type="time"
                value={
                  form.start_the_report
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "start_the_report",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Shift *
              </label>

              <select
                value={
                  form.shift
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "shift",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
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

            <div>
              <label className="label-text">
                Priority
              </label>

              <select
                value={
                  form.priority
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "priority",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-text">
                Start Time
              </label>

              <input
                type="time"
                value={
                  form.start_time
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "start_time",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
              />
            </div>

            <div>
              <label className="label-text">
                End Time
              </label>

              <input
                type="time"
                value={
                  form.end_time
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "end_time",
                    event.target.value
                  )
                }
                className="input-field"
                disabled={
                  adding
                }
              />
            </div>
          </div>

          <div>
            <label className="label-text">
              Remarks
            </label>

            <textarea
              value={
                form.remarks
              }
              onChange={(
                event
              ) =>
                updateForm(
                  "remarks",
                  event.target.value
                )
              }
              className="input-field min-h-[90px]"
              placeholder="Optional remarks..."
              disabled={
                adding
              }
            />
          </div>

          <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-900/10 px-4 py-3">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              This task will be
              created for{" "}
              <strong>
                {formatDisplayDate(todayStr)}
              </strong>{" "}
              and assigned to
              the selected MIS
              Executive.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={
                closeAddModal
              }
              disabled={
                adding
              }
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
              disabled={
                adding
              }
              className="btn-primary flex items-center gap-2"
            >
              {editingTaskId
                ? <Pencil className="w-4 h-4" />
                : <Plus className="w-4 h-4" />}

              {adding
                ? (editingTaskId ? "Saving..." : "Adding...")
                : (editingTaskId ? "Save Changes" : "Assign Fixed Task")}
            </button>
          </div>
        </div>
      </Modal>

      {/* =====================================================
          EXCEL IMPORT MODAL
      ===================================================== */}

      <Modal
        open={
          showImportModal
        }
        onClose={
          closeImportModal
        }
        title="Import Fixed Tasks from Excel"
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>

              <div>
                <p className="font-semibold text-slate-800 dark:text-white">
                  {selectedFileName ||
                    "Excel File"}
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {
                    importRows.length
                  }{" "}
                  row(s) detected
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
              Required Fields
            </p>

            <p className="text-xs text-blue-600 dark:text-blue-300">
              Employee ID or Employee
              Name + Report Name +
              Start Report Time +
              Shift
            </p>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Employee ID is matched
              first. If Employee ID
              is empty, Employee Name
              is matched.
            </p>
          </div>

          {importRows.length >
            0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
                      <tr>
                        <th className="text-left p-3">
                          Row
                        </th>

                        <th className="text-left p-3">
                          Employee
                        </th>

                        <th className="text-left p-3">
                          Report
                        </th>

                        <th className="text-left p-3">
                          Start
                        </th>

                        <th className="text-left p-3">
                          Shift
                        </th>

                        <th className="text-left p-3">
                          Type
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {importRows.map(
                        (
                          row
                        ) => (
                          <tr
                            key={
                              row.rowNumber
                            }
                            className="border-t border-slate-100 dark:border-slate-700"
                          >
                            <td className="p-3">
                              {
                                row.rowNumber
                              }
                            </td>

                            <td className="p-3">
                              {row.employeeName ||
                                row.employeeId ||
                                "-"}
                            </td>

                            <td className="p-3 font-medium">
                              {row.reportName ||
                                "-"}
                            </td>

                            <td className="p-3">
                              {row.startReportTime ||
                                "-"}
                            </td>

                            <td className="p-3">
                              {row.shift ||
                                "-"}
                            </td>

                            <td className="p-3">
                              {row.type ||
                                "-"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {importResults.length >
            0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-slate-800 dark:text-white">
                    Import Result
                  </h4>

                  <div className="text-xs text-slate-500">
                    {
                      importResults.filter(
                        (item) =>
                          item.success
                      ).length
                    }{" "}
                    success /{" "}
                    {
                      importResults.filter(
                        (item) =>
                          !item.success
                      ).length
                    }{" "}
                    failed
                  </div>
                </div>

                <div className="max-h-52 overflow-auto space-y-2">
                  {importResults.map(
                    (
                      result
                    ) => (
                      <div
                        key={`${result.rowNumber}-${result.report}-${result.message}`}
                        className={`rounded-lg px-3 py-2 text-xs border ${result.success
                            ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/10 dark:border-green-900/30 dark:text-green-300"
                            : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-300"
                          }`}
                      >
                        <div className="flex items-start gap-2">
                          {result.success ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          )}

                          <div className="min-w-0">
                            <p className="font-semibold">
                              Row{" "}
                              {
                                result.rowNumber
                              }{" "}
                              —{" "}
                              {result.employee ||
                                "-"}
                            </p>

                            <p className="mt-0.5">
                              {result.report ||
                                "-"}{" "}
                              —{" "}
                              {
                                result.message
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

          <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={
                downloadTemplate
              }
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  closeImportModal
                }
                disabled={
                  importing
                }
                className="btn-secondary"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() =>
                  void importExcelTasks()
                }
                disabled={
                  importing ||
                  importRows.length ===
                  0
                }
                className="btn-primary flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />

                {importing
                  ? "Importing..."
                  : "Import & Allocate"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
