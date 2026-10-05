import { supabase } from "./supabaseClient";

export type BossIncident = {
  id: string;
  fingerprint: string;
  error_message: string;
  severity: string;
  status: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  route: string | null;
  component: string | null;
  stack_trace: string | null;
  root_cause: string | null;
  proposed_fix: string | null;
  validation_result: string | null;
  verification_result: string | null;
  files_changed: string[];
  repair_duration_ms: number | null;
};

const hashIncident = async (message: string, stack?: string) => {
  const value = `${message}\n${stack ?? ""}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export async function recordBossIncident(input: {
  message: string;
  severity?: string;
  route?: string;
  component?: string;
  stack?: string;
}) {
  if (!input.message) return;
  const fingerprint = await hashIncident(input.message, input.stack);
  await supabase.rpc("record_boss_ai_incident", {
    p_fingerprint: fingerprint,
    p_error_message: input.message,
    p_severity: input.severity ?? "error",
    p_route: input.route ?? window.location.pathname,
    p_component: input.component ?? null,
    p_stack_trace: input.stack ?? null,
  });
}

export async function listBossIncidents() {
  const { data, error } = await supabase.from("boss_ai_incidents").select("*").order("last_seen", { ascending: false }).limit(100);
  return { data: (data ?? []) as BossIncident[], error: error?.message ?? null };
}

export async function runBossHealthCheck() {
  const { data, error } = await supabase.rpc("boss_ai_health_check");
  return { data: (data ?? null) as Record<string, unknown> | null, error: error?.message ?? null };
}

export async function setBossAutoFix(enabled: boolean) {
  const { error } = await supabase.from("boss_ai_settings").update({ auto_fix_enabled: enabled, updated_at: new Date().toISOString() }).eq("id", true);
  return error?.message ?? null;
}