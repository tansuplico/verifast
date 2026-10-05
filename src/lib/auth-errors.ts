import { isAuthRetryableFetchError } from "@supabase/supabase-js";

const GENERIC = "Something went wrong. Please try again.";
const OFFLINE =
  "Can't reach the server. Check your internet connection and try again.";

// Turns anything a Supabase auth call can return or throw into a message a
// student can act on. Branches on the stable `code` (error.message is for
// logs, not users); unknown errors fall back to Supabase's own message so
// nothing is ever swallowed. Codes: supabase.com/docs/guides/auth/debugging/error-codes
export function friendlyAuthError(error: unknown): string {
  if (!error) return GENERIC;

  if (isAuthRetryableFetchError(error)) return OFFLINE;

  const e = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const message = typeof e.message === "string" ? e.message : "";

  // A thrown fetch that never reached Supabase (no signal, airplane mode).
  if (/network request failed|failed to fetch|network error/i.test(message)) {
    return OFFLINE;
  }

  switch (code) {
    case "over_email_send_rate_limit": {
      // Supabase's per-address 60 s guard reads "...only request this after
      // N seconds"; pass that number through when it's there.
      const seconds = message.match(/after (\d+) seconds?/i)?.[1];
      return seconds
        ? `Please wait ${seconds} seconds before requesting another email.`
        : "Too many emails were sent to this address. Please wait a few minutes and try again.";
    }
    case "over_request_rate_limit":
      return "Too many attempts from this network. Please wait a few minutes and try again.";
    // Supabase uses this code for both a wrong and an expired code.
    case "otp_expired":
      return "That code is invalid or has expired. Check it, or request a new one.";
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Please confirm your email first.";
    case "same_password":
      return "Your new password must be different from your old one.";
    case "email_address_invalid":
      return "That email address isn't valid.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists.";
  }

  // Email provider trouble surfaces as a 500 ("Error sending ... email").
  if (/error sending|sending .* email/i.test(message)) {
    return "We couldn't send the email right now. Please try again in a few minutes.";
  }
  if (status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (status >= 500) {
    return "Our server had a problem. Please try again in a moment.";
  }

  return message || GENERIC;
}
