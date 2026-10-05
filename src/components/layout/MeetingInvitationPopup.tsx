import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { supabase } from "../../services/supabaseClient";
import type { Meeting } from "../../types";
import { Video, X, Users } from "lucide-react";

export function MeetingInvitationPopup() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const checkActiveMeetings = async () => {
      const { data } = await supabase
        .from("meetings")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const meeting = data[0] as Meeting;
        // Don't show to the manager who started it
        if (meeting.started_by !== user.id && !dismissed.has(meeting.id)) {
          setActiveMeeting(meeting);
        }
      }
    };

    checkActiveMeetings();

    const channel = supabase
      .channel("meeting-invitations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meetings" },
        (payload) => {
          const meeting = payload.new as Meeting;
          if (meeting.started_by !== user.id && meeting.status === "active") {
            setActiveMeeting(meeting);
            addNotification(
              user.id,
              "Meeting Started",
              "Manager has started a meeting. Join now!",
              "meeting",
              "/app/meetings"
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings" },
        (payload) => {
          const meeting = payload.new as Meeting;
          if (meeting.status === "ended" && meeting.id === activeMeeting?.id) {
            setActiveMeeting(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, dismissed, activeMeeting?.id]);

  const handleJoin = () => {
    if (activeMeeting) {
      navigate("/app/meetings", {
        state: { joinRoomId: activeMeeting.room_id },
      });
      setDismissed((prev) => new Set(prev).add(activeMeeting.id));
      setActiveMeeting(null);
    }
  };

  const handleDismiss = () => {
    if (activeMeeting) {
      setDismissed((prev) => new Set(prev).add(activeMeeting.id));
    }
    setActiveMeeting(null);
  };

  return (
    <AnimatePresence>
      {activeMeeting && (
        <motion.div
          initial={{ opacity: 0, y: -100, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -100, x: "-50%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-20 left-1/2 z-[60] w-full max-w-md px-4"
        >
          <div className="card p-5 shadow-2xl border-2 border-primary-500/50 animate-pulse-glow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                <Video className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  Manager started a meeting
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {activeMeeting.title}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleJoin}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Join Meeting
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="btn-secondary text-sm flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
