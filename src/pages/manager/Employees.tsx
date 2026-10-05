import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { showToast } from "../../components/shared/Toast";
import { Avatar } from "../../components/shared/Avatar";
import { Modal } from "../../components/shared/Modal";

import {
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Users,
  Mail,
  CalendarDays,
  UserRound,
  LockKeyhole,
  Search,
  X,
  KeyRound,
  Phone,
  BriefcaseBusiness,
  Building2,
  UserPlus,
  Trash2,
  AlertTriangle,
} from "lucide-react";

import type { Profile } from "../../types";
import { supabase } from "../../services/supabaseClient";

/* ============================================================
   TYPES
============================================================ */

type EmployeeForm = {
  full_name: string;
  employee_id: string;
  email: string;
  username: string;
  password: string;
  phone: string;
  position: string;
  department: string;
  date_of_joining: string;
  exit_date: string;
  status: string;
};

/* ============================================================
   OPTIONS
============================================================ */

const POSITION_OPTIONS = [
  "MIS Executive",
  "Manager",
  "Team Manager",
  "Others",
];

const DEPARTMENT_OPTIONS = [
  "MIS",
  "Sales",
  "Service",
  "CCD",
];

/* ============================================================
   EMPTY FORM
============================================================ */

const EMPTY_FORM: EmployeeForm = {
  full_name: "",
  employee_id: "",
  email: "",
  username: "",
  password: "",
  phone: "",
  position: "",
  department: "MIS",
  date_of_joining: "",
  exit_date: "",
  status: "Active",
};

/* ============================================================
   STATUS OPTIONS
============================================================ */

const STATUS_OPTIONS = [
  "Active",
  "Inactive",
  "On Leave",
  "Sick Leave",
  "Casual Leave",
  "Earned Leave",
];

/* ============================================================
   LEAVE STATUSES
============================================================ */

const LEAVE_STATUSES = new Set([
  "On Leave",
  "Sick Leave",
  "Casual Leave",
  "Earned Leave",
]);

/* ============================================================
   TODAY
============================================================ */

function getTodayString(): string {
  const today = new Date();

  const year = today.getFullYear();

  const month = String(
    today.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    today.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ============================================================
   NORMALIZE DATE
   Handles accidental spaces such as:
   2026 -09 -30
============================================================ */

function normalizeDateString(
  value?: string | null
): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/(\d{4})-(\d{2})-(\d{2})/, "$1-$2-$3");
}

/* ============================================================
   AUTOMATIC STATUS
============================================================ */

function getAutomaticStatus(
  exitDate?: string | null,
  currentStatus?: string | null
): string {
  const status =
    currentStatus || "Active";

  const normalizedExitDate =
    normalizeDateString(exitDate);

  /*
   * No exit date:
   * Preserve manually selected status.
   */
  if (!normalizedExitDate) {
    return status;
  }

  const today = getTodayString();

  /*
   * Exit date today or earlier:
   * Automatically Inactive.
   */
  if (
    normalizedExitDate <= today
  ) {
    return "Inactive";
  }

  /*
   * Future exit date:
   * Preserve leave status.
   */
  if (
    LEAVE_STATUSES.has(status)
  ) {
    return status;
  }

  return "Active";
}

/* ============================================================
   FORMAT DATE
============================================================ */

function formatDate(
  date?: string | null
): string {
  if (!date) {
    return "-";
  }

  const normalizedDate =
    normalizeDateString(date);

  const parts =
    normalizedDate.split("-");

  if (parts.length !== 3) {
    return date;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !year ||
    !month ||
    !day
  ) {
    return date;
  }

  const value = new Date(
    year,
    month - 1,
    day
  );

  if (
    Number.isNaN(
      value.getTime()
    )
  ) {
    return date;
  }

  return value.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

/* ============================================================
   DATE TO DAY NUMBER
============================================================ */

function dateToDayNumber(
  dateString: string
): number | null {
  const normalizedDate =
    normalizeDateString(
      dateString
    );

  if (!normalizedDate) {
    return null;
  }

  const parts =
    normalizedDate.split("-");

  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (
    Number.isNaN(
      date.getTime()
    ) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return Math.floor(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ) / 86400000
  );
}

/* ============================================================
   TENURE
============================================================ */

function getTenureDays(
  dateOfJoining?: string | null,
  exitDate?: string | null,
  status?: string | null
): number {
  const normalizedJoiningDate =
    normalizeDateString(
      dateOfJoining
    );

  if (!normalizedJoiningDate) {
    return 0;
  }

  const joiningDay =
    dateToDayNumber(
      normalizedJoiningDate
    );

  if (joiningDay === null) {
    return 0;
  }

  let endDate =
    getTodayString();

  const automaticStatus =
    getAutomaticStatus(
      exitDate,
      status
    );

  const normalizedExitDate =
    normalizeDateString(
      exitDate
    );

  /*
   * If employee is inactive because
   * exit date has been reached,
   * calculate tenure up to exit date.
   */
  if (
    automaticStatus ===
      "Inactive" &&
    normalizedExitDate
  ) {
    endDate =
      normalizedExitDate;
  }

  const endingDay =
    dateToDayNumber(endDate);

  if (endingDay === null) {
    return 0;
  }

  return Math.max(
    0,
    endingDay - joiningDay
  );
}

/* ============================================================
   EMPLOYEES PAGE
============================================================ */

export default function Employees() {
  const { profile } = useAuth();

  /* ==========================================================
     STATE
  ========================================================== */

  const [employees, setEmployees] =
    useState<Profile[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [editingEmployee, setEditingEmployee] =
    useState<Profile | null>(null);

  const [showNewEmployee, setShowNewEmployee] =
    useState(false);

  const [resetPasswordEmployee, setResetPasswordEmployee] =
    useState<Profile | null>(null);

  const [newPassword, setNewPassword] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [creating, setCreating] =
    useState(false);

  const [resettingPassword, setResettingPassword] =
    useState(false);

  const [deletingEmployee, setDeletingEmployee] =
    useState<Profile | null>(null);

  const [deleting, setDeleting] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [form, setForm] =
    useState<EmployeeForm>({
      ...EMPTY_FORM,
    });

  /* ==========================================================
     LOAD EMPLOYEES
     
     IMPORTANT:
     Exit Date today or earlier automatically changes
     profiles.status to Inactive in Supabase.
  ========================================================== */

  const loadEmployees = async () => {
    setLoading(true);

    try {
      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq(
          "role",
          "mis_employee"
        )
        .order("full_name", {
          ascending: true,
        });

      if (error) {
        console.error(
          "Failed to load employees:",
          error
        );

        showToast(
          "error",
          error.message ||
            "Failed to load employees"
        );

        setEmployees([]);
        return;
      }

      const loadedEmployees =
        (data ?? []) as Profile[];

      /* ======================================================
         AUTOMATIC EXIT DATE STATUS SYNC
      ====================================================== */

      const today =
        getTodayString();

      /*
       * Find all employees whose exit date
       * has been reached and DB status is
       * not already Inactive.
       */
      const employeesToDeactivate =
        loadedEmployees.filter(
          (employee) => {
            const exitDate =
              normalizeDateString(
                employee.exit_date
              );

            if (!exitDate) {
              return false;
            }

            return (
              exitDate <= today &&
              employee.status !==
                "Inactive"
            );
          }
        );

      /*
       * Update Supabase.
       */
      if (
        employeesToDeactivate.length >
        0
      ) {
        console.log(
          "Employees to automatically deactivate:",
          employeesToDeactivate.map(
            (employee) => ({
              id: employee.id,
              name: employee.full_name,
              exit_date:
                employee.exit_date,
            })
          )
        );

        for (
          const employee of
            employeesToDeactivate
        ) {
          const {
            error: updateError,
          } = await supabase
            .from("profiles")
            .update({
              status: "Inactive",
            })
            .eq(
              "id",
              employee.id
            );

          if (updateError) {
            console.error(
              `Failed to mark ${employee.full_name} as Inactive:`,
              updateError
            );
          } else {
            console.log(
              `${employee.full_name} automatically marked Inactive`
            );

            /*
             * Update local object too.
             */
            employee.status =
              "Inactive";
          }
        }
      }

      /*
       * Set final employee list.
       */
      setEmployees(
        loadedEmployees
      );
    } catch (error) {
      console.error(
        "Employee loading exception:",
        error
      );

      showToast(
        "error",
        "Unable to load employees"
      );

      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    void loadEmployees();
  }, []);

  /* ==========================================================
     SEARCH
  ========================================================== */

  const filteredEmployees =
    useMemo(() => {
      const value =
        search
          .trim()
          .toLowerCase();

      if (!value) {
        return employees;
      }

      return employees.filter(
        (employee) => {
          const name =
            employee.full_name
              ?.toLowerCase() ||
            "";

          const employeeId =
            employee.employee_id
              ?.toLowerCase() ||
            "";

          const email =
            employee.email
              ?.toLowerCase() ||
            "";

          const username =
            employee.username
              ?.toLowerCase() ||
            "";

          const department =
            employee.department
              ?.toLowerCase() ||
            "";

          const phone =
            employee.phone
              ?.toLowerCase() ||
            "";

          const position =
            employee.position
              ?.toLowerCase() ||
            "";

          return (
            name.includes(value) ||
            employeeId.includes(value) ||
            email.includes(value) ||
            username.includes(value) ||
            department.includes(value) ||
            phone.includes(value) ||
            position.includes(value)
          );
        }
      );
    }, [employees, search]);

  /* ==========================================================
     OPEN EDIT
  ========================================================== */

  const openEdit = (
    employee: Profile
  ) => {
    const automaticStatus =
      getAutomaticStatus(
        employee.exit_date ||
          "",
        employee.status ||
          "Active"
      );

    setEditingEmployee(
      employee
    );

    setShowNewEmployee(
      false
    );

    setForm({
      full_name:
        employee.full_name ||
        "",

      employee_id:
        employee.employee_id ||
        "",

      email:
        employee.email ||
        "",

      username:
        employee.username ||
        "",

      password: "",

      phone:
        employee.phone ||
        "",

      position:
        employee.position ||
        "",

      department:
        employee.department ||
        "MIS",

      date_of_joining:
        normalizeDateString(
          employee.date_of_joining
        ),

      exit_date:
        normalizeDateString(
          employee.exit_date
        ),

      status:
        automaticStatus,
    });
  };

  /* ==========================================================
     OPEN NEW EMPLOYEE
  ========================================================== */

  const openNewEmployee = () => {
    setEditingEmployee(
      null
    );

    setForm({
      ...EMPTY_FORM,
    });

    setShowNewEmployee(
      true
    );
  };

  /* ==========================================================
     CLOSE MAIN MODAL
  ========================================================== */

  const closeModal = () => {
    if (
      saving ||
      creating
    ) {
      return;
    }

    setEditingEmployee(
      null
    );

    setShowNewEmployee(
      false
    );

    setForm({
      ...EMPTY_FORM,
    });
  };

  /* ==========================================================
     UPDATE FORM FIELD
  ========================================================== */

  const updateForm = (
    field: keyof EmployeeForm,
    value: string
  ) => {
    setForm(
      (previous) => ({
        ...previous,
        [field]: value,
      })
    );
  };

  /* ==========================================================
     EXIT DATE CHANGE
  ========================================================== */

  const handleExitDateChange = (
    exitDate: string
  ) => {
    const normalizedExitDate =
      normalizeDateString(
        exitDate
      );

    setForm(
      (previous) => ({
        ...previous,

        exit_date:
          normalizedExitDate,

        status:
          getAutomaticStatus(
            normalizedExitDate,
            previous.status
          ),
      })
    );
  };

  /* ==========================================================
     STATUS CHANGE
  ========================================================== */

  const handleStatusChange = (
    status: string
  ) => {
    setForm(
      (previous) => ({
        ...previous,

        status:
          getAutomaticStatus(
            previous.exit_date,
            status
          ),
      })
    );
  };

  /* ==========================================================
     VALIDATE EMPLOYEE FORM
  ========================================================== */

  const validateEmployeeForm = (
    isCreating: boolean
  ): boolean => {
    if (
      !form.full_name.trim()
    ) {
      showToast(
        "warning",
        "Employee name is required"
      );

      return false;
    }

    if (
      !form.employee_id.trim()
    ) {
      showToast(
        "warning",
        "Employee ID is required"
      );

      return false;
    }

    if (
      !form.email.trim()
    ) {
      showToast(
        "warning",
        "Email ID is required"
      );

      return false;
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailRegex.test(
        form.email.trim()
      )
    ) {
      showToast(
        "warning",
        "Please enter a valid email ID"
      );

      return false;
    }

    if (
      isCreating &&
      !form.username.trim()
    ) {
      showToast(
        "warning",
        "Username is required"
      );

      return false;
    }

    if (
      isCreating &&
      (
        !form.password ||
        form.password.length < 6
      )
    ) {
      showToast(
        "warning",
        "Password must contain at least 6 characters"
      );

      return false;
    }

    const joiningDate =
      normalizeDateString(
        form.date_of_joining
      );

    const exitDate =
      normalizeDateString(
        form.exit_date
      );

    if (
      joiningDate &&
      exitDate &&
      exitDate < joiningDate
    ) {
      showToast(
        "warning",
        "Exit Date cannot be before Date of Joining"
      );

      return false;
    }

    return true;
  };

  /* ==========================================================
     SAVE EXISTING EMPLOYEE
  ========================================================== */

  const saveEmployee =
    async () => {
      if (
        !editingEmployee
      ) {
        return;
      }

      if (
        !validateEmployeeForm(
          false
        )
      ) {
        return;
      }

      setSaving(true);

      try {
        const dateOfJoining =
          normalizeDateString(
            form.date_of_joining
          );

        const exitDate =
          normalizeDateString(
            form.exit_date
          );

        /*
         * Automatically determine final status.
         */
        const finalStatus =
          getAutomaticStatus(
            exitDate,
            form.status
          );

        const updatePayload = {
          full_name:
            form.full_name.trim(),

          employee_id:
            form.employee_id.trim(),

          email:
            form.email.trim(),

          username:
            form.username.trim(),

          phone:
            form.phone.trim(),

          position:
            form.position.trim(),

          department:
            form.department.trim() ||
            "MIS",

          date_of_joining:
            dateOfJoining ||
            null,

          exit_date:
            exitDate ||
            null,

          status:
            finalStatus,
        };

        const {
          error,
        } = await supabase
          .from("profiles")
          .update(
            updatePayload
          )
          .eq(
            "id",
            editingEmployee.id
          );

        if (error) {
          console.error(
            "Employee update failed:",
            error
          );

          showToast(
            "error",
            error.message ||
              "Employee update failed"
          );

          return;
        }

        showToast(
          "success",
          finalStatus ===
            "Inactive"
            ? "Employee updated and marked Inactive"
            : "Employee updated successfully"
        );

        setEditingEmployee(
          null
        );

        setShowNewEmployee(
          false
        );

        setForm({
          ...EMPTY_FORM,
        });

        await loadEmployees();
      } catch (error) {
        console.error(
          "Employee update exception:",
          error
        );

        showToast(
          "error",
          "Unable to update employee. Please try again."
        );
      } finally {
        setSaving(false);
      }
    };

  /* ==========================================================
     CREATE NEW EMPLOYEE
  ========================================================== */

  const createEmployee =
    async () => {
      if (
        !validateEmployeeForm(
          true
        )
      ) {
        return;
      }

      setCreating(true);

      try {
        const dateOfJoining =
          normalizeDateString(
            form.date_of_joining
          );

        const exitDate =
          normalizeDateString(
            form.exit_date
          );

        const finalStatus =
          getAutomaticStatus(
            exitDate,
            form.status
          );

        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "create-employee",
            {
              body: {
                full_name:
                  form.full_name.trim(),

                employee_id:
                  form.employee_id.trim(),

                email:
                  form.email.trim(),

                username:
                  form.username.trim(),

                password:
                  form.password,

                phone:
                  form.phone.trim(),

                position:
                  form.position.trim(),

                department:
                  form.department.trim() ||
                  "MIS",

                date_of_joining:
                  dateOfJoining ||
                  null,

                exit_date:
                  exitDate ||
                  null,

                status:
                  finalStatus,

                role:
                  "mis_employee",
              },
            }
          );

        if (error) {
          console.error(
            "Create employee Edge Function error:",
            error
          );

          let errorMessage =
            error.message ||
            "Failed to create employee";

          if (
            error.context instanceof
            Response
          ) {
            try {
              const responseBody =
                await error.context
                  .clone()
                  .json();

              if (
                typeof responseBody?.error ===
                "string"
              ) {
                errorMessage =
                  responseBody.error;
              }
            } catch {
              // Keep SDK error.
            }
          }

          showToast(
            "error",
            errorMessage
          );

          return;
        }

        if (data?.error) {
          showToast(
            "error",
            data.error
          );

          return;
        }

        showToast(
          "success",
          "New MIS employee created successfully"
        );

        setEditingEmployee(
          null
        );

        setShowNewEmployee(
          false
        );

        setForm({
          ...EMPTY_FORM,
        });

        await loadEmployees();
      } catch (error) {
        console.error(
          "Create employee exception:",
          error
        );

        showToast(
          "error",
          "Unable to create employee. Please try again."
        );
      } finally {
        setCreating(false);
      }
    };

  /* ==========================================================
     RESET EMPLOYEE PASSWORD
  ========================================================== */

  const resetEmployeePassword =
    async () => {
      if (
        !resetPasswordEmployee
      ) {
        return;
      }

      const password =
        newPassword.trim();

      if (!password) {
        showToast(
          "warning",
          "New password is required"
        );

        return;
      }

      if (
        password.length < 6
      ) {
        showToast(
          "warning",
          "Password must contain at least 6 characters"
        );

        return;
      }

      setResettingPassword(
        true
      );

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "reset-password",
            {
              body: {
                user_id:
                  resetPasswordEmployee.id,

                new_password:
                  password,
              },
            }
          );

        console.log(
          "RESET PASSWORD DATA:",
          data
        );

        console.log(
          "RESET PASSWORD ERROR:",
          error
        );

        if (error) {
          console.error(
            "FULL EDGE FUNCTION ERROR:",
            error
          );

          showToast(
            "error",
            `Edge Function Error: ${error.message}`
          );

          return;
        }

        if (data?.error) {
          showToast(
            "error",
            data.error
          );

          return;
        }

        if (
          data?.success === false
        ) {
          showToast(
            "error",
            data?.message ||
              "Password reset failed"
          );

          return;
        }

        showToast(
          "success",
          `Password reset successfully for ${resetPasswordEmployee.full_name}. Please use the new password to login.`
        );

        setResetPasswordEmployee(
          null
        );

        setNewPassword("");
      } catch (error) {
        console.error(
          "Password reset exception:",
          error
        );

        showToast(
          "error",
          "Unable to reset password. Please try again."
        );
      } finally {
        setResettingPassword(
          false
        );
      }
    };

  /* ==========================================================
     PERMANENT DELETE EMPLOYEE
     
     IMPORTANT:
     Service Role key must remain inside Edge Function.
     Never put Service Role key in React.
  ========================================================== */

  const permanentlyDeleteEmployee =
    async () => {
      if (
        !deletingEmployee
      ) {
        return;
      }

      setDeleting(true);

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "delete-employee",
            {
              body: {
                user_id:
                  deletingEmployee.id,
              },
            }
          );

        if (error) {
          console.error(
            "Delete employee Edge Function error:",
            error
          );

          showToast(
            "error",
            error.message ||
              "Failed to permanently delete employee"
          );

          return;
        }

        if (data?.error) {
          showToast(
            "error",
            data.error
          );

          return;
        }

        showToast(
          "success",
          `${
            deletingEmployee.full_name ||
            "Employee"
          } permanently deleted`
        );

        setDeletingEmployee(
          null
        );

        await loadEmployees();
      } catch (error) {
        console.error(
          "Permanent employee deletion exception:",
          error
        );

        showToast(
          "error",
          "Unable to permanently delete employee. Please try again."
        );
      } finally {
        setDeleting(false);
      }
    };

  /* ==========================================================
     STATUS CLASS
  ========================================================== */

  const getStatusClass = (
    status: string
  ) => {
    switch (status) {
      case "Inactive":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";

      case "On Leave":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";

      case "Sick Leave":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";

      case "Casual Leave":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";

      case "Earned Leave":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";

      default:
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    }
  };

  /* ==========================================================
     ACTIVE / INACTIVE COUNTS
  ========================================================== */

  const activeCount =
    useMemo(() => {
      return employees.filter(
        (employee) =>
          getAutomaticStatus(
            employee.exit_date,
            employee.status
          ) === "Active"
      ).length;
    }, [employees]);

  const inactiveCount =
    useMemo(() => {
      return employees.filter(
        (employee) =>
          getAutomaticStatus(
            employee.exit_date,
            employee.status
          ) === "Inactive"
      ).length;
    }, [employees]);

  const leaveCount =
    useMemo(() => {
      return employees.filter(
        (employee) =>
          LEAVE_STATUSES.has(
            getAutomaticStatus(
              employee.exit_date,
              employee.status
            )
          )
      ).length;
    }, [employees]);

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="space-y-6">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <PageHeader
        title="MIS Employees"
        subtitle={`Manage MIS team members${
          profile?.full_name
            ? ` • ${profile.full_name}`
            : ""
        }`}
        icon={
          <Users className="w-5 h-5" />
        }
        actions={
          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={() =>
                void loadEmployees()
              }
              className="btn-secondary flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh
            </button>

            <button
              type="button"
              onClick={
                openNewEmployee
              }
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />

              New Employee
            </button>

          </div>
        }
      />

      {/* ======================================================
          SUMMARY CARDS
      ====================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* TOTAL */}

        <div className="card p-4">
          <div className="flex items-center justify-between">

            <div>
              <p className="text-sm text-slate-500">
                Total Employees
              </p>

              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {employees.length}
              </p>
            </div>

            <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>

          </div>
        </div>

        {/* ACTIVE */}

        <div className="card p-4">
          <div className="flex items-center justify-between">

            <div>
              <p className="text-sm text-slate-500">
                Active
              </p>

              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {activeCount}
              </p>
            </div>

            <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>

          </div>
        </div>

        {/* ON LEAVE */}

        <div className="card p-4">
          <div className="flex items-center justify-between">

            <div>
              <p className="text-sm text-slate-500">
                On Leave
              </p>

              <p className="text-2xl font-bold text-amber-600 mt-1">
                {leaveCount}
              </p>
            </div>

            <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>

          </div>
        </div>

        {/* INACTIVE */}

        <div className="card p-4">
          <div className="flex items-center justify-between">

            <div>
              <p className="text-sm text-slate-500">
                Inactive
              </p>

              <p className="text-2xl font-bold text-red-600 mt-1">
                {inactiveCount}
              </p>
            </div>

            <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <UserRound className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>

          </div>
        </div>

      </div>

      {/* ======================================================
          SEARCH
      ====================================================== */}

      <div className="card p-4">

        <div className="relative">

          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search employee name, ID, email, username, phone or position..."
            className="input-field pl-10 pr-10"
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch("")
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

        </div>

        {search && (
          <p className="text-xs text-slate-400 mt-2">
            Showing{" "}
            <span className="font-semibold">
              {
                filteredEmployees.length
              }
            </span>{" "}
            of{" "}
            <span className="font-semibold">
              {employees.length}
            </span>{" "}
            employees
          </p>
        )}

      </div>

      {/* ======================================================
          EMPLOYEE LIST
      ====================================================== */}

      {loading ? (

        <div className="card p-16 flex flex-col items-center justify-center">

          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />

          <p className="text-sm text-slate-500 mt-4">
            Loading MIS employees...
          </p>

        </div>

      ) : filteredEmployees.length ===
        0 ? (

        <div className="card p-12 text-center">

          <Users className="w-10 h-10 mx-auto text-slate-400 mb-3" />

          <p className="text-slate-500">
            {search
              ? "No employees match your search."
              : "No MIS employees found."}
          </p>

          {!search && (
            <button
              type="button"
              onClick={
                openNewEmployee
              }
              className="btn-primary mt-4"
            >
              <Plus className="w-4 h-4 inline mr-2" />

              Add New Employee
            </button>
          )}

        </div>

      ) : (

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {filteredEmployees.map(
            (employee) => {

              const automaticStatus =
                getAutomaticStatus(
                  employee.exit_date,
                  employee.status
                );

              const tenureDays =
                getTenureDays(
                  employee.date_of_joining,
                  employee.exit_date,
                  automaticStatus
                );

              const isInactive =
                automaticStatus ===
                "Inactive";

              return (
                <div
                  key={employee.id}
                  className="card p-5 hover:shadow-lg transition-all duration-200"
                >

                  <div className="flex items-start gap-4">

                    {/* AVATAR */}

                    <Avatar
                      name={
                        employee.full_name
                      }
                      src={
                        employee.avatar_url
                      }
                      size="lg"
                    />

                    <div className="min-w-0 flex-1">

                      {/* NAME + STATUS */}

                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <h3 className="font-semibold text-slate-900 dark:text-white text-lg truncate">
                            {
                              employee.full_name ||
                              "Unnamed Employee"
                            }
                          </h3>

                          <p className="text-sm text-slate-500 truncate">
                            {
                              employee.position ||
                              "MIS Executive"
                            }
                          </p>

                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusClass(
                            automaticStatus
                          )}`}
                        >
                          {
                            automaticStatus
                          }
                        </span>

                      </div>

                      {/* EMPLOYEE INFORMATION */}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm">

                        {/* ID */}

                        <div className="flex items-center gap-2 text-slate-500 min-w-0">

                          <UserRound className="w-4 h-4 flex-shrink-0" />

                          <span className="truncate">
                            ID:{" "}
                            {
                              employee.employee_id ||
                              "-"
                            }
                          </span>

                        </div>

                        {/* EMAIL */}

                        <div className="flex items-center gap-2 text-slate-500 min-w-0">

                          <Mail className="w-4 h-4 flex-shrink-0" />

                          <span className="truncate">
                            {
                              employee.email ||
                              "-"
                            }
                          </span>

                        </div>

                        {/* PHONE */}

                        <div className="flex items-center gap-2 text-slate-500 min-w-0">

                          <Phone className="w-4 h-4 flex-shrink-0" />

                          <span className="truncate">
                            {
                              employee.phone ||
                              "-"
                            }
                          </span>

                        </div>

                        {/* POSITION */}

                        <div className="flex items-center gap-2 text-slate-500 min-w-0">

                          <BriefcaseBusiness className="w-4 h-4 flex-shrink-0" />

                          <span className="truncate">
                            {
                              employee.position ||
                              "MIS Executive"
                            }
                          </span>

                        </div>

                        {/* DEPARTMENT */}

                        <div className="flex items-center gap-2 text-slate-500 min-w-0">

                          <Building2 className="w-4 h-4 flex-shrink-0" />

                          <span className="truncate">
                            Department:{" "}
                            {
                              employee.department ||
                              "MIS"
                            }
                          </span>

                        </div>

                        {/* DOJ */}

                        <div className="flex items-center gap-2 text-slate-500">

                          <CalendarDays className="w-4 h-4 flex-shrink-0" />

                          <span>
                            DOJ:{" "}
                            {formatDate(
                              employee.date_of_joining
                            )}
                          </span>

                        </div>

                        {/* EXIT */}

                        <div className="flex items-center gap-2 text-slate-500">

                          <CalendarDays className="w-4 h-4 flex-shrink-0" />

                          <span>
                            Exit:{" "}
                            {formatDate(
                              employee.exit_date
                            )}
                          </span>

                        </div>

                        {/* TENURE */}

                        <div className="flex items-center gap-2 text-slate-500 sm:col-span-2">

                          <CalendarDays className="w-4 h-4 flex-shrink-0" />

                          <span>
                            Tenure:{" "}

                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {
                                tenureDays
                              }{" "}
                              Days
                            </span>
                          </span>

                        </div>

                      </div>

                      {/* INACTIVE INFORMATION */}

                      {isInactive &&
                        employee.exit_date && (
                          <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 px-3 py-2">

                            <p className="text-xs text-red-600 dark:text-red-300">

                              Employee became Inactive on{" "}

                              <span className="font-semibold">
                                {formatDate(
                                  employee.exit_date
                                )}
                              </span>

                            </p>

                          </div>
                        )}

                      {/* BOTTOM ROW */}

                      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">

                        <div className="text-xs text-slate-400 min-w-0">

                          Username:{" "}

                          <span className="font-medium text-slate-500 dark:text-slate-300">
                            {
                              employee.username ||
                              "-"
                            }
                          </span>

                        </div>

                        <div className="flex items-center gap-1">

                          {/* RESET PASSWORD */}

                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordEmployee(
                                employee
                              );

                              setNewPassword(
                                ""
                              );
                            }}
                            className="btn-ghost p-2"
                            aria-label={`Reset password for ${employee.full_name}`}
                            title="Reset password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* EDIT */}

                          <button
                            type="button"
                            onClick={() =>
                              openEdit(
                                employee
                              )
                            }
                            className="btn-ghost p-2"
                            aria-label={`Edit ${employee.full_name}`}
                            title="Edit employee"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* DELETE */}

                          <button
                            type="button"
                            onClick={() =>
                              setDeletingEmployee(
                                employee
                              )
                            }
                            className="btn-ghost p-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            aria-label={`Permanently delete ${employee.full_name}`}
                            title="Permanently delete employee"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                        </div>

                      </div>

                    </div>

                  </div>

                </div>
              );
            }
          )}

        </div>
      )}

      {/* ==========================================================
          CREATE / EDIT EMPLOYEE MODAL
      ========================================================== */}

      <Modal
        open={
          !!editingEmployee ||
          showNewEmployee
        }
        onClose={closeModal}
        title={
          editingEmployee
            ? "Edit Employee"
            : "Create New MIS Employee"
        }
        size="lg"
      >

        <div className="space-y-6">

          {/* EMPLOYEE DETAILS */}

          <div>

            <div className="flex items-center gap-2 mb-3">

              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">

                <UserRound className="w-4 h-4 text-primary-600 dark:text-primary-400" />

              </div>

              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Employee Details
              </h3>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* NAME */}

              <div>
                <label className="label-text">
                  Employee Name *
                </label>

                <input
                  value={
                    form.full_name
                  }
                  onChange={(event) =>
                    updateForm(
                      "full_name",
                      event.target.value
                    )
                  }
                  className="input-field"
                  placeholder="Enter employee name"
                  disabled={
                    saving ||
                    creating
                  }
                />
              </div>

              {/* EMPLOYEE ID */}

              <div>
                <label className="label-text">
                  Employee ID *
                </label>

                <input
                  value={
                    form.employee_id
                  }
                  onChange={(event) =>
                    updateForm(
                      "employee_id",
                      event.target.value
                    )
                  }
                  className="input-field"
                  placeholder="Enter employee ID"
                  disabled={
                    saving ||
                    creating
                  }
                />
              </div>

              {/* EMAIL */}

              <div>
                <label className="label-text">
                  Email ID *
                </label>

                <input
                  type="email"
                  value={
                    form.email
                  }
                  onChange={(event) =>
                    updateForm(
                      "email",
                      event.target.value
                    )
                  }
                  className="input-field"
                  placeholder="employee@company.com"
                  disabled={
                    saving ||
                    creating
                  }
                />
              </div>

              {/* PHONE */}

              <div>
                <label className="label-text">
                  Phone
                </label>

                <input
                  type="tel"
                  value={
                    form.phone
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value
                        .replace(
                          /\D/g,
                          ""
                        )
                        .slice(
                          0,
                          10
                        );

                    updateForm(
                      "phone",
                      value
                    );
                  }}
                  className="input-field"
                  placeholder="10 digit mobile number"
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel"
                  disabled={
                    saving ||
                    creating
                  }
                />

                {form.phone.length >
                  0 &&
                  form.phone.length <
                    10 && (
                    <p className="mt-1 text-xs text-amber-500">
                      Enter 10 digit mobile number
                    </p>
                  )}
              </div>

              {/* POSITION */}

              <div>
                <label className="label-text">
                  Position
                </label>

                <select
                  value={
                    form.position ||
                    ""
                  }
                  onChange={(event) =>
                    updateForm(
                      "position",
                      event.target.value
                    )
                  }
                  className="input-field"
                  disabled={
                    saving ||
                    creating
                  }
                >
                  <option value="">
                    Select Position
                  </option>

                  {POSITION_OPTIONS.map(
                    (position) => (
                      <option
                        key={
                          position
                        }
                        value={
                          position
                        }
                      >
                        {
                          position
                        }
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* DEPARTMENT */}

              <div>
                <label className="label-text">
                  Department
                </label>

                <select
                  value={
                    form.department ||
                    "MIS"
                  }
                  onChange={(event) =>
                    updateForm(
                      "department",
                      event.target.value
                    )
                  }
                  className="input-field"
                  disabled={
                    saving ||
                    creating
                  }
                >
                  {DEPARTMENT_OPTIONS.map(
                    (
                      department
                    ) => (
                      <option
                        key={
                          department
                        }
                        value={
                          department
                        }
                      >
                        {
                          department
                        }
                      </option>
                    )
                  )}
                </select>
              </div>

            </div>

          </div>

          {/* ======================================================
              EMPLOYMENT DATES
          ====================================================== */}

          <div>

            <div className="flex items-center gap-2 mb-3">

              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">

                <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />

              </div>

              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Employee Dates
              </h3>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* DOJ */}

              <div>

                <label className="label-text">
                  Date of Joining
                </label>

                <input
                  type="date"
                  value={
                    form.date_of_joining
                  }
                  onChange={(event) =>
                    updateForm(
                      "date_of_joining",
                      event.target.value
                    )
                  }
                  className="input-field"
                  disabled={
                    saving ||
                    creating
                  }
                />

              </div>

              {/* EXIT DATE */}

              <div>

                <label className="label-text">
                  Exit Date
                </label>

                <input
                  type="date"
                  value={
                    form.exit_date
                  }
                  onChange={(event) =>
                    handleExitDateChange(
                      event.target.value
                    )
                  }
                  className="input-field"
                  disabled={
                    saving ||
                    creating
                  }
                />

                <p className="text-xs text-slate-400 mt-1">
                  Exit Date today or earlier → employee automatically becomes Inactive.
                </p>

              </div>

            </div>

          </div>

          {/* ======================================================
              LOGIN CREDENTIALS
          ====================================================== */}

          {showNewEmployee && (
            <div className="rounded-xl border border-primary-200 dark:border-primary-900/50 bg-primary-50/50 dark:bg-primary-900/10 p-4">

              <div className="flex items-center gap-2 mb-4">

                <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">

                  <LockKeyhole className="w-4 h-4 text-primary-600 dark:text-primary-400" />

                </div>

                <div>

                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Login Credentials
                  </h3>

                  <p className="text-xs text-slate-500">
                    These credentials will be used for MIS employee login.
                  </p>

                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* USERNAME */}

                <div>

                  <label className="label-text">
                    Username *
                  </label>

                  <input
                    value={
                      form.username
                    }
                    onChange={(event) =>
                      updateForm(
                        "username",
                        event.target.value
                      )
                    }
                    className="input-field"
                    placeholder="bhaskar"
                    autoComplete="off"
                    disabled={
                      creating
                    }
                  />

                </div>

                {/* PASSWORD */}

                <div>

                  <label className="label-text">
                    Password *
                  </label>

                  <input
                    type="password"
                    value={
                      form.password
                    }
                    onChange={(event) =>
                      updateForm(
                        "password",
                        event.target.value
                      )
                    }
                    className="input-field"
                    placeholder="Minimum 6 characters"
                    autoComplete="new-password"
                    disabled={
                      creating
                    }
                  />

                </div>

              </div>

              <p className="text-xs text-slate-500 mt-3">
                Password is sent securely to Supabase Authentication and is not stored in the employee profile.
              </p>

            </div>
          )}

          {/* ======================================================
              STATUS
          ====================================================== */}

          <div>

            <label className="label-text">
              Status
            </label>

            <select
              value={getAutomaticStatus(
                form.exit_date,
                form.status
              )}
              onChange={(event) =>
                handleStatusChange(
                  event.target.value
                )
              }
              className="input-field"
              disabled={
                saving ||
                creating ||
                (
                  !!form.exit_date &&
                  getAutomaticStatus(
                    form.exit_date,
                    form.status
                  ) ===
                    "Inactive"
                )
              }
            >

              {STATUS_OPTIONS.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                )
              )}

            </select>

            {form.exit_date &&
              getAutomaticStatus(
                form.exit_date,
                form.status
              ) ===
                "Inactive" && (

                <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 px-3 py-2">

                  <p className="text-xs text-red-600 dark:text-red-300 font-medium">
                    Exit Date has been reached. This employee is automatically Inactive.
                  </p>

                </div>

              )}

          </div>

          {/* ======================================================
              BUTTONS
          ====================================================== */}

          <div className="flex justify-end gap-2 pt-2">

            <button
              type="button"
              onClick={closeModal}
              disabled={
                saving ||
                creating
              }
              className="btn-secondary flex items-center gap-2"
            >

              <X className="w-4 h-4" />

              Cancel

            </button>

            {editingEmployee ? (

              <button
                type="button"
                onClick={() =>
                  void saveEmployee()
                }
                disabled={
                  saving
                }
                className="btn-primary flex items-center gap-2"
              >

                <Save className="w-4 h-4" />

                {saving
                  ? "Saving..."
                  : "Save Changes"}

              </button>

            ) : (

              <button
                type="button"
                onClick={() =>
                  void createEmployee()
                }
                disabled={
                  creating
                }
                className="btn-primary flex items-center gap-2"
              >

                <Plus className="w-4 h-4" />

                {creating
                  ? "Creating..."
                  : "Create Employee"}

              </button>

            )}

          </div>

        </div>

      </Modal>

      {/* ==========================================================
          RESET PASSWORD MODAL
      ========================================================== */}

      <Modal
        open={
          !!resetPasswordEmployee
        }
        onClose={() => {
          if (
            !resettingPassword
          ) {
            setResetPasswordEmployee(
              null
            );

            setNewPassword("");
          }
        }}
        title="Reset Employee Password"
        size="sm"
      >

        <div className="space-y-5">

          {/* EMPLOYEE */}

          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">

                <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" />

              </div>

              <div className="min-w-0">

                <p className="font-semibold text-slate-900 dark:text-white">
                  Reset Password
                </p>

                <p className="text-sm text-slate-500 truncate">
                  {
                    resetPasswordEmployee?.full_name
                  }
                </p>

                <p className="text-xs text-slate-400 mt-0.5">
                  Username:{" "}
                  {
                    resetPasswordEmployee?.username ||
                    "-"
                  }
                </p>

              </div>

            </div>

          </div>

          {/* NEW PASSWORD */}

          <div>

            <label className="label-text">
              New Password *
            </label>

            <input
              type="password"
              value={
                newPassword
              }
              onChange={(event) =>
                setNewPassword(
                  event.target.value
                )
              }
              className="input-field"
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
              disabled={
                resettingPassword
              }
            />

            <p className="text-xs text-slate-400 mt-1">
              Minimum 6 characters required.
            </p>

          </div>

          {/* BUTTONS */}

          <div className="flex justify-end gap-2 pt-2">

            <button
              type="button"
              onClick={() => {
                setResetPasswordEmployee(
                  null
                );

                setNewPassword("");
              }}
              disabled={
                resettingPassword
              }
              className="btn-secondary flex items-center gap-2"
            >

              <X className="w-4 h-4" />

              Cancel

            </button>

            <button
              type="button"
              onClick={() =>
                void resetEmployeePassword()
              }
              disabled={
                resettingPassword
              }
              className="btn-primary flex items-center gap-2"
            >

              <KeyRound className="w-4 h-4" />

              {resettingPassword
                ? "Resetting..."
                : "Reset Password"}

            </button>

          </div>

        </div>

      </Modal>

      {/* ==========================================================
          PERMANENT DELETE CONFIRMATION
      ========================================================== */}

      <Modal
        open={
          !!deletingEmployee
        }
        onClose={() => {
          if (!deleting) {
            setDeletingEmployee(
              null
            );
          }
        }}
        title="Permanently Delete Employee"
        size="sm"
      >

        <div className="space-y-5">

          <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4">

            <div className="flex items-start gap-3">

              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">

                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />

              </div>

              <div className="min-w-0">

                <p className="font-semibold text-red-700 dark:text-red-300">
                  Permanent deletion
                </p>

                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  You are deleting{" "}
                  <strong>
                    {
                      deletingEmployee?.full_name
                    }
                  </strong>{" "}
                  permanently.
                </p>

                <p className="text-xs text-red-600 dark:text-red-300 mt-2">
                  The employee login and related account data may be permanently removed. This action cannot be undone.
                </p>

              </div>

            </div>

          </div>

          <div className="text-sm text-slate-500 space-y-1">

            <p>
              Username:{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {
                  deletingEmployee?.username ||
                  "-"
                }
              </span>
            </p>

            <p>
              Employee ID:{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {
                  deletingEmployee?.employee_id ||
                  "-"
                }
              </span>
            </p>

            <p>
              Email:{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {
                  deletingEmployee?.email ||
                  "-"
                }
              </span>
            </p>

          </div>

          <div className="flex justify-end gap-2 pt-2">

            <button
              type="button"
              onClick={() =>
                setDeletingEmployee(
                  null
                )
              }
              disabled={
                deleting
              }
              className="btn-secondary flex items-center gap-2"
            >

              <X className="w-4 h-4" />

              Cancel

            </button>

            <button
              type="button"
              onClick={() =>
                void permanentlyDeleteEmployee()
              }
              disabled={
                deleting
              }
              className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >

              <Trash2 className="w-4 h-4" />

              {deleting
                ? "Deleting..."
                : "Delete Permanently"}

            </button>

          </div>

        </div>

      </Modal>

    </div>
  );
}
