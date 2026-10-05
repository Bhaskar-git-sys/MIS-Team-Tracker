import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";

type LoginIdentity = {
  email: string | null;
  userId: string | null;
  status: string | null;
  role: string | null;
};

function getLocalDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /*
  ============================================================
  USERNAME -> LOGIN EMAIL
  ============================================================
  */

  const resolveLoginIdentity = async (
    input: string
  ): Promise<LoginIdentity> => {
    const value = input.trim().toLowerCase();

    if (!value) {
      return {
        email: null,
        userId: null,
        status: null,
        role: null,
      };
    }

    /*
    Direct email login is also supported.
    */

    if (value.includes("@")) {
      return {
        email: value,
        userId: null,
        status: null,
        role: null,
      };
    }

    /*
    Username -> Supabase RPC
    */

    const { data, error: rpcError } = await supabase.rpc(
      "get_login_email",
      {
        p_username: value,
      }
    );

    if (rpcError) {
      console.error(
        "get_login_email RPC error:",
        rpcError
      );

      throw new Error(
        "Unable to find your account. Please contact MIS Manager."
      );
    }

    if (!data) {
      return {
        email: null,
        userId: null,
        status: null,
        role: null,
      };
    }

    const profile = Array.isArray(data)
      ? data[0]
      : data;

    if (!profile) {
      return {
        email: null,
        userId: null,
        status: null,
        role: null,
      };
    }

    return {
      email:
        profile.email ??
        profile.auth_email ??
        profile.login_email ??
        null,

      userId:
        profile.user_id != null
          ? String(profile.user_id)
          : profile.id != null
            ? String(profile.id)
            : null,

      status:
        profile.status != null
          ? String(profile.status)
          : "Active",

      role:
        profile.role != null
          ? String(profile.role)
          : null,
    };
  };

  /*
  ============================================================
  GET AUTHENTICATED PROFILE
  ============================================================
  */

  const getAuthenticatedProfile = async (
    userId: string
  ) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, username, email, status, full_name, role"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "Profile lookup error:",
        error
      );

      return null;
    }

    return data;
  };

  /*
  ============================================================
  ATTENDANCE
  ============================================================
  */

  const createAttendance = async () => {
    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error(
          "Attendance auth error:",
          authError
        );
        return;
      }

      const userId = authData.user?.id;

      if (!userId) {
        return;
      }

      const today = getLocalDate();
      const nowDate = new Date();
      const now = nowDate.toISOString();

      /*
      Check whether attendance already exists
      */

      const {
        data: existing,
        error: existingError,
      } = await supabase
        .from("attendance")
        .select("id")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();

      if (existingError) {
        console.error(
          "Attendance lookup error:",
          existingError
        );
        return;
      }

      if (existing) {
        return;
      }

      /*
      After 10:00 AM = late login
      */

      const minutes =
        nowDate.getHours() * 60 +
        nowDate.getMinutes();

      const lateLogin = minutes > 600;

      const { error: insertError } =
        await supabase
          .from("attendance")
          .insert({
            user_id: userId,
            date: today,
            check_in_at: now,
            status: "present",
            late_login: lateLogin,
            updated_at: now,
          });

      if (insertError) {
        console.error(
          "Attendance insert error:",
          insertError
        );
      }
    } catch (attendanceError) {
      /*
      Attendance NEVER blocks login.
      */

      console.error(
        "Attendance exception:",
        attendanceError
      );
    }
  };

  /*
  ============================================================
  LOGIN
  ============================================================
  */

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);

    const cleanUsername =
      username.trim();

    if (!cleanUsername) {
      setError(
        "Please enter your username."
      );
      return;
    }

    if (!password) {
      setError(
        "Please enter your password."
      );
      return;
    }

    setLoading(true);

    try {
      /*
      --------------------------------------------------------
      STEP 1
      USERNAME -> EMAIL
      --------------------------------------------------------
      */

      const identity =
        await resolveLoginIdentity(
          cleanUsername
        );

      const {
        email,
        userId,
        status,
        role,
      } = identity;

      console.log(
        "Resolved login identity:",
        {
          username: cleanUsername,
          email,
          userId,
          status,
          role,
        }
      );

      if (!email) {
        setError(
          "Username not found. Please check your username."
        );
        return;
      }

      /*
      --------------------------------------------------------
      STEP 2
      STATUS CHECK
      --------------------------------------------------------
      */

      if (
        status &&
        status.trim().toLowerCase() ===
        "inactive"
      ) {
        setError(
          "This account is inactive. Please contact MIS Manager."
        );
        return;
      }

      /*
      --------------------------------------------------------
      STEP 3
      SUPABASE AUTH
      --------------------------------------------------------
      */

      const {
        error: signInError,
      } = await signIn(
        email,
        password
      );

      if (signInError) {
        console.error(
          "Supabase Auth error:",
          signInError
        );

        const message =
          signInError.toLowerCase();

        if (
          message.includes(
            "invalid login credentials"
          )
        ) {
          setError(
            "Invalid username or password."
          );
        } else if (
          message.includes(
            "email not confirmed"
          )
        ) {
          setError(
            "Your account email is not confirmed."
          );
        } else if (
          message.includes(
            "too many requests"
          ) ||
          message.includes(
            "rate limit"
          )
        ) {
          setError(
            "Too many login attempts. Please wait and try again."
          );
        } else {
          setError(signInError);
        }

        return;
      }

      /*
      --------------------------------------------------------
      STEP 4
      GET AUTH USER
      --------------------------------------------------------
      */

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error(
          "Auth user error:",
          authError
        );
      }

      const authUser =
        authData.user;

      if (!authUser) {
        setError(
          "Login succeeded, but user session was not created."
        );
        return;
      }

      /*
      --------------------------------------------------------
      STEP 5
      VERIFY AUTH USER MATCHES PROFILE USER
      --------------------------------------------------------
      */

      if (
        userId &&
        authUser.id !== userId
      ) {
        console.error(
          "User ID mismatch:",
          {
            resolvedUserId: userId,
            authenticatedUserId:
              authUser.id,
          }
        );

        await supabase.auth.signOut();

        setError(
          "Account verification failed. Please contact MIS Manager."
        );

        return;
      }

      /*
      --------------------------------------------------------
      STEP 6
      LOAD PROFILE
      --------------------------------------------------------
      */

      const profile =
        await getAuthenticatedProfile(
          authUser.id
        );

      if (!profile) {
        await supabase.auth.signOut();

        setError(
          "Login succeeded, but your MIS profile could not be loaded."
        );

        return;
      }

      /*
      --------------------------------------------------------
      STEP 7
      CHECK PROFILE STATUS
      --------------------------------------------------------
      */

      if (
        profile.status &&
        String(profile.status)
          .trim()
          .toLowerCase() ===
        "inactive"
      ) {
        await supabase.auth.signOut();

        setError(
          "Your account is inactive. Please contact MIS Manager."
        );

        return;
      }

      /*
      --------------------------------------------------------
      LOGIN SUCCESS
      --------------------------------------------------------
      */

      console.log(
        "MIS login successful:",
        {
          username:
            profile.username,
          email:
            profile.email,
          role:
            profile.role,
          userId:
            profile.id,
        }
      );

      /*
      Attendance runs in background.
      */

      void createAttendance();

      /*
      Go to application.
      */

      navigate("/app", {
        replace: true,
      });
    } catch (loginError) {
      console.error(
        "Login exception:",
        loginError
      );

      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to login. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /*
  ============================================================
  UI
  ============================================================
  */

  return (
    <div
      className="
        min-h-screen
        flex
        items-center
        justify-center
        bg-gradient-to-br
        from-slate-100
        via-blue-50
        to-slate-100
        dark:from-slate-900
        dark:via-slate-800
        dark:to-slate-900
        p-4
        relative
        overflow-hidden
      "
    >
      <div
        className="
          absolute
          top-0
          left-0
          w-72
          h-72
          bg-primary-300/20
          dark:bg-primary-700/20
          rounded-full
          blur-3xl
          -translate-x-1/2
          -translate-y-1/2
        "
      />

      <div
        className="
          absolute
          bottom-0
          right-0
          w-96
          h-96
          bg-accent-300/20
          dark:bg-accent-700/20
          rounded-full
          blur-3xl
          translate-x-1/2
          translate-y-1/2
        "
      />

      <motion.div
        initial={{
          opacity: 0,
          y: 20,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          duration: 0.5,
        }}
        className="
          relative
          z-10
          w-full
          max-w-md
        "
      >
        <div className="glass-card p-8 sm:p-10">

          {/* LOGO */}

          <div className="flex flex-col items-center mb-8">
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt="Kalyani Motors"
              className="
                w-16
                h-16
                object-contain
                drop-shadow-[0_0_20px_rgba(59,130,246,0.45)]
              "
              onError={(event) => {
                event.currentTarget.style.display =
                  "none";
              }}
            />

            <h1
              className="
                text-2xl
                font-bold
                text-slate-900
                dark:text-white
                text-center
                mt-4
              "
            >
              Kalyani Motors
            </h1>

            <p
              className="
                text-sm
                text-blue-600
                dark:text-blue-400
                font-medium
                mt-1
              "
            >
              MIS Team Tracker
            </p>
          </div>

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >

            {/* USERNAME */}

            <div>
              <label className="label-text">
                Username
              </label>

              <div className="relative">
                <User
                  className="
                    absolute
                    left-3
                    top-1/2
                    -translate-y-1/2
                    w-5
                    h-5
                    text-slate-400
                  "
                />

                <input
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(
                      event.target.value
                    );
                    setError(null);
                  }}
                  className="
                    input-field
                    pl-11
                  "
                  placeholder="Enter username"
                  autoComplete="username"
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div>
              <label className="label-text">
                Password
              </label>

              <div className="relative">
                <Lock
                  className="
                    absolute
                    left-3
                    top-1/2
                    -translate-y-1/2
                    w-5
                    h-5
                    text-slate-400
                  "
                />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(event) => {
                    setPassword(
                      event.target.value
                    );
                    setError(null);
                  }}
                  className="
                    input-field
                    pl-11
                    pr-11
                  "
                  placeholder="Enter password"
                  autoComplete="current-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (value) => !value
                    )
                  }
                  disabled={loading}
                  className="
                    absolute
                    right-3
                    top-1/2
                    -translate-y-1/2
                    text-slate-400
                    hover:text-slate-600
                    dark:hover:text-slate-200
                  "
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* ERROR */}

            {error && (
              <motion.div
                initial={{
                  opacity: 0,
                  height: 0,
                }}
                animate={{
                  opacity: 1,
                  height: "auto",
                }}
                className="
                  flex
                  items-start
                  gap-2
                  p-3
                  bg-red-50
                  dark:bg-red-900/30
                  text-red-600
                  dark:text-red-400
                  rounded-xl
                  text-sm
                "
              >
                <AlertCircle
                  className="
                    w-4
                    h-4
                    flex-shrink-0
                    mt-0.5
                  "
                />

                <span>{error}</span>
              </motion.div>
            )}

            {/* SIGN IN */}

            <button
              type="submit"
              disabled={loading}
              className="
                w-full
                btn-primary
                flex
                items-center
                justify-center
                gap-2
                disabled:opacity-60
                disabled:cursor-not-allowed
              "
            >
              {loading ? (
                <>
                  <Loader2
                    className="
                      w-5
                      h-5
                      animate-spin
                    "
                  />

                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* FOOTER */}

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-400">
              Kalyani Motors MIS Team Tracker
            </p>

            <p className="text-xs text-slate-400 mt-1">
              Secure login • Available anytime
            </p>
          </div>

        </div>
      </motion.div>
    </div>
  );
}