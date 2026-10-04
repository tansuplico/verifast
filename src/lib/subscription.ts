export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

// Whether a subscription currently gives Pro access. Trialing, active and
// past_due always do. A canceled plan keeps Pro until the end of the period
// that was already paid for (current_period_end); a canceled trial has no
// such date, so it ends immediately. Expired and missing rows never do.
// The server also flips ended plans to "expired" with a daily job, but that
// can lag by up to a day, so a canceled plan is checked against its date
// here rather than trusted on status alone.
export function hasProAccess(
  status: SubscriptionStatus | null | undefined,
  currentPeriodEnd: string | null | undefined,
): boolean {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
      return true;
    case "canceled":
      return (
        !!currentPeriodEnd && new Date(currentPeriodEnd).getTime() > Date.now()
      );
    default:
      return false;
  }
}
