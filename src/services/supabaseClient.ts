import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing VITE_SUPABASE_URL in .env"
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_ANON_KEY in .env"
  );
}

/*
 * Main Supabase browser client
 */
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/*
 * Default export also provided
 */
export default supabase;

/*
 * Supabase Edge Functions
 */
export const EDGE_FUNCTIONS = {
  seedUsers: "seed-users",
  attendanceManagerApproval: "attendance-manager-approval",
  createEmployee: "create-employee",
  resetPassword: "reset-password",
  autoDailyTasks: "auto-daily-tasks",
  generateDailyFixedTasks: "generate-daily-fixed-tasks",
  cleanupExpiredFiles: "cleanup-expired-files",
  bossAIChat: "boss-ai-chat",
    forgotPasswordOtp: "forgot-password-otp",
} as const;

/*
 * Generic Edge Function helper
 */
export async function callEdgeFunction<
  T = unknown
>(
  functionName: string,
  body: Record<string, unknown> = {}
): Promise<{
  data: T | null;
  error: string | null;
}> {
  try {
    const {
      data,
      error,
    } = await supabase.functions.invoke(
      functionName,
      {
        body,
      }
    );

    if (error) {
      console.error(
        `Edge Function "${functionName}" error:`,
        error
      );

      return {
        data: null,
        error:
          error.message ||
          `Failed to call ${functionName}`,
      };
    }

    return {
      data: data as T,
      error: null,
    };
  } catch (error) {
    console.error(
      `Edge Function "${functionName}" exception:`,
      error
    );

    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : `Failed to call ${functionName}`,
    };
  }
}