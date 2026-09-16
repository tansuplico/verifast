import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMONGO_WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET")!;

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return hexEncode(sig);
}

// Constant-time string comparison to avoid timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text(); // must read raw text BEFORE any JSON.parse

    const sigHeader = req.headers.get("Paymongo-Signature");
    if (!sigHeader) {
      return new Response(
        JSON.stringify({ error: "Missing signature header" }),
        { status: 400 },
      );
    }

    // Parse "t=...,te=...,li=..."
    const parts = Object.fromEntries(
      sigHeader.split(",").map((kv) => {
        const [k, ...rest] = kv.split("=");
        return [k, rest.join("=")];
      }),
    );
    const { t: timestamp, te: testSig, li: liveSig } = parts;
    if (!timestamp || (!testSig && !liveSig)) {
      return new Response(
        JSON.stringify({ error: "Malformed signature header" }),
        { status: 400 },
      );
    }

    const expectedSig = await hmacSha256Hex(
      PAYMONGO_WEBHOOK_SECRET,
      `${timestamp}.${rawBody}`,
    );

    // Sandbox is always test mode, so check testSig first; fall back to liveSig for prod later
    const candidateSig = testSig ?? liveSig;
    if (!timingSafeEqual(expectedSig, candidateSig)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
      });
    }

    const event = JSON.parse(rawBody);

    const eventEnvelope = event?.data;
    const eventType = eventEnvelope?.attributes?.type;

    if (eventType !== "checkout_session.payment.paid") {
      console.error(
        "paymongo-webhook: unexpected event type or shape",
        eventEnvelope?.id,
        eventType,
      );
      return new Response(
        JSON.stringify({ received: true, ignored: eventType ?? "unknown" }),
        { status: 200 },
      );
    }

    const resource = eventEnvelope.attributes.data;
    const attrs = resource?.attributes;

    if (!attrs) {
      console.error(
        "paymongo-webhook: no attributes on resource, raw body:",
        rawBody,
      );
      return new Response(
        JSON.stringify({ received: true, warning: "no resource attributes" }),
        { status: 200 },
      );
    }
    const userId = attrs.metadata?.user_id ?? attrs.reference_number;
    const paymentIntentId = attrs.payment_intent?.id ?? null;
    const latestPayment = attrs.payments?.[attrs.payments.length - 1];

    if (!userId) {
      // Nothing to key off of — log and acknowledge rather than retry forever
      console.error(
        "paymongo-webhook: no user_id/reference_number in payload",
        event.data.id,
      );
      return new Response(
        JSON.stringify({ received: true, warning: "no user id" }),
        { status: 200 },
      );
    }

    if (latestPayment && latestPayment.attributes?.status !== "paid") {
      // Defensive: event type says paid, but double-check the nested payment status
      return new Response(
        JSON.stringify({ received: true, skipped: "payment not paid" }),
        { status: 200 },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: updatedRows, error: updateError } = await adminClient
      .from("subscriptions")
      .update({ status: "active", paymongo_payment_intent_id: paymentIntentId })
      .eq("user_id", userId)
      .neq("status", "active")
      .select("user_id");

    if (updateError) {
      console.error("paymongo-webhook: DB update failed", updateError);
      return new Response(JSON.stringify({ error: "DB update failed" }), {
        status: 500,
      });
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Either already active, or no matching subscription row for this user
      return new Response(JSON.stringify({ received: true, updated: false }), {
        status: 200,
      });
    }

    return new Response(JSON.stringify({ received: true, updated: true }), {
      status: 200,
    });
  } catch (err) {
    console.error("paymongo-webhook: unhandled error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
