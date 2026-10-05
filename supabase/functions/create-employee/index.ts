import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  if (!phone) return true;
  return /^\d{10}$/.test(phone);
}

function isValidDate(date: string): boolean {
  if (!date) return false;

  const parsed = new Date(date);

  return !Number.isNaN(parsed.getTime());
}

Deno.serve(async (req: Request) => {
  // ==========================================================
  // CORS
  // ==========================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ==========================================================
  // ONLY POST
  // ==========================================================

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Only POST requests are allowed.",
      },
      405
    );
  }

  try {
    // ========================================================
    // ENVIRONMENT
    // ========================================================

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "Supabase environment variables are missing."
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Supabase environment variables are missing.",
        },
        500
      );
    }

    // ========================================================
    // ADMIN CLIENT
    // ========================================================

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ========================================================
    // AUTHORIZATION
    // ========================================================

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(
        {
          success: false,
          error:
            "Authorization header is required.",
        },
        401
      );
    }

    const token = authHeader
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid authorization token.",
        },
        401
      );
    }

    // ========================================================
    // CURRENT USER
    // ========================================================

    const {
      data: { user: currentUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !currentUser) {
      console.error(
        "Authentication error:",
        authError
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Unauthorized. Please login again.",
        },
        401
      );
    }

    // ========================================================
    // MANAGER PROFILE
    // ========================================================

    const {
      data: managerProfile,
      error: managerProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, role, username, full_name"
      )
      .eq("id", currentUser.id)
      .maybeSingle();

    if (managerProfileError) {
      console.error(
        "Manager profile error:",
        managerProfileError
      );

      return jsonResponse(
        {
          success: false,
          error:
            managerProfileError.message,
        },
        500
      );
    }

    // ========================================================
    // MANAGER ONLY
    // ========================================================

    if (
      !managerProfile ||
      managerProfile.role !== "manager"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Only the MIS Manager can create employees.",
        },
        403
      );
    }

    // ========================================================
    // READ BODY
    // ========================================================

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid JSON request body.",
        },
        400
      );
    }

    // ========================================================
    // GET VALUES
    // ========================================================

    const employee_id = String(
      body.employee_id ?? ""
    ).trim();

    const username = String(
      body.username ?? ""
    )
      .trim()
      .toLowerCase();

    const full_name = String(
      body.full_name ?? ""
    ).trim();

    const phone = String(
      body.phone ?? ""
    ).trim();

    const email = String(
      body.email ?? ""
    )
      .trim()
      .toLowerCase();

    const date_of_joining = String(
      body.date_of_joining ?? ""
    ).trim();

    const exit_date = body.exit_date
      ? String(body.exit_date).trim()
      : null;

    const status = String(
      body.status ?? "Active"
    ).trim();

    const department = String(
      body.department ?? "MIS"
    ).trim();

    const reporting_manager = String(
      body.reporting_manager ?? ""
    ).trim();

    const position = String(
      body.position ?? ""
    ).trim();

    const gender = String(
      body.gender ?? ""
    ).trim();

    const password = String(
      body.password ?? ""
    );

    const tenure_days = Number(
      body.tenure_days ?? 0
    );

    // ========================================================
    // REQUIRED VALIDATION
    // ========================================================

    if (!employee_id) {
      return jsonResponse(
        {
          success: false,
          error:
            "Employee ID is required.",
        },
        400
      );
    }

    if (!username) {
      return jsonResponse(
        {
          success: false,
          error:
            "Username is required.",
        },
        400
      );
    }

    if (!full_name) {
      return jsonResponse(
        {
          success: false,
          error:
            "Employee name is required.",
        },
        400
      );
    }

    if (!email) {
      return jsonResponse(
        {
          success: false,
          error:
            "Email is required.",
        },
        400
      );
    }

    if (!password) {
      return jsonResponse(
        {
          success: false,
          error:
            "Password is required.",
        },
        400
      );
    }

    // ========================================================
    // EMAIL
    // ========================================================

    if (!isValidEmail(email)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Please enter a valid email address.",
        },
        400
      );
    }

    // ========================================================
    // PHONE
    // ========================================================

    if (!isValidPhone(phone)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Phone number must contain exactly 10 digits.",
        },
        400
      );
    }

    // ========================================================
    // DATES
    // ========================================================

    if (
      date_of_joining &&
      !isValidDate(date_of_joining)
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid Date of Joining.",
        },
        400
      );
    }

    if (
      exit_date &&
      !isValidDate(exit_date)
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid Exit Date.",
        },
        400
      );
    }

    if (
      exit_date &&
      date_of_joining &&
      exit_date < date_of_joining
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Exit Date cannot be before Date of Joining.",
        },
        400
      );
    }

    // ========================================================
    // PASSWORD
    // ========================================================

    if (password.length < 6) {
      return jsonResponse(
        {
          success: false,
          error:
            "Password must be at least 6 characters.",
        },
        400
      );
    }

    // ========================================================
    // USERNAME
    // ========================================================

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Username can contain only letters, numbers, dot, underscore and hyphen.",
        },
        400
      );
    }

    // ========================================================
    // TENURE
    // ========================================================

    if (
      !Number.isFinite(tenure_days) ||
      tenure_days < 0
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid tenure days.",
        },
        400
      );
    }

    // ========================================================
    // CHECK EMPLOYEE ID
    // ========================================================

    const {
      data: existingEmployee,
      error: employeeCheckError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("employee_id", employee_id)
      .maybeSingle();

    if (employeeCheckError) {
      console.error(
        "Employee ID check error:",
        employeeCheckError
      );

      return jsonResponse(
        {
          success: false,
          error:
            employeeCheckError.message,
        },
        500
      );
    }

    if (existingEmployee) {
      return jsonResponse(
        {
          success: false,
          error:
            "Employee ID already exists.",
        },
        409
      );
    }

    // ========================================================
    // CHECK USERNAME
    // ========================================================

    const {
      data: existingUsername,
      error: usernameCheckError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (usernameCheckError) {
      console.error(
        "Username check error:",
        usernameCheckError
      );

      return jsonResponse(
        {
          success: false,
          error:
            usernameCheckError.message,
        },
        500
      );
    }

    if (existingUsername) {
      return jsonResponse(
        {
          success: false,
          error:
            "Username already exists.",
        },
        409
      );
    }

    // ========================================================
    // CHECK EMAIL
    // ========================================================

    const {
      data: existingEmail,
      error: emailCheckError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (emailCheckError) {
      console.error(
        "Email check error:",
        emailCheckError
      );

      return jsonResponse(
        {
          success: false,
          error:
            emailCheckError.message,
        },
        500
      );
    }

    if (existingEmail) {
      return jsonResponse(
        {
          success: false,
          error:
            "Email ID already exists.",
        },
        409
      );
    }

    // ========================================================
    // CREATE AUTH USER
    // ========================================================

    const {
      data: authUserData,
      error: authUserError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          username,
          employee_id,
          role: "mis_employee",
        },
      });

    if (authUserError) {
      console.error(
        "Auth user creation error:",
        authUserError
      );

      return jsonResponse(
        {
          success: false,
          error:
            authUserError.message,
        },
        400
      );
    }

    const newUser = authUserData.user;

    if (!newUser) {
      return jsonResponse(
        {
          success: false,
          error:
            "Supabase Auth user was not created.",
        },
        500
      );
    }

    // ========================================================
    // CREATE PROFILE
    // ========================================================

    const now =
      new Date().toISOString();

    const profileData = {
      id: newUser.id,
      employee_id,
      full_name,
      username,
      email,
      phone,
      date_of_joining:
        date_of_joining || null,
      exit_date,
      status,
      tenure_days,
      department,
      reporting_manager,
      position,
      gender,
      role: "mis_employee",
      created_at: now,
      updated_at: now,
    };

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .insert(profileData)
      .select()
      .single();

    // ========================================================
    // PROFILE FAILED → ROLLBACK AUTH USER
    // ========================================================

    if (profileError) {
      console.error(
        "Profile creation error:",
        profileError
      );

      const {
        error: rollbackError,
      } =
        await supabaseAdmin.auth.admin.deleteUser(
          newUser.id
        );

      if (rollbackError) {
        console.error(
          "Rollback failed:",
          rollbackError
        );
      }

      return jsonResponse(
        {
          success: false,
          error:
            `Profile creation failed: ${profileError.message}`,
          rollback:
            rollbackError
              ? "Auth user could not be automatically removed."
              : "Auth user removed successfully.",
        },
        400
      );
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log(
      "Employee created successfully",
      {
        user_id: newUser.id,
        employee_id,
        username,
        email,
      }
    );

    return jsonResponse(
      {
        success: true,
        message:
          "Employee created successfully.",
        employee: profile,
        user_id: newUser.id,
      },
      200
    );

  } catch (error) {
    console.error(
      "Create employee exception:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      500
    );
  }
});