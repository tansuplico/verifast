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

// Free accounts can store this many documents (the limit is checked when
// adding one - see the + button on the Documents screen).
export const FREE_DOCUMENT_LIMIT = 15;

export type PlanEndingSoon = {
  // "trial" = the free trial is running out; "plan" = a paid year is.
  kind: "trial" | "plan";
  // Whole calendar days from today to the end date (0 = today).
  daysUntil: number;
  endsAt: string;
};

export const PLAN_WARNING_WINDOW_DAYS = 7;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// A heads-up for a trial or paid plan that ends within the next
// PLAN_WARNING_WINDOW_DAYS. Only trialing and active plans are considered: a
// canceled plan was ended on purpose, and anything already past its end date
// is about to be marked expired by the nightly job, not "ending soon".
// Days are counted on the phone's calendar, so "tomorrow" means tomorrow
// where the user is.
export function getPlanEndingSoon(
  subscription: {
    status: SubscriptionStatus;
    trial_ends_at: string | null;
    current_period_end: string | null;
  } | null,
): PlanEndingSoon | null {
  if (!subscription) return null;

  let kind: "trial" | "plan";
  let endsAt: string | null;
  if (subscription.status === "trialing") {
    kind = "trial";
    endsAt = subscription.trial_ends_at;
  } else if (subscription.status === "active") {
    kind = "plan";
    endsAt = subscription.current_period_end;
  } else {
    return null;
  }
  if (!endsAt) return null;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) return null;

  const daysUntil = Math.round(
    (startOfLocalDay(end).getTime() - startOfLocalDay(new Date()).getTime()) /
      86_400_000,
  );
  if (daysUntil > PLAN_WARNING_WINDOW_DAYS) return null;
  return { kind, daysUntil, endsAt };
}
