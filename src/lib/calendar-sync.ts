import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";

// Using the `/legacy` entry point deliberately - it's the stable,
// free-function API (requestCalendarPermissionsAsync, createEventAsync,
// etc.) rather than expo-calendar's newer class-based "next" API, which is
// still being iterated on. Both require a dev build either way; expo-calendar
// as a whole is unsupported in Expo Go.

const APP_CALENDAR_TITLE = "VeriFast Deadlines";

// How many minutes before the deadline's local midnight the OS should alarm
// the user - mirrors the "Get alerts 3 days before each deadline" copy
// already shown next to the Push Notifications toggle on this screen.
const ALARM_OFFSET_MINUTES = -3 * 24 * 60;

// Cached for the lifetime of the app so repeat syncs don't re-search the
// device's calendar list every time. The calendar itself persists on the
// device across app restarts - only the in-memory cache resets on cold start.
let cachedCalendarId: string | null = null;

export async function ensureCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

async function findAppCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const existing = calendars.find((cal) => cal.title === APP_CALENDAR_TITLE);
  return existing?.id ?? null;
}

async function createAppCalendar(): Promise<string> {
  // iOS requires a real source (the default local/iCloud source); Android
  // just needs a local-account source object - same split the Expo docs'
  // own example uses. That example is untyped JS; `Source.type` is
  // technically required by the TS definitions but ignored on Android when
  // `isLocalAccount` is set, so it's cast rather than fabricating a value.
  const defaultCalendarSource: Calendar.Source =
    Platform.OS === "ios"
      ? (await Calendar.getDefaultCalendarAsync()).source
      : ({ isLocalAccount: true, name: APP_CALENDAR_TITLE } as Calendar.Source);

  return Calendar.createCalendarAsync({
    title: APP_CALENDAR_TITLE,
    color: "#0d9488", // matches the teal accent used for reminder cards
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: defaultCalendarSource.id,
    source: defaultCalendarSource,
    name: "verifastDeadlines",
    ownerAccount: "personal",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

// Finds (or creates, once per device) the dedicated "VeriFast Deadlines"
// calendar, so synced events stay separate from the user's personal
// calendar instead of getting mixed in.
async function getAppCalendarId(): Promise<string> {
  if (cachedCalendarId) return cachedCalendarId;
  const found = await findAppCalendarId();
  cachedCalendarId = found ?? (await createAppCalendar());
  return cachedCalendarId;
}

// Creates an event, retrying once against a freshly found-or-created
// calendar if the first attempt fails. The cached calendar ID can go stale
// mid-session if the user deletes the "VeriFast Deadlines" calendar
// directly from the OS Calendar app - without this, every sync would keep
// failing against that dead ID until the app was force-closed and
// reopened (which is the only thing that clears the in-memory cache).
async function createEventWithRetry(
  eventData: Partial<Calendar.Event>,
): Promise<string> {
  const calendarId = await getAppCalendarId();
  try {
    return await Calendar.createEventAsync(calendarId, eventData);
  } catch (error) {
    cachedCalendarId = null;
    const freshCalendarId = await getAppCalendarId();
    if (freshCalendarId === calendarId) {
      // Re-found the exact same calendar id, so the calendar itself
      // wasn't the problem - retrying would just fail the same way.
      throw error;
    }
    return Calendar.createEventAsync(freshCalendarId, eventData);
  }
}

function allDayRangeForDueDate(dueDate: string) {
  // due_date is a plain Postgres `date` (e.g. "2026-11-02"). Build the range
  // from local midnight, the same way AddReminderModal parses it - not
  // `new Date(dueDate)` / `.toISOString()`, which convert through UTC first
  // and can silently shift the date by a day depending on the device's
  // time zone offset.
  const start = new Date(`${dueDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export type SyncableReminder = {
  title: string;
  dueDate: string;
  categoryLabel: string;
};

// Creates or updates the device calendar event for a reminder. Pass the
// reminder's existing `calendar_event_id` to update that event in place;
// omit it (or pass null/undefined) to create a new one. Returns the event's
// id so the caller can persist it back onto the reminder row.
export async function upsertReminderEvent(
  reminder: SyncableReminder,
  calendarEventId?: string | null,
): Promise<string> {
  const { start, end } = allDayRangeForDueDate(reminder.dueDate);

  const eventData = {
    title: reminder.title,
    notes: `${reminder.categoryLabel} deadline synced from VeriFast Student+`,
    startDate: start,
    endDate: end,
    allDay: true,
    alarms: [
      {
        relativeOffset: ALARM_OFFSET_MINUTES,
        method: Calendar.AlarmMethod.ALERT,
      },
    ],
  };

  if (calendarEventId) {
    try {
      await Calendar.updateEventAsync(calendarEventId, eventData);
      return calendarEventId;
    } catch {
      // The event may have been deleted on the device directly (e.g. from
      // the OS Calendar app) - fall through and recreate it rather than
      // surfacing an error for something the user can't act on from here.
    }
  }

  return createEventWithRetry(eventData);
}

// Removes a reminder's calendar event. Safe to call even if the event was
// already gone on the device - that failure is swallowed, since "no event"
// is the end state the caller wants either way.
export async function removeReminderEvent(
  calendarEventId: string,
): Promise<void> {
  try {
    await Calendar.deleteEventAsync(calendarEventId);
  } catch {
    // Already gone - nothing to do.
  }
}
