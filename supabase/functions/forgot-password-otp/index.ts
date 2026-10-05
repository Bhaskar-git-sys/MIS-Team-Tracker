import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const response = (payload: Record<string, unknown>, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const hashOtp = async (otp: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
};

const managerPhone = (phone: string) => {
    const normalized = phone.replace(/[^\d+]/g, "");
    return /^\d{10}$/.test(normalized) ? `+91${normalized}` : normalized;
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return response({ success: false, error: "Method not allowed" }, 405);

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const body = await req.json();
        const action = body.action === "verify" ? "verify" : "request";
        const username = String(body.username ?? "").trim().toLowerCase();

        if (!username) {
            return response(
                { success: false, error: "Username is required." },
                400
            );
        }
        const { data: manager, error: managerError } = await supabase
            .from("profiles")
            .select("id, username, phone, role")
            .eq("role", "manager")
            .ilike("username", username)
            .maybeSingle();

        if (managerError || !manager) return response({ success: false, error: "Manager account was not found." }, 404);

        if (action === "request") {
            if (!manager.phone) return response({ success: false, error: "Manager phone number is not configured." }, 400);
            const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
            const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
            const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
            if (!accountSid || !authToken || !fromNumber) return response({ success: false, error: "OTP service is not configured on the server." }, 503);

            const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
            const { error: insertError } = await supabase.from("password_reset_otps").insert({
                user_id: manager.id,
                otp_hash: await hashOtp(otp),
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            });
            if (insertError) throw insertError;

            const sms = new URLSearchParams({
                To: managerPhone(manager.phone),
                From: fromNumber,
                Body: `Kalyani Motors MIS password reset OTP: ${otp}. It expires in 10 minutes.`,
            });
            const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
                method: "POST",
                headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
                body: sms,
            });
            if (!smsResponse.ok) {
                console.error("OTP SMS provider rejected request", { status: smsResponse.status });
                return response({ success: false, error: "OTP could not be sent. Check the SMS provider configuration." }, 502);
            }
            return response({ success: true, message: "OTP sent to the manager phone number." });
        }

        const otp = String(body.otp ?? "").trim();
        const newPassword = String(body.new_password ?? "");
        if (!/^\d{6}$/.test(otp)) return response({ success: false, error: "Enter the 6-digit OTP." }, 400);
        if (newPassword.length < 6) return response({ success: false, error: "Password must be at least 6 characters." }, 400);
        const { data: reset, error: resetError } = await supabase
            .from("password_reset_otps")
            .select("id, otp_hash, attempts")
            .eq("user_id", manager.id)
            .is("used_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (resetError || !reset || reset.attempts >= 5 || await hashOtp(otp) !== reset.otp_hash) {
            if (reset) await supabase.from("password_reset_otps").update({ attempts: reset.attempts + 1 }).eq("id", reset.id);
            return response({ success: false, error: "Invalid or expired OTP." }, 400);
        }
        const { error: passwordError } = await supabase.auth.admin.updateUserById(manager.id, { password: newPassword });
        if (passwordError) throw passwordError;
        await supabase.from("password_reset_otps").update({ used_at: new Date().toISOString() }).eq("id", reset.id);
        return response({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("Password OTP error", error instanceof Error ? error.message : "Unknown error");
        return response({ success: false, error: "Password reset could not be completed." }, 500);
    }
});
