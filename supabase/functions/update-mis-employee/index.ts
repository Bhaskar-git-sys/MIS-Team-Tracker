import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

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
    const { data: authData } = await admin.auth.getUser(token);
    if (!authData.user) return response({ error: "Please login again." }, 401);
    const { data: manager } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (manager?.role !== "manager") return response({ error: "Only managers can edit employees." }, 403);

    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const fullName = String(body.full_name ?? "").trim();
    const employeeId = String(body.employee_id ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const username = String(body.username ?? "").trim().toLowerCase();
    const exitDate = body.exit_date || null;
    if (!id || !fullName || !employeeId || !email || !username) return response({ error: "Employee ID, name, email and username are required." }, 400);

    const { data: duplicates, error: duplicateError } = await admin
      .from("profiles")
      .select("id, employee_id, username, email")
      .or(`employee_id.eq.${employeeId},username.eq.${username},email.eq.${email}`)
      .neq("id", id);
    if (duplicateError) return response({ error: duplicateError.message }, 500);
    if (duplicates?.some((row) => row.employee_id === employeeId)) return response({ error: "Employee ID already exists." }, 409);
    if (duplicates?.some((row) => row.username === username)) return response({ error: "Username already exists." }, 409);
    if (duplicates?.some((row) => row.email?.toLowerCase() === email)) return response({ error: "Email ID already exists." }, 409);

    const today = new Date().toISOString().slice(0, 10);
    const requestedStatus = String(body.status ?? "Active");
    const leaveStatuses = new Set(["On Leave", "Sick Leave", "Casual Leave", "Earned Leave"]);
    const status = exitDate && String(exitDate) <= today
      ? "Inactive"
      : leaveStatuses.has(requestedStatus)
        ? requestedStatus
        : "Active";
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, { email });
    if (authUpdateError) return response({ error: authUpdateError.message }, 400);
    const { error: profileError } = await admin.from("profiles").update({
      full_name: fullName,
      employee_id: employeeId,
      email,
      username,
      phone: String(body.phone ?? "").trim() || null,
      position: String(body.position ?? "").trim() || null,
      department: String(body.department ?? "MIS").trim() || "MIS",
      date_of_joining: body.date_of_joining || null,
      exit_date: exitDate,
      status,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (profileError) return response({ error: profileError.message }, 400);
    return response({ success: true });
  } catch (error) {
    console.error("Update employee error", error);
    return response({ error: "Employee could not be updated." }, 500);
  }
});
