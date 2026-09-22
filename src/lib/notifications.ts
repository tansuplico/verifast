import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Alerts fire this many days before the due date, at this local hour.
// Mirrors the Calendar Sync alarm in calendar-sync.ts and the "Get alerts
// 3 days before each deadline" copy next to the Push Notifications toggle,
// so a student with both on gets alerts at the same moment, not two
// different ones. Keep these in sync with ALARM_DAYS_BEFORE / ALARM_HOUR.
const DAYS_BEFORE_DUE = 3;
const NOTIFY_HOUR = 9; // 24h local time

const REMINDER_CHANNEL_ID = "reminders";

function identifierForReminder(reminderId: string) {
  // Namespaced and stable so re-scheduling the same reminder overwrites
  // the prior notification instead of stacking duplicates.
  return `reminder-${reminderId}`;
}

// Controls how a notification behaves while the app is open. In SDK 57 a
// foreground notification is not shown at all unless a handler asks for it.
// Call once at module load in the root _layout.tsx - it applies globally.
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android 8+ requires every notification to belong to a channel. No-op on
// iOS. Idempotent, so it's safe to call before every schedule.
async function ensureReminderNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Deadline Reminders",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

// Returns whether permission is granted. Only shows the OS dialog if the
// user hasn't already answered, so it's safe to call every time the toggle
// is switched on. On Android 13+ this is what triggers the runtime prompt.
export async function requestNotificationPermissionsAsync() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Non-prompting check, for reconcile passes that must never pop a dialog.
export async function hasNotificationPermissionAsync() {
  const existing = await Notifications.getPermissionsAsync();
  return existing.granted;
}

export type ReminderNotificationInput = {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
};

function atNotifyHour(date: Date) {
  const result = new Date(date);
  result.setHours(NOTIFY_HOUR, 0, 0, 0);
  return result;
}

// Picks when (and with what wording) to notify:
//  1. 3 days before the due date at 9am, if that moment is still ahead.
//  2. Otherwise, 9am on the due date itself, if that is still ahead - so a
//     deadline added 2 days out still gets an alert instead of silence.
//  3. Otherwise null (nothing useful left to say). Scheduling a date in the
//     past either fires immediately or errors depending on platform.
function planNotification(
  reminder: ReminderNotificationInput,
): { triggerDate: Date; body: string } | null {
  const now = Date.now();
  const due = new Date(`${reminder.dueDate}T00:00:00`);

  const early = new Date(due);
  early.setDate(early.getDate() - DAYS_BEFORE_DUE);
  const earlyTrigger = atNotifyHour(early);
  if (earlyTrigger.getTime() > now) {
    return {
      triggerDate: earlyTrigger,
      body: `${reminder.title} is due in ${DAYS_BEFORE_DUE} days`,
    };
  }

  const dueDayTrigger = atNotifyHour(due);
  if (dueDayTrigger.getTime() > now) {
    return {
      triggerDate: dueDayTrigger,
      body: `${reminder.title} is due today`,
    };
  }

  return null;
}

// Idempotent: cancels any existing notification for this reminder first,
// so calling it again (edit, reconcile pass) never creates duplicates.
// Assumes permission was already granted - callers check that.
export async function scheduleReminderNotification(
  reminder: ReminderNotificationInput,
) {
  await cancelReminderNotification(reminder.id);

  const plan = planNotification(reminder);
  if (!plan) return;

  await ensureReminderNotificationChannel();

  await Notifications.scheduleNotificationAsync({
    identifier: identifierForReminder(reminder.id),
    content: {
      title: "Upcoming deadline",
      body: plan.body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: plan.triggerDate,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

export async function cancelReminderNotification(reminderId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(
      identifierForReminder(reminderId),
    );
  } catch {
    // Nothing was scheduled under this identifier - nothing to cancel.
  }
}

// Used when the toggle is switched off and on sign-out. Only reminder
// notifications exist in the app today, so clearing everything is
// equivalent to clearing just these - revisit if another feature starts
// scheduling its own local notifications.
export async function cancelAllReminderNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Which reminders currently have a scheduled notification on this device,
// by reading the OS's own list back rather than tracking it separately -
// same "ask the source of truth" reasoning as the calendar sync badge,
// which checks reminder_calendar_syncs rather than a locally-held flag.
// Safe to call regardless of permission state; returns empty if nothing is
// scheduled rather than erroring.
export async function getScheduledReminderIds(): Promise<Set<string>> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = "reminder-";

  return new Set(
    scheduled
      .map((request) => request.identifier)
      .filter((identifier) => identifier.startsWith(prefix))
      .map((identifier) => identifier.slice(prefix.length)),
  );
}
