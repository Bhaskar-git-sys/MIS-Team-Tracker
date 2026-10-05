import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const json = (payload: Record<string, unknown>, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Authentication required." }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData.user) return json({ success: false, error: "Your session is invalid or expired. Please sign in again." }, 401);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
    if (profile?.role !== "manager") return json({ success: false, error: "Manager access required." }, 403);

    let body: { message?: unknown; messages?: unknown; context?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Request body must be valid JSON." }, 400);
    }
    const messages = Array.isArray(body.messages)
      ? body.messages.filter((item: unknown) => item && typeof item === "object" && "role" in item && "content" in item).slice(-20)
      : typeof body.message === "string" ? [{ role: "user", content: body.message }] : [];
    if (!messages.length || messages.some((item: { content: unknown }) => typeof item.content !== "string" || item.content.length > 4000)) {
      return json({ success: false, error: "Please provide a non-empty message." }, 400);
    }
    const [{ data: profile }, { data: incidents }, { data: tasks }, { data: attendance }] = await Promise.all([
      supabase.from("profiles").select("full_name,role,employee_id,department,position").eq("id", userData.user.id).single(),
      supabase.from("boss_ai_incidents").select("error_message,status,occurrence_count,last_seen,route,root_cause,validation_result").order("last_seen", { ascending: false }).limit(20),
      supabase.from("daily_fixed_tasks").select("report_name,status,assigned_to,task_date,duration_seconds").eq("task_date", new Date().toISOString().slice(0, 10)).limit(200),
      supabase.from("attendance").select("user_id,status,check_in_at,check_out_at,attendance_date").eq("attendance_date", new Date().toISOString().slice(0, 10)).limit(200),
    ]);
    const apiKey = Deno.env.get("BOSS_AI_API_KEY")?.trim();
    if (!apiKey || /^(YOUR_|sk-YOUR|your_)/i.test(apiKey)) {
      return json({ success: false, error: "Boss AI configuration error: BOSS_AI_API_KEY is missing or still a placeholder." }, 503);
    }
    const baseUrl = Deno.env.get("BOSS_AI_BASE_URL") ?? "https://api.openai.com/v1";
    const model = Deno.env.get("BOSS_AI_MODEL") ?? "gpt-4o-mini";
    const context = { current_user: profile, today: new Date().toISOString().slice(0, 10), fixed_tasks: tasks ?? [], attendance: attendance ?? [], incidents: incidents ?? [] };
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0, messages: [
        { role: "system", content: "You are Boss AI, the internal assistant for the Kalyani Motors MIS Team Tracker. Give concise, practical answers about MIS reports, daily work, fixed tasks, attendance, productivity, and team management. Use only the supplied application context for database questions. Never invent numbers or claim a repair was applied or verified without evidence. Never expose passwords, API keys, service-role keys, tokens, or private personal data. Say when information is unavailable." },
        { role: "system", content: `Verified application context:\n${JSON.stringify(context)}` },
        ...messages.map((item: { role: string; content: string }) => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content })),
      ] }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = typeof result.error?.message === "string" ? result.error.message : "The AI provider rejected the request.";
      const status = response.status === 401 || response.status === 403 ? 502 : response.status === 429 ? 429 : 502;
      console.error("Boss AI provider error", { status: response.status, model, message: providerMessage });
      return json({ success: false, error: status === 429 ? "Boss AI is busy. Please try again shortly." : "Boss AI provider rejected the request. Check the configured API key and model." }, status);
    }
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) return json({ success: false, error: "The AI provider returned an empty response." }, 502);
    return json({ success: true, reply, answer: reply });
  } catch (error) {
    console.error("Boss AI function error", error instanceof Error ? error.message : "Unknown error");
    return json({ success: false, error: "Boss AI could not complete the request. Check the function logs." }, 500);
  }
});
