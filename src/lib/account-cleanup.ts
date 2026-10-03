import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";

import { removeReminderEvent } from "@/lib/calendar-sync";
import { clearExportedFiles } from "@/lib/export-files";
import { cancelAllReminderNotifications } from "@/lib/notifications";
import {
  getLocalArtifactsForUser,
  wipeCachedDataForUser,
} from "@/lib/offline-db";

// Must match RECENT_SEARCHES_KEY in app/(tabs)/search.tsx. Recent searches
// are typed document and academic-info names, so they're personal data too.
const RECENT_SEARCHES_KEY = "recent_searches";

// Removes everything this device holds for a user whose account was just
// deleted on the server: calendar events, scheduled notifications,
// downloaded document files, the offline database rows, and recent
// searches. Every step is best-effort and independent - the account is
// already gone server-side, so one failing step must never block the
// others or strand the user on a screen they can't leave.
//
// Scope note: calendar events are only removed on *this* device. Other
// devices signed into the same account keep their own copies until the
// app is reinstalled or the events are deleted by hand.
export async function wipeLocalAccountData(userId: string) {
  let artifacts = {
    fileUris: [] as string[],
    calendarEventIds: [] as string[],
  };
  try {
    artifacts = getLocalArtifactsForUser(userId);
  } catch {
    // Nothing recoverable to look up - carry on with the rest.
  }

  // removeReminderEvent already swallows "event is gone" failures.
  await Promise.all(
    artifacts.calendarEventIds.map((eventId) => removeReminderEvent(eventId)),
  );

  for (const uri of artifacts.fileUris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // File already gone or unreadable - the row is wiped below anyway.
    }
  }

  clearExportedFiles();

  try {
    await cancelAllReminderNotifications();
  } catch {
    // Same: best-effort.
  }

  try {
    wipeCachedDataForUser(userId);
  } catch {
    // Best-effort.
  }

  try {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Best-effort.
  }
}
