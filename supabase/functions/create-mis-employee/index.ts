import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9._-]+$/;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Only POST requests are allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) return response({ error: "Supabase server configuration is missing." }, 500);

    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return response({ error: "Authentication is required." }, 401);

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Please login again." }, 401);
    const { data: manager } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (manager?.role !== "manager") return response({ error: "Only managers can create employees." }, 403);

    const body = await request.json();
    const fullName = String(body.full_name ?? "").trim();
    const employeeId = String(body.employee_id ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const phone = String(body.phone ?? "").trim();
    const position = String(body.position ?? "").trim();
    const department = String(body.department ?? "MIS").trim() || "MIS";
    const dateOfJoining = body.date_of_joining || null;
    const exitDate = body.exit_date || null;
    const requestedStatus = String(body.status ?? "Active").trim();

    if (!fullName || !employeeId || !email || !username || !password) return response({ error: "Name, employee ID, email, username and password are required." }, 400);
    if (!emailPattern.test(email)) return response({ error: "Please enter a valid email address." }, 400);
    if (!usernamePattern.test(username)) return response({ error: "Username contains unsupported characters." }, 400);
    if (password.length < 6) return response({ error: "Password must be at least 6 characters." }, 400);
    if (dateOfJoining && exitDate && String(exitDate) < String(dateOfJoining)) return response({ error: "Exit Date cannot be before Date of Joining." }, 400);

    const { data: duplicate, error: duplicateError } = await admin
      .from("profiles")
      .select("employee_id, username, email")
      .or(`employee_id.eq.${employeeId},username.eq.${username},email.eq.${email}`);
    if (duplicateError) return response({ error: duplicateError.message }, 500);
    if (duplicate?.some((row) => row.employee_id === employeeId)) return response({ error: "Employee ID already exists." }, 409);
    if (duplicate?.some((row) => row.username === username)) return response({ error: "Username already exists." }, 409);
    if (duplicate?.some((row) => row.email?.toLowerCase() === email)) return response({ error: "Email ID already exists." }, 409);

    const today = new Date().toISOString().slice(0, 10);
    const leaveStatuses = new Set(["On Leave", "Sick Leave", "Casual Leave", "Earned Leave"]);
    const status = exitDate && String(exitDate) <= today
      ? "Inactive"
      : leaveStatuses.has(requestedStatus)
        ? requestedStatus
        : "Active";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, username, employee_id: employeeId, role: "mis_employee" },
    });
    if (createError || !created.user) return response({ error: createError?.message || "Auth user could not be created." }, 400);

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName,
      employee_id: employeeId,
      email,
      username,
      phone: phone || null,
      position: position || null,
      department,
      date_of_joining: dateOfJoining,
      exit_date: exitDate,
      status,
      role: "mis_employee",
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return response({ error: `Employee profile could not be created: ${profileError.message}` }, 400);
    }

    return response({ success: true, employee_id: employeeId });
  } catch (error) {
    console.error("Create employee error", error);
    return response({ error: "Employee could not be created." }, 500);
  }
});
