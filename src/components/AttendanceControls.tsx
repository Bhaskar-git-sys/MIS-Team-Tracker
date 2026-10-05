import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { usePresence } from "../contexts/PresenceContext";
import {
  getTodayAttendance,
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  startLunch,
  endLunch,
  computeLiveWorkingSeconds,
} from "../services/attendanceService";
import type { Attendance } from "../types";
import { formatDuration } from "../utils/helpers";
import { showToast } from "./shared/Toast";
import {
  LogIn,
  LogOut,
  Coffee,
  UtensilsCrossed,
  Clock,
  Timer,
} from "lucide-react";

export function AttendanceControls() {
  const { user } = useAuth();
  const { updateStatus } = usePresence();
  const [record, setRecord] = useState<Attendance | null>(null);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const rec = await getTodayAttendance(user.id);
    setRecord(rec);
    setLiveSeconds(computeLiveWorkingSeconds(rec));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveSeconds(computeLiveWorkingSeconds(record));
    }, 1000);
    return () => clearInterval(interval);
  }, [record]);

  const handleAction = async (action: string, fn: () => Promise<Attendance | null>) => {
    if (!user) return;
    setLoading(action);
    try {
      const result = await fn();
      if (result) {
        setRecord(result);
        // Update presence status
        if (action === "checkin") await updateStatus("online");
        if (action === "checkout") await updateStatus("offline");
        if (action === "break-start") await updateStatus("break");
        if (action === "break-end") await updateStatus("online");
        if (action === "lunch-start") await updateStatus("lunch");
        if (action === "lunch-end") await updateStatus("online");
        showToast("success", `${actionLabel(action)} successful`);
      } else {
        showToast("error", "Action failed. Please try again.");
      }
    } catch {
      showToast("error", "An error occurred");
    } finally {
      setLoading(null);
    }
  };

  const actionLabel = (a: string) => {
    const labels: Record<string, string> = {
      checkin: "Check In",
      checkout: "Check Out",
      "break-start": "Break Started",
      "break-end": "Break Ended",
      "lunch-start": "Lunch Started",
      "lunch-end": "Lunch Ended",
    };
    return labels[a] || a;
  };

  const isCheckedIn = !!record?.check_in_at && !record?.check_out_at;
  const isOnBreak = !!record?.break_start_at && !record?.break_end_at;
  const isOnLunch = !!record?.lunch_start_at && !record?.lunch_end_at;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Timer className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Attendance</h3>
      </div>

      {/* Live timer */}
      {isCheckedIn ? (
        <div className="mb-4 text-center">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Working Time</p>
          <motion.p
            key={liveSeconds}
            className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white"
          >
            {formatDuration(liveSeconds)}
          </motion.p>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs">
            {record?.check_in_at && (
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <LogIn className="w-3 h-3" />
                In: {new Date(record.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {(record?.break_seconds || 0) > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <Coffee className="w-3 h-3" />
                Break: {formatDuration(record.break_seconds)}
              </span>
            )}
            {(record?.lunch_seconds || 0) > 0 && (
              <span className="flex items-center gap-1 text-orange-500">
                <UtensilsCrossed className="w-3 h-3" />
                Lunch: {formatDuration(record.lunch_seconds)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-4 text-center py-4">
          <Clock className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-400">Not checked in yet</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        {!isCheckedIn && (
          <button
            onClick={() => handleAction("checkin", () => checkIn(user!.id))}
            disabled={loading !== null}
            className="btn-primary text-sm flex items-center justify-center gap-2 col-span-2"
          >
            {loading === "checkin" ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            Check In
          </button>
        )}

        {isCheckedIn && !isOnBreak && !isOnLunch && (
          <>
            <button
              onClick={() => handleAction("break-start", () => startBreak(user!.id))}
              disabled={loading !== null}
              className="px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Coffee className="w-4 h-4" /> Break
            </button>
            <button
              onClick={() => handleAction("lunch-start", () => startLunch(user!.id))}
              disabled={loading !== null}
              className="px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <UtensilsCrossed className="w-4 h-4" /> Lunch
            </button>
            <button
              onClick={() => handleAction("checkout", () => checkOut(user!.id))}
              disabled={loading !== null}
              className="btn-danger text-sm flex items-center justify-center gap-2 col-span-2"
            >
              {loading === "checkout" ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              Check Out
            </button>
          </>
        )}

        {isOnBreak && (
          <button
            onClick={() => handleAction("break-end", () => endBreak(user!.id))}
            disabled={loading !== null}
            className="px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5 col-span-2"
          >
            <Coffee className="w-4 h-4" /> End Break
          </button>
        )}

        {isOnLunch && (
          <button
            onClick={() => handleAction("lunch-end", () => endLunch(user!.id))}
            disabled={loading !== null}
            className="px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5 col-span-2"
          >
            <UtensilsCrossed className="w-4 h-4" /> End Lunch
          </button>
        )}
      </div>

      {record?.late_login && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
          Late login detected
        </p>
      )}
    </div>
  );
}
