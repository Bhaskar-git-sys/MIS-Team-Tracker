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

    const defaultUsers = [
      {
        email: "vinodh@kalyanimotors.com",
        password: "vinodh@123",
        username: "vinod",
        full_name: "Vinodh",
        role: "manager",
        position: "MIS Manager",
        phone: "9000000001",
      },
      {
        email: "bhaskar@kalyanimotors.com",
        password: "bhaskar@123",
        username: "bhaskar",
        full_name: "Bhaskar",
        role: "mis_employee",
        position: "MIS Executive",
        phone: "9000000002",
      },
    ];

    const results: Array<{ username: string; status: string; error?: string }> = [];

    for (const u of defaultUsers) {
      // Check if profile already exists by username
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", u.username)
        .maybeSingle();

      if (existing) {
        results.push({ username: u.username, status: "already_exists" });
        continue;
      }

      // Create auth user via admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: {
          username: u.username,
          full_name: u.full_name,
          role: u.role,
        },
      });

      if (authError || !authData.user) {
        results.push({ username: u.username, status: "error", error: authError?.message });
        continue;
      }

      // Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        position: u.position,
        phone: u.phone,
        department: "MIS",
      });

      if (profileError) {
        results.push({ username: u.username, status: "profile_error", error: profileError.message });
      } else {
        results.push({ username: u.username, status: "created" });
      }
    }

    // Also create a general chat group if it doesn't exist
    const { data: generalGroup } = await supabase
      .from("chat_groups")
      .select("id")
      .eq("is_general", true)
      .maybeSingle();

    if (!generalGroup) {
      const managerProfile = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "manager")
        .maybeSingle();

      if (managerProfile.data) {
        const { data: newGroup } = await supabase
          .from("chat_groups")
          .insert({
            name: "General Team Chat",
            is_general: true,
            created_by: managerProfile.data.id,
          })
          .select("id")
          .single();

        // Add all users to general group
        if (newGroup) {
          const { data: allProfiles } = await supabase.from("profiles").select("id");
          if (allProfiles) {
            for (const p of allProfiles) {
              await supabase.from("chat_group_members").upsert({
                group_id: newGroup.id,
                user_id: p.id,
              });
            }
          }
        }
      }
    } else {
      // Ensure all users are members of general group
      const { data: allProfiles } = await supabase.from("profiles").select("id");
      if (allProfiles) {
        for (const p of allProfiles) {
          await supabase.from("chat_group_members").upsert({
            group_id: generalGroup.id,
            user_id: p.id,
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
