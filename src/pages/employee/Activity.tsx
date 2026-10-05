import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { supabase } from "../../services/supabaseClient";
import { formatDateTime } from "../../utils/helpers";
import type { Activity } from "../../types";
import { UserCheck, CheckCircle2, Coffee, UtensilsCrossed, LogIn, LogOut, FileText, MessageSquare } from "lucide-react";

const ACTIVITY_ICONS: Record<string, typeof CheckCircle2> = {
  check_in: LogIn,
  check_out: LogOut,
  break_start: Coffee,
  break_end: Coffee,
  lunch_start: UtensilsCrossed,
  lunch_end: UtensilsCrossed,
  task_update: CheckCircle2,
  leave_apply: FileText,
  welcome_checkin: LogIn,
  chat_message: MessageSquare,
};

const ACTIVITY_COLORS: Record<string, string> = {
  check_in: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  check_out: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  break_start: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  break_end: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  lunch_start: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  lunch_end: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  task_update: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  leave_apply: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  welcome_checkin: "bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400",
};

export default function EmployeeActivity() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      setActivities((data ?? []) as Activity[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div>
      <PageHeader
        title="Daily Activity"
        subtitle="Your activity log and timeline"
        icon={<UserCheck className="w-5 h-5" />}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <div className="card p-12 text-center">
          <UserCheck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No activity recorded yet</p>
        </div>
      ) : (
        <div className="card p-5">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

            <div className="space-y-4">
              {activities.map((activity, i) => {
                const Icon = ACTIVITY_ICONS[activity.type] || CheckCircle2;
                const colorClass = ACTIVITY_COLORS[activity.type] || "bg-slate-100 dark:bg-slate-800 text-slate-500";
                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-start gap-4 relative"
                  >
                    <div className={`w-10 h-10 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0 z-10 border-4 border-white dark:border-slate-800`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {activity.description}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatDateTime(activity.created_at)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
