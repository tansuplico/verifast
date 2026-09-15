import { createClient } from "@supabase/supabase-js";

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ANNUAL_PRICE_CENTAVOS = 9000; // PayMongo amounts are in centavos (₱90.00)

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

    const checkoutRes = await fetch(
      "https://api.paymongo.com/v2/checkout_sessions",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${PAYMONGO_SECRET_KEY}:`),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: [
                {
                  name: "VeriFast Student+ Annual Plan",
                  amount: ANNUAL_PRICE_CENTAVOS,
                  currency: "PHP",
                  quantity: 1,
                },
              ],
              payment_method_types: ["card", "gcash", "paymaya", "qrph"],
              // Bridges to a custom scheme via checkout-redirect - see below.
              success_url: `${SUPABASE_URL}/functions/v1/checkout-redirect?result=success`,
              cancel_url: `${SUPABASE_URL}/functions/v1/checkout-redirect?result=cancel`,
              reference_number: user.id,
              send_email_receipt: false,
              metadata: { user_id: user.id },
            },
          },
        }),
      },
    );

    const checkout = await checkoutRes.json();
    if (!checkoutRes.ok) {
      return new Response(JSON.stringify({ error: checkout }), { status: 502 });
    }

    // Service role client needed here - RLS only lets users SELECT their
    // own subscription row, not UPDATE it (writes are meant to happen only
    // via webhook, per the comment already in the init migration).
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await adminClient
      .from("subscriptions")
      .update({ paymongo_checkout_session_id: checkout.data.id })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({ checkout_url: checkout.data.attributes.checkout_url }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
