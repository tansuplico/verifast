import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    // verify_jwt=true (set in config.toml) means Supabase's gateway already
    // rejected any request without a valid bearer token before this code
    // runs - but we still need to resolve *which* user made the request.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
      });
    }

    // Service role client needed here - RLS only lets users SELECT their own
    // subscription row, not UPDATE it. Writes happen either via the PayMongo
    // webhook (activation) or, for cancellation, this function - both using
    // the service role key to bypass RLS.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Only these statuses are actually cancelable. Restricting the update
    // with .in(...) also makes this safely idempotent under a double-tap or
    // retry: a second call just matches zero rows instead of erroring.
    const { data: updatedRows, error: updateError } = await adminClient
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", user.id)
      .in("status", ["trialing", "active", "past_due"])
      .select("user_id");

    if (updateError) {
      console.error("cancel-subscription: DB update failed", updateError);
      return new Response(JSON.stringify({ error: "DB update failed" }), {
        status: 500,
      });
    }

    const canceled = Boolean(updatedRows && updatedRows.length > 0);
    return new Response(JSON.stringify({ canceled }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cancel-subscription: unhandled error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
