import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGER_USERNAME = "Vinodh";
const MANAGER_EMAIL = "vinodh@kalyanimotors.com";

function response(
    body: Record<string, unknown>,
    status = 200
) {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
            },
        }
    );
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    if (req.method !== "POST") {
        return response(
            {
                success: false,
                message: "Only POST requests are allowed.",
            },
            405
        );
    }

    try {
        /*
         * ==========================================================
         * SUPABASE
         * ==========================================================
         */

        const supabaseUrl =
            Deno.env.get("SUPABASE_URL");

        const serviceRoleKey =
            Deno.env.get(
                "SUPABASE_SERVICE_ROLE_KEY"
            );

        if (
            !supabaseUrl ||
            !serviceRoleKey
        ) {
            return response(
                {
                    success: false,
                    message:
                        "Server configuration is incomplete.",
                },
                500
            );
        }

        /*
         * Admin client
         */

        const adminClient =
            createClient(
                supabaseUrl,
                serviceRoleKey,
                {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false,
                    },
                }
            );


        /*
         * ==========================================================
         * GET AUTHENTICATED MANAGER
         * ==========================================================
         */

        const authHeader =
            req.headers.get(
                "Authorization"
            );

        if (!authHeader) {
            return response(
                {
                    success: false,
                    message:
                        "Authorization header is missing.",
                },
                401
            );
        }

        const token =
            authHeader.replace(
                "Bearer ",
                ""
            );

        const {
            data: userData,
            error: userError,
        } =
            await adminClient.auth.getUser(
                token
            );

        if (
            userError ||
            !userData.user
        ) {
            return response(
                {
                    success: false,
                    message:
                        "Invalid or expired session.",
                },
                401
            );
        }

        const managerUser =
            userData.user;

        /*
         * ==========================================================
         * ONLY VINODH CAN APPROVE
         * ==========================================================
         */

        if (
            managerUser.email?.toLowerCase() !==
            MANAGER_EMAIL.toLowerCase()
        ) {
            return response(
                {
                    success: false,
                    message:
                        "Only Vinodh Manager can approve or reject login requests.",
                },
                403
            );
        }


        /*
         * ==========================================================
         * REQUEST BODY
         * ==========================================================
         */

        const body =
            await req.json();

        const {
            action,
            requestId,
            rejectionReason,
        } = body;


        /*
         * ==========================================================
         * VALIDATE ACTION
         * ==========================================================
         */

        if (
            action !== "approve" &&
            action !== "reject"
        ) {
            return response(
                {
                    success: false,
                    message:
                        "Invalid action. Use approve or reject.",
                },
                400
            );
        }


        if (!requestId) {
            return response(
                {
                    success: false,
                    message:
                        "Login request ID is required.",
                },
                400
            );
        }


        /*
         * ==========================================================
         * GET REQUEST
         * ==========================================================
         */

        const {
            data: request,
            error: requestError,
        } =
            await adminClient
                .from(
                    "late_login_requests"
                )
                .select("*")
                .eq(
                    "id",
                    requestId
                )
                .maybeSingle();


        if (
            requestError ||
            !request
        ) {
            return response(
                {
                    success: false,
                    message:
                        "Login request could not be found.",
                },
                404
            );
        }


        /*
         * ==========================================================
         * ALREADY PROCESSED
         * ==========================================================
         */

        if (
            request.status !==
            "pending"
        ) {
            return response(
                {
                    success: false,
                    message:
                        `This request is already ${request.status}.`,
                },
                409
            );
        }


        /*
         * ==========================================================
         * APPROVE
         * ==========================================================
         */

        if (
            action === "approve"
        ) {

            const {
                data: updated,
                error: updateError,
            } =
                await adminClient
                    .from(
                        "late_login_requests"
                    )
                    .update({
                        status: "approved",

                        approved_at:
                            new Date().toISOString(),

                        approved_by:
                            MANAGER_USERNAME,

                        manager_user_id:
                            managerUser.id,

                        manager_username:
                            MANAGER_USERNAME,

                        manager_email:
                            MANAGER_EMAIL,

                        updated_at:
                            new Date().toISOString(),
                    })
                    .eq(
                        "id",
                        requestId
                    )
                    .eq(
                        "status",
                        "pending"
                    )
                    .select()
                    .single();


            if (updateError) {

                console.error(
                    "Approval update failed:",
                    updateError
                );

                return response(
                    {
                        success: false,
                        message:
                            "Unable to approve login request.",
                    },
                    500
                );
            }


            /*
             * ========================================================
             * EMPLOYEE NOTIFICATION
             * ========================================================
             */

            await adminClient
                .from(
                    "notifications"
                )
                .insert({
                    user_id:
                        request.employee_user_id,

                    title:
                        "Login Approved",

                    message:
                        "Vinodh Sir approved your login request. You can continue.",

                    type:
                        "login_approved",

                    read: false,

                    created_at:
                        new Date().toISOString(),
                });


            return response({
                success: true,

                status: "approved",

                message:
                    "Employee login approved.",

                requestId:
                    updated.id,
            });
        }


        /*
         * ==========================================================
         * REJECT
         * ==========================================================
         */

        if (
            action === "reject"
        ) {

            const reason =
                rejectionReason ||
                "Login rejected by Vinodh Manager.";


            const {
                data: updated,
                error: updateError,
            } =
                await adminClient
                    .from(
                        "late_login_requests"
                    )
                    .update({
                        status: "rejected",

                        rejection_reason:
                            reason,

                        approved_at:
                            new Date().toISOString(),

                        approved_by:
                            MANAGER_USERNAME,

                        manager_user_id:
                            managerUser.id,

                        manager_username:
                            MANAGER_USERNAME,

                        manager_email:
                            MANAGER_EMAIL,

                        updated_at:
                            new Date().toISOString(),
                    })
                    .eq(
                        "id",
                        requestId
                    )
                    .eq(
                        "status",
                        "pending"
                    )
                    .select()
                    .single();


            if (updateError) {

                console.error(
                    "Rejection update failed:",
                    updateError
                );

                return response(
                    {
                        success: false,
                        message:
                            "Unable to reject login request.",
                    },
                    500
                );
            }


            /*
             * ========================================================
             * EMPLOYEE NOTIFICATION
             * ========================================================
             */

            await adminClient
                .from(
                    "notifications"
                )
                .insert({
                    user_id:
                        request.employee_user_id,

                    title:
                        "Login Rejected",

                    message:
                        reason,

                    type:
                        "login_rejected",

                    read: false,

                    created_at:
                        new Date().toISOString(),
                });


            return response({
                success: true,

                status: "rejected",

                message:
                    "Employee login rejected.",

                requestId:
                    updated.id,
            });
        }


        return response(
            {
                success: false,
                message:
                    "Unknown action.",
            },
            400
        );

    } catch (error) {

        console.error(
            "Late login approval function error:",
            error
        );

        return response(
            {
                success: false,
                message:
                    "Unable to process login request.",
            },
            500
        );
    }
});