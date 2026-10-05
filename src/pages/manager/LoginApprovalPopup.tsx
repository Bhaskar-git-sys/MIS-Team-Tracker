import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../services/supabaseClient";
import {
    Lock,
    User,
    Eye,
    EyeOff,
    AlertCircle,
    Loader2,
} from "lucide-react";

/*
|--------------------------------------------------------------------------
| AUTHORIZED USERS
|--------------------------------------------------------------------------
|
| Login is allowed at ANY TIME.
|
| Vinodh
|   Username: Vinodh
|   Email: vinodh@kalyanimotors.com
|
| Bhaskar
|   Username: Bhaskar
|   Email: bhaskar@kalyanimotors.com
|
| Passwords are managed by Supabase Auth.
| Do NOT hard-code passwords in this frontend file.
|
*/

/*
|--------------------------------------------------------------------------
| LOCAL DATE
|--------------------------------------------------------------------------
|
| Uses the computer's local date instead of UTC.
| This is important for India/IST.
|
*/

function getLocalDate(): string {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/*
|--------------------------------------------------------------------------
| LOGIN PAGE
|--------------------------------------------------------------------------
*/

export default function Login() {
    const navigate = useNavigate();

    const { signIn } = useAuth();

    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    const [username, setUsername] =
        useState("");

    const [password, setPassword] =
        useState("");

    const [showPassword, setShowPassword] =
        useState(false);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    /*
    |--------------------------------------------------------------------------
    | RESOLVE USERNAME TO EMAIL
    |--------------------------------------------------------------------------
    */

    const resolveEmail = async (
        input: string
    ): Promise<string | null> => {
        const cleanInput =
            input.trim().toLowerCase();

        if (cleanInput.includes("@")) return cleanInput;

        const { data } = await supabase
            .from("profiles")
            .select("email")
            .ilike("username", cleanInput)
            .maybeSingle();

        return data?.email || null;
    };

    /*
    |--------------------------------------------------------------------------
    | CREATE TODAY'S ATTENDANCE
    |--------------------------------------------------------------------------
    |
    | This happens after successful authentication.
    |
    | IMPORTANT:
    | Login is NEVER blocked because of attendance failure.
    |
    */

    const createTodayAttendance =
        async (): Promise<void> => {
            try {
                /*
                 * Get authenticated Supabase user.
                 */

                const {
                    data: authData,
                    error: authError,
                } =
                    await supabase.auth.getUser();

                if (authError) {
                    console.error(
                        "Unable to get authenticated user:",
                        authError
                    );

                    return;
                }

                const userId =
                    authData.user?.id;

                if (!userId) {
                    console.error(
                        "Authenticated user ID not found."
                    );

                    return;
                }

                const today =
                    getLocalDate();

                const now =
                    new Date().toISOString();

                /*
                 * Check whether attendance
                 * already exists today.
                 */

                const {
                    data: existingAttendance,
                    error: lookupError,
                } =
                    await supabase
                        .from("attendance")
                        .select("id")
                        .eq(
                            "user_id",
                            userId
                        )
                        .eq(
                            "date",
                            today
                        )
                        .maybeSingle();

                if (lookupError) {
                    console.error(
                        "Attendance lookup failed:",
                        lookupError
                    );

                    return;
                }

                /*
                 * Do not create duplicate attendance.
                 */

                if (existingAttendance) {
                    return;
                }

                /*
                 * Create attendance.
                 *
                 * There is NO late-login status.
                 * There is NO cutoff time.
                 */

                const {
                    error: insertError,
                } =
                    await supabase
                        .from("attendance")
                        .insert({
                            user_id: userId,
                            date: today,
                            check_in_at: now,
                            status: "present",
                            late_login: false,
                            updated_at: now,
                        });

                if (insertError) {
                    console.error(
                        "Attendance creation failed:",
                        insertError
                    );

                    /*
                     * Do not block login.
                     */
                    return;
                }

            } catch (attendanceError) {
                console.error(
                    "Attendance exception:",
                    attendanceError
                );

                /*
                 * Login should still succeed.
                 */
            }
        };

    /*
    |--------------------------------------------------------------------------
    | LOGIN SUBMIT
    |--------------------------------------------------------------------------
    */

    const handleSubmit = async (
        event: React.FormEvent
    ) => {
        event.preventDefault();

        setError(null);

        const cleanUsername =
            username.trim();

        /*
         * Validate fields.
         */

        if (
            !cleanUsername ||
            !password
        ) {
            setError(
                "Please enter username and password."
            );

            return;
        }

        const email =
            await resolveEmail(cleanUsername);

        if (!email) {
            setError(
                "Unable to identify this username."
            );

            return;
        }

        setLoading(true);

        try {
            /*
             * Supabase authentication.
             *
             * Both users can login ANY TIME.
             *
             * There is NO:
             * - 8:15 AM restriction
             * - 10:45 AM cutoff
             * - CAPTCHA
             * - Manager approval
             * - Late-login request
             */

            const {
                error: signInError,
            } =
                await signIn(
                    email,
                    password
                );

            /*
             * Authentication failed.
             */

            if (signInError) {
                console.error(
                    "Supabase login error:",
                    signInError
                );

                const normalizedError =
                    signInError.toLowerCase();

                if (
                    normalizedError.includes(
                        "invalid login credentials"
                    )
                ) {
                    setError(
                        "Invalid username or password."
                    );
                } else if (
                    normalizedError.includes(
                        "email not confirmed"
                    )
                ) {
                    setError(
                        "Your account email is not confirmed."
                    );
                } else {
                    setError(
                        signInError
                    );
                }

                return;
            }

            /*
             * Authentication successful.
             *
             * Create today's attendance.
             */

            /*
             * Go to the application after authentication.
             */

            navigate("/app");

        } catch (loginError) {
            console.error(
                "Login exception:",
                loginError
            );

            setError(
                "Unable to login. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    /*
    |--------------------------------------------------------------------------
    | UI
    |--------------------------------------------------------------------------
    */

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 relative overflow-hidden">

            {/* Background decoration */}

            <div className="absolute top-0 left-0 w-72 h-72 bg-primary-300/20 dark:bg-primary-700/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

            <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent-300/20 dark:bg-accent-700/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

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
                className="relative z-10 w-full max-w-md"
            >

                <div className="glass-card p-8 sm:p-10">

                    {/* ==================================================
              LOGO
          ================================================== */}

                    <div className="flex flex-col items-center mb-8">

                        <img
                            src={`${import.meta.env.BASE_URL}favicon.svg`}
                            alt="Kalyani Motors"
                            className="w-16 h-16 object-contain drop-shadow-[0_0_20px_rgba(59,130,246,0.45)]"
                            onError={(event) => {
                                event.currentTarget.style.display =
                                    "none";
                            }}
                        />

                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center mt-4">
                            Kalyani Motors
                        </h1>

                        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-1">
                            MIS Team Tracker
                        </p>

                    </div>

                    {/* ==================================================
              LOGIN FORM
          ================================================== */}

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

                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                                <input
                                    type="text"
                                    value={username}
                                    onChange={(event) => {
                                        setUsername(
                                            event.target.value
                                        );

                                        setError(null);
                                    }}
                                    className="input-field pl-11"
                                    placeholder="Enter your username"
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

                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

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
                                    className="input-field pl-11 pr-11"
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    disabled={loading}
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword(
                                            (previous) =>
                                                !previous
                                        )
                                    }
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    aria-label={
                                        showPassword
                                            ? "Hide password"
                                            : "Show password"
                                    }
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
                                className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm"
                            >

                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />

                                <span>
                                    {error}
                                </span>

                            </motion.div>
                        )}

                        {/* SIGN IN */}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >

                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />

                                    Signing in...
                                </>
                            ) : (
                                "Sign In"
                            )}

                        </button>

                    </form>

                    {/* ==================================================
              FOOTER
          ================================================== */}

                    <div className="mt-6 text-center">

                        <p className="text-xs text-slate-400">
                            Kalyani Motors MIS Team Tracker
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                            Login available anytime
                        </p>

                    </div>

                </div>

            </motion.div>

        </div>
    );
}