import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Fires 3 days before the due date, at 9am local time, matching the
// "Get alerts 3 days before each deadline" copy on the Push Notifications
// toggle in Deadlines and Reminders.
const DAYS_BEFORE_DUE = 3;
const NOTIFY_HOUR = 9;

const REMINDER_CHANNEL_ID = "reminders";

function identifierForReminder(reminderId: string) {
  // Namespaced and stable so re-scheduling the same reminder (e.g. when the
  // screen reloads) overwrites the prior notification instead of stacking
  // duplicates.
  return `reminder-${reminderId}`;
}

// Controls how a notification behaves while the app is open. Call once at
// app startup (see root _layout.tsx) - setNotificationHandler applies
// globally, not per-screen.
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

// Android 8+ requires every notification to belong to a channel, or it
// falls back to a generic, unlabeled "Miscellaneous" channel. No-op on iOS.
export async function ensureReminderNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Deadline Reminders",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

// Returns whether permission is granted. Only prompts the OS dialog if the
// user hasn't already answered - safe to call every time the toggle is
// switched on.
export async function requestNotificationPermissionsAsync() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

type ReminderInput = {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
};

// Computes the 3-days-before, 9am local trigger date. Returns null if that
// moment has already passed (e.g. the deadline is under 3 days away), since
// scheduling a notification in the past either fires immediately or errors
// depending on platform - neither is the intended behavior here.
function triggerDateForReminder(dueDate: string): Date | null {
  const due = new Date(`${dueDate}T00:00:00`);
  const trigger = new Date(due);
  trigger.setDate(trigger.getDate() - DAYS_BEFORE_DUE);
  trigger.setHours(NOTIFY_HOUR, 0, 0, 0);

  return trigger.getTime() > Date.now() ? trigger : null;
}

// Idempotent: cancels any existing notification for this reminder before
// scheduling, so calling this again (e.g. on every screen load) never
// creates duplicates.
export async function scheduleReminderNotification(reminder: ReminderInput) {
  const identifier = identifierForReminder(reminder.id);
  await cancelReminderNotification(reminder.id);

  const triggerDate = triggerDateForReminder(reminder.dueDate);
  if (!triggerDate) return;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: "Upcoming deadline",
      body: `${reminder.title} is due in ${DAYS_BEFORE_DUE} days`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
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
    // No-op if nothing was scheduled under this identifier.
  }
}

// Used when the Push Notifications toggle is switched off. Only reminder
// notifications exist in the app today, so clearing everything is
// equivalent to clearing just these - revisit if another feature starts
// scheduling its own local notifications.
export async function cancelAllReminderNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
