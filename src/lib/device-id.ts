import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_STORAGE_KEY = "verifast:deviceId";

// Cached in-memory after the first read/generation so repeat calls within
// the same app session don't hit AsyncStorage every time.
let cachedDeviceId: string | null = null;

function generateId(): string {
  // Doesn't need to be a real UUID or cryptographically unguessable - it
  // only needs to be unique enough to tell "which of this account's
  // devices does this calendar event belong to" apart in
  // reminder_calendar_syncs, not to identify or authenticate anything.
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}

// A stable per-installation identifier, generated once and persisted in
// AsyncStorage - it only changes if the app is reinstalled or the user
// clears app storage. Used to key which calendar event (if any) *this*
// device created for a given reminder, since expo-calendar event IDs are
// only valid on the device that created them (see calendar-sync.ts) - two
// phones on the same account must never share one calendar_event_id.
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  const generated = generateId();
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  cachedDeviceId = generated;
  return generated;
}
