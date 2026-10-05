import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "./AuthContext";
import type { Presence, PresenceStatus } from "../types";

interface PresenceContextValue {
  presence: Presence | null;
  allPresence: Presence[];
  updateStatus: (
    status: PresenceStatus,
    currentTask?: string
  ) => Promise<void>;
}

const PresenceContext = createContext<PresenceContextValue | undefined>(
  undefined
);

// User is considered online if heartbeat happened within this period.
const ONLINE_TIMEOUT = 70 * 1000;

// Heartbeat frequency.
const HEARTBEAT_INTERVAL = 25 * 1000;

export function PresenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();

  const [presence, setPresence] = useState<Presence | null>(null);
  const [allPresence, setAllPresence] = useState<Presence[]>([]);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Load current user's presence.
   */
  const loadMyPresence = async () => {
    if (!user?.id) {
      setPresence(null);
      return;
    }

    const { data, error } = await supabase
      .from("presence")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to load my presence:", error);
      return;
    }

    setPresence((data as Presence | null) ?? null);
  };

  /**
   * Load all users' presence.
   *
   * IMPORTANT:
   * We calculate stale online users as offline on the client.
   * This prevents somebody remaining "Online" forever if their browser
   * crashes or the network disconnects.
   */
  const loadAllPresence = async () => {
    const { data, error } = await supabase
      .from("presence")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to load all presence:", error);
      return;
    }

    const now = Date.now();

    const normalized = ((data ?? []) as Presence[]).map((item) => {
      if (
        item.status === "online" &&
        item.last_seen &&
        now - new Date(item.last_seen).getTime() > ONLINE_TIMEOUT
      ) {
        return {
          ...item,
          status: "offline" as PresenceStatus,
        };
      }

      return item;
    });

    setAllPresence(normalized);
  };

  /**
   * Mark current user online.
   *
   * user_id is the unique identity of the logged-in user.
   * Therefore Bhaskar and Santhosh have completely independent
   * presence rows.
   */
  const setOnline = async () => {
    if (!user?.id) return;

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("presence")
      .upsert(
        {
          user_id: user.id,
          status: "online",
          last_seen: now,
          updated_at: now,
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Failed to set user online:", error);
      return;
    }

    setPresence((data as Presence) ?? null);

    // Immediately refresh everyone so other logged-in users
    // can see this user.
    await loadAllPresence();
  };

  /**
   * Heartbeat.
   */
  const sendHeartbeat = async () => {
    if (!user?.id) return;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("presence")
      .update({
        status: "online",
        last_seen: now,
        updated_at: now,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Presence heartbeat failed:", error);
      return;
    }

    setPresence((previous) =>
      previous
        ? {
          ...previous,
          status: "online",
          last_seen: now,
          updated_at: now,
        }
        : previous
    );
  };

  /**
   * Mark user offline.
   *
   * This is best-effort. Browser close events cannot guarantee
   * a network request will finish, therefore the heartbeat timeout
   * is the real fallback.
   */
  const setOffline = async () => {
    if (!user?.id) return;

    const now = new Date().toISOString();

    try {
      await supabase
        .from("presence")
        .update({
          status: "offline",
          updated_at: now,
        })
        .eq("user_id", user.id);
    } catch (error) {
      console.error("Failed to mark user offline:", error);
    }
  };

  /**
   * Change manual presence status.
   */
  const updateStatus = async (
    status: PresenceStatus,
    currentTask?: string
  ) => {
    if (!user?.id) return;

    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      user_id: user.id,
      status,
      last_seen: now,
      updated_at: now,
    };

    if (currentTask !== undefined) {
      updateData.current_task = currentTask;
    }

    const { data, error } = await supabase
      .from("presence")
      .upsert(updateData, {
        onConflict: "user_id",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to update presence:", error);
      return;
    }

    setPresence((data as Presence) ?? null);
    await loadAllPresence();
  };

  /**
   * Initial presence loading + realtime subscription.
   */
  useEffect(() => {
    loadAllPresence();

    const channel = supabase
      .channel("presence-table-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence",
        },
        () => {
          // Do not trust the event payload alone.
          // Reload the complete presence list.
          loadAllPresence();

          if (user?.id) {
            loadMyPresence();
          }
        }
      )
      .subscribe((status) => {
        console.log("Presence realtime:", status);
      });

    // Fallback polling in case Realtime is unavailable.
    refreshRef.current = setInterval(() => {
      loadAllPresence();
    }, 10000);

    return () => {
      if (refreshRef.current) {
        clearInterval(refreshRef.current);
        refreshRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  /**
   * User login/logout lifecycle.
   */
  useEffect(() => {
    if (!user?.id) {
      setPresence(null);

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      return;
    }

    let cancelled = false;

    const initializePresence = async () => {
      if (cancelled) return;

      await loadMyPresence();
      await setOnline();

      if (cancelled) return;

      // Clear old heartbeat if any.
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }

      heartbeatRef.current = setInterval(() => {
        sendHeartbeat();
      }, HEARTBEAT_INTERVAL);
    };

    initializePresence();

    /**
     * When browser/tab becomes visible again,
     * immediately refresh the heartbeat.
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
        loadAllPresence();
      }
    };

    /**
     * Best-effort offline handling.
     */
    const handleBeforeUnload = () => {
      // Fire-and-forget request.
      supabase
        .from("presence")
        .update({
          status: "offline",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Mark this specific user offline when Auth user changes/logs out.
      setOffline();

      loadAllPresence();
    };
  }, [user?.id]);

  return (
    <PresenceContext.Provider
      value={{
        presence,
        allPresence,
        updateStatus,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);

  if (!ctx) {
    throw new Error(
      "usePresence must be used within PresenceProvider"
    );
  }

  return ctx;
}