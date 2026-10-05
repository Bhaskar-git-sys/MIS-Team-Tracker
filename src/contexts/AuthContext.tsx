import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "../services/supabaseClient";
import type { Profile } from "../types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;

  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;

  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * ------------------------------------------------------------
   * LOAD PROFILE
   * ------------------------------------------------------------
   */
  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Profile load error:", error);
        setProfile(null);
        return;
      }

      if (!data) {
        console.warn("No profile found for user:", userId);
        setProfile(null);
        return;
      }

      setProfile(data as Profile);
    } catch (error) {
      console.error("Unexpected profile error:", error);
      setProfile(null);
    }
  };

  /**
   * ------------------------------------------------------------
   * REFRESH PROFILE
   * ------------------------------------------------------------
   */
  const refreshProfile = async () => {
    const currentUser = user;

    if (!currentUser?.id) {
      setProfile(null);
      return;
    }

    await loadProfile(currentUser.id);
  };

  /**
   * ------------------------------------------------------------
   * INITIAL SESSION
   * ------------------------------------------------------------
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Get session error:", error);
        }

        if (!mounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user?.id) {
          await loadProfile(currentSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);

        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    /**
     * ----------------------------------------------------------
     * AUTH STATE LISTENER
     * ----------------------------------------------------------
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        if (!mounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user?.id) {
          await loadProfile(currentSession.user.id);
        } else {
          setProfile(null);
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * ------------------------------------------------------------
   * SIGN IN
   * ------------------------------------------------------------
   *
   * Password verification is handled ONLY by Supabase Auth.
   *
   * No password is stored in profiles.
   * No password is hard-coded here.
   */
  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    try {
      const cleanEmail = email.trim().toLowerCase();

      if (!cleanEmail) {
        return {
          error: "Login email is missing.",
        };
      }

      if (!password) {
        return {
          error: "Password is required.",
        };
      }

      console.log("Attempting Supabase login:", cleanEmail);

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (error) {
        console.error("Supabase sign-in error:", error);

        return {
          error: error.message,
        };
      }

      if (!data.session || !data.user) {
        console.error("Login succeeded but no session was returned.");

        return {
          error: "Login succeeded but session was not created.",
        };
      }

      console.log(
        "Supabase login successful:",
        data.user.id
      );

      return {
        error: null,
      };
    } catch (error) {
      console.error("Sign-in exception:", error);

      return {
        error:
          error instanceof Error
            ? error.message
            : "Unable to login. Please try again.",
      };
    }
  };

  /**
   * ------------------------------------------------------------
   * SIGN OUT
   * ------------------------------------------------------------
   */
  const signOut = async () => {
    try {
      setProfile(null);
      setUser(null);
      setSession(null);

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Sign out error:", error);
      }
    } catch (error) {
      console.error("Sign out exception:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * ------------------------------------------------------------
 * USE AUTH
 * ------------------------------------------------------------
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return context;
}
