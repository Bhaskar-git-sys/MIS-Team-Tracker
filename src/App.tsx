import { Routes, Route, Navigate } from "react-router-dom";
import { type ReactNode } from "react";
import { useAuth } from "./contexts/AuthContext";
import { ToastContainer } from "./components/shared/Toast";
import Login from "./pages/Login";
import WelcomeAnimation from "./pages/WelcomeAnimation";
import AppLayout from "./components/layout/AppLayout";
import ManagerDashboard from "./pages/manager/Dashboard";
import Employees from "./pages/manager/Employees";
import ManagerTasks from "./pages/manager/Tasks";
import ManagerAttendance from "./pages/manager/Attendance";
import ManagerLeaves from "./pages/manager/Leaves";
import LiveStatus from "./pages/manager/LiveStatus";
import Reports from "./pages/manager/Reports";
import FixedDailyTasks from "./pages/manager/FixedDailyTasks";
import FixedTaskReports from "./pages/manager/FixedTaskReports";
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeeTasks from "./pages/employee/Tasks";
import EmployeeAttendance from "./pages/employee/Attendance";
import EmployeeLeaves from "./pages/employee/Leaves";
import EmployeeActivity from "./pages/employee/Activity";
import EmployeeReports from "./pages/employee/Reports";
import EmployeeFixedTasks from "./pages/employee/FixedDailyTasks";
import Chat from "./pages/Chat";
import Meetings from "./pages/Meetings";
import Profile from "./pages/Profile";
import Files from "./pages/Files";
import NotFound from "./pages/NotFound";
import BossAI from "./pages/manager/BossAI";

function EmployeeAppGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route
        path="/welcome"
        element={profile.role === "manager" ? <Navigate to="/app" replace /> : <WelcomeAnimation />}
      />
      <Route
        path="/app"
        element={
          profile.role === "manager" ? (
            <AppLayout />
          ) : (
            <EmployeeAppGuard>
              <AppLayout />
            </EmployeeAppGuard>
          )
        }
      >
        {profile.role === "manager" ? (
          <>
            <Route index element={<ManagerDashboard />} />
            <Route path="employees" element={<Employees />} />
            <Route path="tasks" element={<ManagerTasks />} />
            <Route path="fixed-tasks" element={<FixedDailyTasks />} />
            <Route path="fixed-task-reports" element={<FixedTaskReports />} />
            <Route path="boss-ai" element={<BossAI />} />
            <Route path="attendance" element={<ManagerAttendance />} />
            <Route path="leaves" element={<ManagerLeaves />} />
            <Route path="live-status" element={<LiveStatus />} />
            <Route path="reports" element={<Reports />} />
            <Route path="chat" element={<Chat />} />
            <Route path="meetings" element={<Meetings />} />
            <Route path="files" element={<Files />} />
            <Route path="profile" element={<Profile />} />
          </>
        ) : (
          <>
            <Route index element={<EmployeeDashboard />} />
            <Route path="fixed-tasks" element={<EmployeeFixedTasks />} />
            <Route path="tasks" element={<EmployeeTasks />} />
            <Route path="attendance" element={<EmployeeAttendance />} />
            <Route path="leaves" element={<EmployeeLeaves />} />
            <Route path="activity" element={<EmployeeActivity />} />
            <Route path="reports" element={<EmployeeReports />} />
            <Route path="chat" element={<Chat />} />
            <Route path="meetings" element={<Meetings />} />
            <Route path="files" element={<Files />} />
            <Route path="profile" element={<Profile />} />
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to="/welcome" replace />} />
    </Routes>
  );
}

export default function App() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <ProtectedRoutes />
      <ToastContainer />
    </>
  );
}
