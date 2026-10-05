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

    // Determine the target date: query param "date" (YYYY-MM-DD) or today
    const url = new URL(req.url);
    const targetDate = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Get all active fixed task masters with an assigned employee
    const { data: masters, error: masterError } = await supabase
      .from("fixed_task_master")
      .select("*")
      .eq("is_active", true)
      .not("assigned_to", "is", null);

    if (masterError) {
      return new Response(
        JSON.stringify({ error: masterError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!masters || masters.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active masters", tasks_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let tasksCreated = 0;

    for (const master of masters) {
      // Check if a daily instance already exists for this master + date
      const { data: existing } = await supabase
        .from("daily_fixed_tasks")
        .select("id")
        .eq("master_id", master.id)
        .eq("task_date", targetDate)
        .maybeSingle();

      if (existing) continue;

      const { error: insertError } = await supabase.from("daily_fixed_tasks").insert({
        master_id: master.id,
        task_date: targetDate,
        assigned_to: master.assigned_to,
        category: master.category,
        report_name: master.report_name,
        type: master.type,
        working_type: master.working_type,
        estimation_duration: master.estimation_duration,
        start_report_time: master.start_report_time,
        shift: master.shift,
        priority: master.priority,
        status: "open",
      });

      if (!insertError) {
        tasksCreated++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, tasks_created: tasksCreated, date: targetDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
