import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import {
  cancelAllReminderNotifications,
  hasNotificationPermissionAsync,
  requestNotificationPermissionsAsync,
  scheduleReminderNotification,
} from "@/lib/notifications";
import { getRemindersForScheduling } from "@/lib/offline-db";
import { showAlert } from "@/providers/alert-provider";

export const PUSH_NOTIFICATIONS_STORAGE_KEY =
  "verifast:pushNotificationsEnabled";

// Schedules (or re-schedules - scheduleReminderNotification is idempotent)
// a notification for every one of the user's reminders. Shared by
// the toggle-on backfill below and the app-start reconcile pass in
// _layout.tsx, since both need to do exactly this: make sure the device's
// scheduled notifications match what's actually pending in the database.
export async function scheduleAllPendingReminders(userId: string) {
  // Read from the on-device reminders (which sync.ts keeps in step with
  // Supabase), so this works offline and also covers reminders that were
  // created offline and haven't reached the server yet.
  let reminders;
  try {
    reminders = getRemindersForScheduling(userId);
  } catch (error) {
    console.error("Failed to load reminders to schedule", error);
    return;
  }

  for (const reminder of reminders) {
    try {
      await scheduleReminderNotification({
        id: reminder.id,
        title: reminder.title,
        dueDate: reminder.due_date,
      });
    } catch (notificationError) {
      console.error(
        "Failed to schedule notification",
        reminder.id,
        notificationError,
      );
    }
  }
}

// Runs once per app foreground/launch while signed in. Silently does
// nothing unless the user has both turned the toggle on AND already
// granted permission - it must never pop the permission dialog itself,
// since that belongs to an explicit toggle action, not something that
// happens automatically on launch. This is what keeps a reminder added on
// one device from staying unscheduled on another until that other device's
// toggle happens to be touched again.
export async function reconcileReminderNotifications(userId: string) {
  const [toggleValue, permissionGranted] = await Promise.all([
    AsyncStorage.getItem(PUSH_NOTIFICATIONS_STORAGE_KEY),
    hasNotificationPermissionAsync(),
  ]);

  if (toggleValue !== "true" || !permissionGranted) return;

  await scheduleAllPendingReminders(userId);
}

// Shared between the Deadlines & Reminders screen and the Profile screen -
// both show a Push Notifications toggle for the same per-device setting
// (same pattern as Calendar Sync), so the enable/backfill/disable logic
// lives here once instead of duplicated - and possibly drifting - across
// the two screens.
export function usePushNotificationsToggle(userId: string | undefined) {
  const [enabled, setEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PUSH_NOTIFICATIONS_STORAGE_KEY).then((value) => {
      if (value === "true") setEnabled(true);
    });
  }, []);

  const toggle = useCallback(
    async (nextValue: boolean) => {
      if (!nextValue) {
        setEnabled(false);
        await AsyncStorage.setItem(PUSH_NOTIFICATIONS_STORAGE_KEY, "false");
        await cancelAllReminderNotifications();
        return;
      }

      const granted = await requestNotificationPermissionsAsync();
      if (!granted) {
        showAlert(
          "Notifications need permission",
          "VeriFast needs notification access to alert you before deadlines. You can enable it in your device Settings.",
          undefined,
          { tone: "warning", icon: "notifications-outline" },
        );
        return;
      }

      setEnabled(true);
      await AsyncStorage.setItem(PUSH_NOTIFICATIONS_STORAGE_KEY, "true");

      if (!userId) return;

      // Backfill: schedule every pending reminder. Fetched directly rather
      // than relying on a screen's already-loaded list, since Profile
      // (where this toggle also lives) doesn't load reminders itself.
      setIsSyncing(true);
      await scheduleAllPendingReminders(userId);
      setIsSyncing(false);
    },
    [userId],
  );

  return { enabled, isSyncing, toggle };
}
