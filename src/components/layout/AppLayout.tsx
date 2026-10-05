import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { NotificationBell } from "./NotificationBell";
import { MeetingInvitationPopup } from "./MeetingInvitationPopup";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Calendar,
  CalendarClock,
  FileText,
  Radio,
  MessageSquare,
  Video,
  FolderOpen,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  UserCheck,
  ListChecks,
  BarChart3,
  Bot,
} from "lucide-react";
import { cn } from "../../utils/helpers";
import { LogoIcon } from "../shared/Logo";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const MANAGER_NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/employees", label: "Employees", icon: Users },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/fixed-tasks", label: "Fixed Daily Tasks", icon: ListChecks },
  { to: "/app/attendance", label: "Attendance", icon: CalendarClock },
  { to: "/app/leaves", label: "Leave Requests", icon: Calendar },
  { to: "/app/live-status", label: "Live Status", icon: Radio },
  { to: "/app/chat", label: "Chat", icon: MessageSquare },
  { to: "/app/meetings", label: "Meetings", icon: Video },
  { to: "/app/files", label: "Files", icon: FolderOpen },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/fixed-task-reports", label: "Fixed Task Reports", icon: BarChart3 },
  { to: "/app/boss-ai", label: "BOSS AI", icon: Bot },
  { to: "/app/profile", label: "Profile", icon: UserIcon },
];

const EMPLOYEE_NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/tasks", label: "My Tasks", icon: CheckSquare },
  { to: "/app/fixed-tasks", label: "Fixed Daily Tasks", icon: ListChecks },
  { to: "/app/attendance", label: "My Attendance", icon: CalendarClock },
  { to: "/app/leaves", label: "Apply Leave", icon: Calendar },
  { to: "/app/activity", label: "Daily Activity", icon: UserCheck },
  { to: "/app/chat", label: "Chat", icon: MessageSquare },
  { to: "/app/meetings", label: "Meetings", icon: Video },
  { to: "/app/files", label: "Files", icon: FolderOpen },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/profile", label: "Profile", icon: UserIcon },
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = profile?.role === "manager" ? MANAGER_NAV : EMPLOYEE_NAV;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-30 glass border-r border-slate-200/50 dark:border-slate-700/50">
        <SidebarContent
          navItems={navItems}
          profile={profile}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Sidebar - Mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 w-64 z-50 glass border-r border-slate-200/50 dark:border-slate-700/50 lg:hidden flex flex-col"
            >
              <SidebarContent
                navItems={navItems}
                profile={profile}
                onSignOut={handleSignOut}
                onClose={() => setSidebarOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 glass border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-20 flex items-center px-4 sm:px-6 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-ghost p-2"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 lg:hidden">
            <LogoIcon size={32} />
            <span className="font-bold text-slate-900 dark:text-white text-sm">Kalyani MIS</span>
          </div>

          <div className="hidden lg:block">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              {profile?.role === "manager" ? "Manager Dashboard" : "Employee Dashboard"}
            </h2>
          </div>

          <div className="flex-1" />

          <button
            onClick={toggleTheme}
            className="btn-ghost p-2"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </button>

          <NotificationBell unreadCount={unreadCount} />

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white text-sm font-semibold">
              {profile?.full_name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">
                {profile?.full_name}
              </p>
              <p className="text-xs text-slate-400 leading-tight">
                {profile?.role === "manager" ? "Manager" : "MIS Executive"}
              </p>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 flex flex-col min-h-0">
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>

          {/* Footer */}
          <footer className="flex-shrink-0 py-2 px-4 sm:px-6 lg:px-8 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-end">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Kalyani Motors MIS Team Only use
              </span>
            </div>
          </footer>
        </div>
      </div>

      {/* Meeting invitation popup */}
      <MeetingInvitationPopup />
    </div>
  );
}

function SidebarContent({
  navItems,
  profile,
  onSignOut,
  onClose,
}: {
  navItems: NavItem[];
  profile: { full_name: string; role: string } | null;
  onSignOut: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      {/* Logo area */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-200/50 dark:border-slate-700/50 flex-shrink-0">
        <LogoIcon size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 dark:text-white text-sm truncate">
            Kalyani Motors
          </p>
          <p className="text-xs text-slate-400 truncate">MIS Team Tracker</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden btn-ghost p-1.5">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary-600 text-white shadow-md shadow-primary-500/30"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              )
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-200/50 dark:border-slate-700/50 p-3 flex-shrink-0">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </>
  );
}
