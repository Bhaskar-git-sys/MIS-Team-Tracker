import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: expired, error: selectError } = await supabase
      .from("files")
      .select("id, storage_path")
      .not("expires_at", "is", null)
      .lte("expires_at", new Date().toISOString())
      .is("expired_at", null);

    if (selectError) throw selectError;
    if (!expired?.length) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storagePaths = expired
      .map((file) => file.storage_path)
      .filter((path): path is string => Boolean(path));

    if (storagePaths.length) {
      await supabase.storage.from("uploads").remove(storagePaths);
    }

    const ids = expired.map((file) => file.id);
    const { error: deleteError } = await supabase.from("files").delete().in("id", ids);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ deleted: expired.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Cleanup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});