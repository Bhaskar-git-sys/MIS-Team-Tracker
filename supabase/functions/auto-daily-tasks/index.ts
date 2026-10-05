import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();
    const todayDate = today.toISOString().split("T")[0];

    // Get all active task templates for today (by day_of_week or day_of_month)
    const { data: templates } = await supabase
      .from("task_templates")
      .select("*")
      .eq("is_active", true)
      .or(`day_of_week.eq.${dayOfWeek},day_of_month.eq.${dayOfMonth}`);

    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No templates for today", tasks_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all MIS employees
    const { data: employees } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("role", "mis_employee");

    if (!employees || employees.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No employees", tasks_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let tasksCreated = 0;

    for (const emp of employees) {
      for (const tpl of templates) {
        // Check if task already created for this employee today
        const { data: existing } = await supabase
          .from("tasks")
          .select("id")
          .eq("assigned_to", emp.id)
          .eq("assigned_by", tpl.manager_id)
          .eq("title", tpl.title)
          .gte("created_at", `${todayDate}T00:00:00Z`)
          .lte("created_at", `${todayDate}T23:59:59Z`)
          .maybeSingle();

        if (existing) continue;

        const { error } = await supabase.from("tasks").insert({
          title: tpl.title,
          description: tpl.description,
          assigned_to: emp.id,
          assigned_by: tpl.manager_id,
          status: "open",
          priority: tpl.priority,
          due_date: todayDate,
        });

        if (!error) {
          tasksCreated++;
          // Notify employee
          await supabase.from("notifications").insert({
            user_id: emp.id,
            title: "New Task Assigned",
            message: `Task: ${tpl.title}`,
            type: "task",
            link: "/tasks",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, tasks_created: tasksCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
