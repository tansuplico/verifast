import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AddReminderModal,
  type EditableReminder,
} from "@/components/add-reminder-modal";
import { LoadErrorState } from "@/components/load-error-state";
import { MonthCalendar } from "@/components/month-calendar";
import { SkeletonBlock } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { ToggleSwitch } from "@/components/toggle-switch";
import {
  CATEGORY_STYLE,
  type ReminderCategory,
} from "@/constants/reminder-categories";
import { Spacing } from "@/constants/theme";
import { useIsOnline } from "@/hooks/use-network-status";
import { usePushNotificationsToggle } from "@/hooks/use-push-notifications-toggle";
import {
  ensureCalendarPermission,
  removeReminderEvent,
  upsertReminderEvent,
} from "@/lib/calendar-sync";
import { getDeviceId } from "@/lib/device-id";
import { getScheduledReminderIds } from "@/lib/notifications";
import {
  getCachedReminders,
  removeCalendarEventLocal,
  setCalendarEventLocal,
  type CachedReminderRow,
  type SyncStatus,
} from "@/lib/offline-db";
import { subscribeToSync, syncReminders } from "@/lib/sync";
import { showAlert } from "@/providers/alert-provider";
import { useAuth } from "@/providers/auth-provider";

// Days-out window the top banner counts against ("upcoming deadlines in
// the next 3 weeks").
const UPCOMING_WINDOW_DAYS = 21;

// Overdue badge + the "N overdue" summary banner. Kept distinct from every
// CATEGORY_STYLE color so it never reads as a category.
const OVERDUE_COLOR = "#dc2626";

// Filled "Nothing due" banner. A step deeper than the app's teal (#0d9488)
// so white text on it stays comfortably readable.
const EMPTY_BANNER_COLOR = "#0f766e";

// Whether Calendar Sync is on is a per-device setting, not an account one
// (the calendar events themselves live on this device), so it's persisted
// in AsyncStorage - same as Push Notifications (see
// use-push-notifications-toggle.ts), just tracked under its own key.
const CALENDAR_SYNC_STORAGE_KEY = "verifast:calendarSyncEnabled";

// Shown once, the first time a user turns Calendar Sync on - after that,
// enabling/disabling again doesn't repeat it. Tracked separately from
// CALENDAR_SYNC_STORAGE_KEY so it still doesn't reappear even if the user
// later turns sync off and back on.
const CALENDAR_PRIVACY_NOTICE_STORAGE_KEY =
  "verifast:calendarPrivacyNoticeShown";

type Reminder = {
  id: string;
  title: string;
  dueDate: string;
  category: ReminderCategory;
  calendarEventId: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
};

function toReminder(row: CachedReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    category: row.category,
    calendarEventId: row.calendar_event_id,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
  };
}

function formatFullDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Whole-day difference between now and the due date, treating the due date
// as local midnight (it's a Postgres `date`, not a timestamp).
function daysUntil(dateString: string) {
  const due = new Date(`${dateString}T00:00:00`);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round(
    (due.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  );
}

// Overdue reminders get their own badge on the card instead of a label
// here, so this only covers today/future.
function dueInLabel(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

function ReminderSkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <SkeletonBlock width={72} height={22} radius={999} />
        <SkeletonBlock width={18} height={18} radius={9} />
      </View>
      <SkeletonBlock
        width="65%"
        height={14}
        radius={4}
        style={{ marginTop: 4 }}
      />
      <SkeletonBlock
        width="45%"
        height={11}
        radius={4}
        style={{ marginTop: 4 }}
      />
    </View>
  );
}

export default function DeadlinesRemindersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const isOnline = useIsOnline();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Push Notifications state/toggle comes from the shared hook so this
  // screen and Profile can't drift out of sync with each other.
  const {
    enabled: pushEnabled,
    isSyncing: isSyncingPush,
    toggle: handlePushToggle,
  } = usePushNotificationsToggle(session?.user.id);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingReminder, setEditingReminder] =
    useState<EditableReminder | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Toggled by the header's calendar/list icon. Calendar month/selected day
  // are independent of the list's own state so switching views back and
  // forth doesn't reset anything unexpectedly.
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Which reminders have a notification scheduled on this device right
  // now - read back from the OS rather than inferred from the toggle, so
  // it reflects reality even for reminders too close to/past their due
  // date to have anything scheduled despite Push Notifications being on.
  const [scheduledReminderIds, setScheduledReminderIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    AsyncStorage.getItem(CALENDAR_SYNC_STORAGE_KEY).then((value) => {
      if (value === "true") setCalendarSyncEnabled(true);
    });
  }, []);

  // Local-first: the list always comes from the on-device database, so it
  // looks and behaves the same with or without a connection. Syncing with
  // Supabase happens around it (see sync.ts), never in front of it. The
  // calendar badge comes from the same local copy (this device's calendar
  // event per reminder), and the alert badge is read back from the OS.
  const reloadFromLocal = useCallback(async () => {
    if (!session) return;
    const deviceId = await getDeviceId();
    setReminders(getCachedReminders(session.user.id, deviceId).map(toReminder));
  }, [session]);

  const loadReminders = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;
    const deviceId = await getDeviceId();

    // Show what's on the device right away. Skeletons only appear when
    // there is nothing local yet (first ever load while online).
    const local = getCachedReminders(userId, deviceId);
    setReminders(local.map(toReminder));
    setScheduledReminderIds(await getScheduledReminderIds());
    if (local.length > 0) setIsLoading(false);

    if (!isOnline) {
      setLoadError(false);
      setIsLoading(false);
      return;
    }

    const syncResult = await syncReminders(userId);
    const afterSync = getCachedReminders(userId, deviceId);
    setReminders(afterSync.map(toReminder));
    // Only a failed sync with nothing on the device is worth an error
    // screen; otherwise the local list is still perfectly usable.
    setLoadError(!syncResult.ok && afterSync.length === 0);
    setIsLoading(false);
  }, [session, isOnline]);

  useFocusEffect(
    useCallback(() => {
      loadReminders();
    }, [loadReminders]),
  );

  // Pull-to-refresh reuses the same local-first load: it re-reads the
  // device copy (and the OS's scheduled-notification state) and, when
  // online, syncs with Supabase. Offline it just re-reads local data and
  // finishes immediately, so the spinner never hangs.
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadReminders();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadReminders]);

  // A background sync (reconnect, app foreground, a save's own push) can
  // clear "waiting to sync" badges or pull in reminders from another device.
  useEffect(
    () => subscribeToSync(() => void reloadFromLocal()),
    [reloadFromLocal],
  );

  // Overdue reminders are counted separately rather than lumped in with
  // "upcoming" - a deadline that already passed isn't upcoming.
  const upcomingCount = reminders.filter((r) => {
    const days = daysUntil(r.dueDate);
    return days >= 0 && days <= UPCOMING_WINDOW_DAYS;
  }).length;
  const overdueCount = reminders.filter((r) => daysUntil(r.dueDate) < 0).length;
  // The plain "Nothing due" state renders as a filled banner (loading and
  // error states stay as plain text), which replaces the summary's
  // underline divider.
  const showEmptyBanner =
    upcomingCount === 0 &&
    !(isLoading && reminders.length === 0) &&
    !(loadError && reminders.length === 0);

  // due date -> one dot color per reminder on that day, reusing the same
  // CATEGORY_STYLE colors as the list cards so the calendar and list read
  // as the same data, not two different views with their own palette.
  const markersByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const reminder of reminders) {
      const colors = map.get(reminder.dueDate) ?? [];
      colors.push(CATEGORY_STYLE[reminder.category].color);
      map.set(reminder.dueDate, colors);
    }
    return map;
  }, [reminders]);

  const selectedDateReminders = useMemo(
    () =>
      selectedDate ? reminders.filter((r) => r.dueDate === selectedDate) : [],
    [reminders, selectedDate],
  );

  // Deletes every synced reminder's calendar event and clears its
  // calendar_event_id - the mirror image of the backfill loop in
  // handleCalendarSyncToggle. Used when the user explicitly chooses to
  // remove events on turning sync off, not called automatically.
  async function removeAllSyncedEvents() {
    const synced = reminders.filter(
      (r): r is Reminder & { calendarEventId: string } =>
        r.calendarEventId !== null,
    );
    if (synced.length === 0) return;

    setIsSyncingCalendar(true);
    const deviceId = await getDeviceId();
    for (const reminder of synced) {
      await removeReminderEvent(reminder.calendarEventId);
      // Recorded on the device; sync.ts removes it from Supabase when a
      // connection is available.
      removeCalendarEventLocal(reminder.id, deviceId);
    }
    setIsSyncingCalendar(false);
    await loadReminders();
  }

  // The actual "turn sync on" work - requests permission, flips the
  // toggle, then backfills. Split out from handleCalendarSyncToggle so the
  // one-time privacy notice below can gate it without duplicating this
  // logic.
  async function enableCalendarSync() {
    const granted = await ensureCalendarPermission();
    if (!granted) {
      showAlert(
        "Calendar access needed",
        "VeriFast needs calendar access to sync your deadlines. You can enable it in your device Settings.",
        undefined,
        { tone: "warning", icon: "calendar-outline" },
      );
      return;
    }

    setCalendarSyncEnabled(true);
    await AsyncStorage.setItem(CALENDAR_SYNC_STORAGE_KEY, "true");

    // Backfill: push every reminder that doesn't already have a synced
    // event yet. Reminders created while sync was off (or before this
    // feature existed) would otherwise silently never show up on the
    // device calendar until the user happened to edit them.
    const unsynced = reminders.filter((r) => !r.calendarEventId);
    if (unsynced.length === 0) return;

    setIsSyncingCalendar(true);
    let failureCount = 0;
    const deviceId = await getDeviceId();

    for (const reminder of unsynced) {
      try {
        const calendarEventId = await upsertReminderEvent({
          title: reminder.title,
          dueDate: reminder.dueDate,
          categoryLabel: CATEGORY_STYLE[reminder.category].label,
        });
        setCalendarEventLocal(reminder.id, deviceId, calendarEventId);
      } catch (calendarError) {
        failureCount += 1;
        console.error(
          "Failed to sync reminder to calendar",
          reminder.id,
          calendarError,
        );
      }
    }

    setIsSyncingCalendar(false);
    await loadReminders();

    if (failureCount > 0) {
      showAlert(
        "Some reminders didn't sync",
        `${failureCount} of ${unsynced.length} deadlines couldn't be added to your calendar. Try again from Settings.`,
        undefined,
        { tone: "warning" },
      );
    }
  }

  async function handleCalendarSyncToggle(nextValue: boolean) {
    if (!nextValue) {
      const synced = reminders.filter((r) => r.calendarEventId !== null);

      // Nothing synced yet - just flip it off, nothing to ask about.
      if (synced.length === 0) {
        setCalendarSyncEnabled(false);
        await AsyncStorage.setItem(CALENDAR_SYNC_STORAGE_KEY, "false");
        return;
      }

      showAlert(
        "Turn off Calendar Sync?",
        `You have ${synced.length} deadline${synced.length === 1 ? "" : "s"} on your device calendar. You can leave them there or remove them now.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Keep on Calendar",
            onPress: async () => {
              setCalendarSyncEnabled(false);
              await AsyncStorage.setItem(CALENDAR_SYNC_STORAGE_KEY, "false");
            },
          },
          {
            text: "Remove from Calendar",
            style: "destructive",
            onPress: async () => {
              setCalendarSyncEnabled(false);
              await AsyncStorage.setItem(CALENDAR_SYNC_STORAGE_KEY, "false");
              await removeAllSyncedEvents();
            },
          },
        ],
        { tone: "info", icon: "calendar-outline" },
      );
      return;
    }

    const noticeAlreadyShown = await AsyncStorage.getItem(
      CALENDAR_PRIVACY_NOTICE_STORAGE_KEY,
    );

    if (noticeAlreadyShown === "true") {
      await enableCalendarSync();
      return;
    }

    // First time this device has turned sync on: explain what it actually
    // does before requesting permission, since reminder titles are about
    // to leave VeriFast's own database and land in the phone's native
    // calendar - which, depending on the user's device settings, may sync
    // to a Google or iCloud account and become visible to any other app
    // with calendar access.
    showAlert(
      "Add deadlines to your calendar?",
      'This adds your deadlines to a new "VeriFast Deadlines" calendar on your phone. Depending on your device settings, that calendar may sync to your Google or iCloud account and be visible to other apps that have calendar access.',
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            await AsyncStorage.setItem(
              CALENDAR_PRIVACY_NOTICE_STORAGE_KEY,
              "true",
            );
            await enableCalendarSync();
          },
        },
      ],
      { tone: "info", icon: "calendar-outline" },
    );
  }

  // Shared by the List view and the Calendar view's selected-day list, so
  // both render the exact same card instead of two copies drifting apart.
  function renderReminderCard(reminder: Reminder) {
    const style = CATEGORY_STYLE[reminder.category];
    const days = daysUntil(reminder.dueDate);
    return (
      <Pressable
        key={reminder.id}
        style={styles.card}
        onPress={() => {
          setEditingReminder(reminder);
          setIsAddModalVisible(true);
        }}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: `${style.color}1A` },
              ]}
            >
              <Ionicons name={style.icon} size={13} color={style.color} />
              <ThemedText
                type="small"
                style={[styles.categoryLabel, { color: style.color }]}
              >
                {style.label}
              </ThemedText>
            </View>
            {days < 0 && (
              <View
                style={[
                  styles.categoryBadge,
                  { backgroundColor: `${OVERDUE_COLOR}1A` },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={13}
                  color={OVERDUE_COLOR}
                />
                <ThemedText
                  type="small"
                  style={[styles.categoryLabel, { color: OVERDUE_COLOR }]}
                >
                  Overdue
                </ThemedText>
              </View>
            )}
          </View>
          <View style={styles.cardIconRow}>
            {reminder.syncStatus !== "synced" && (
              <Ionicons
                name={
                  reminder.syncError ? "alert-circle" : "cloud-upload-outline"
                }
                size={16}
                color={reminder.syncError ? "#ef4444" : "#a5a9b1"}
                accessibilityLabel={
                  reminder.syncError ? "Couldn't sync" : "Waiting to sync"
                }
              />
            )}
            {reminder.calendarEventId && (
              <Ionicons
                name="calendar"
                size={16}
                color="#0d9488"
                accessibilityLabel="Synced to your calendar"
              />
            )}
            {scheduledReminderIds.has(reminder.id) ? (
              <Ionicons
                name="notifications"
                size={16}
                color="#0d9488"
                accessibilityLabel="Alert scheduled for this reminder"
              />
            ) : (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  showAlert(
                    "No alert scheduled",
                    pushEnabled
                      ? "This deadline is too close to or past its alert window, so nothing is scheduled for it."
                      : "Turn on Push Notifications below to get an alert for this reminder.",
                    undefined,
                    { tone: "info", icon: "notifications-outline" },
                  )
                }
              >
                <Ionicons
                  name="notifications-outline"
                  size={18}
                  color="#94a3b8"
                />
              </Pressable>
            )}
          </View>
        </View>

        <ThemedText type="smallBold" style={styles.cardTitle}>
          {reminder.title}
        </ThemedText>
        <ThemedText type="small" style={styles.cardSubtitle}>
          {days < 0
            ? formatFullDate(reminder.dueDate)
            : `${formatFullDate(reminder.dueDate)} · ${dueInLabel(days)}`}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={20} color="#1a1c20" />
          </Pressable>
          <ThemedText type="smallBold" style={styles.headerTitle}>
            Deadlines and Reminders
          </ThemedText>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setViewMode((mode) => (mode === "list" ? "calendar" : "list"));
              setSelectedDate(null);
            }}
            style={styles.iconButton}
            accessibilityLabel={
              viewMode === "list" ? "Show calendar view" : "Show list view"
            }
          >
            <Ionicons
              name={viewMode === "list" ? "calendar-outline" : "list-outline"}
              size={18}
              color="#1a1c20"
            />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          <View
            style={[
              styles.summary,
              showEmptyBanner && styles.summaryWithBanner,
            ]}
          >
            {isLoading && reminders.length === 0 ? (
              <ThemedText type="small" style={styles.summaryMuted}>
                Loading your deadlines...
              </ThemedText>
            ) : loadError && reminders.length === 0 ? (
              <ThemedText type="small" style={styles.summaryMuted}>
                Couldn&apos;t load your deadlines — check your connection.
              </ThemedText>
            ) : (
              <>
                {upcomingCount > 0 ? (
                  <View style={styles.summaryMain}>
                    <ThemedText style={styles.summaryNumber}>
                      {upcomingCount}
                    </ThemedText>
                    <ThemedText type="small" style={styles.summaryMuted}>
                      {upcomingCount === 1 ? "deadline" : "deadlines"} due in
                      the next 3 weeks
                    </ThemedText>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.banner,
                      { backgroundColor: `${EMPTY_BANNER_COLOR}1A` },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color={EMPTY_BANNER_COLOR}
                    />
                    <ThemedText
                      type="smallBold"
                      style={[styles.bannerText, { color: EMPTY_BANNER_COLOR }]}
                    >
                      Nothing due in the next 3 weeks
                    </ThemedText>
                  </View>
                )}
                {overdueCount > 0 && (
                  <View
                    style={[
                      styles.banner,
                      { backgroundColor: `${OVERDUE_COLOR}1A` },
                    ]}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={20}
                      color={OVERDUE_COLOR}
                    />
                    <ThemedText
                      type="smallBold"
                      style={[styles.bannerText, { color: OVERDUE_COLOR }]}
                    >
                      {overdueCount} overdue
                    </ThemedText>
                  </View>
                )}
              </>
            )}
          </View>

          {viewMode === "list" ? (
            <>
              <ThemedText type="smallBold" style={styles.sectionLabel}>
                UPCOMING
              </ThemedText>

              {!isLoading &&
                reminders.length === 0 &&
                (loadError ? (
                  <LoadErrorState onRetry={() => loadReminders()} />
                ) : (
                  <ThemedText type="small" style={styles.emptyText}>
                    No deadlines or reminders right now
                  </ThemedText>
                ))}

              <View style={styles.list}>
                {isLoading &&
                  reminders.length === 0 &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <ReminderSkeletonCard key={`reminder-skeleton-${i}`} />
                  ))}

                {reminders.map(renderReminderCard)}
              </View>
            </>
          ) : (
            <>
              <MonthCalendar
                month={calendarMonth}
                markersByDate={markersByDate}
                selectedDate={selectedDate}
                onSelectDate={(date) =>
                  setSelectedDate((current) => (current === date ? null : date))
                }
                onChangeMonth={(direction) =>
                  setCalendarMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + direction,
                        1,
                      ),
                  )
                }
              />

              {selectedDate && (
                <View style={styles.selectedDaySection}>
                  <ThemedText type="smallBold" style={styles.sectionLabel}>
                    {formatFullDate(selectedDate).toUpperCase()}
                  </ThemedText>
                  {selectedDateReminders.length === 0 ? (
                    <ThemedText type="small" style={styles.emptyText}>
                      No deadlines this day
                    </ThemedText>
                  ) : (
                    <View style={styles.list}>
                      {selectedDateReminders.map(renderReminderCard)}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          <View style={styles.settingsList}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <ThemedText type="smallBold">Push Notifications</ThemedText>
                <ThemedText type="small" style={styles.settingSubtext}>
                  {isSyncingPush
                    ? "Scheduling your alerts…"
                    : "Get alerts 3 days before each deadline"}
                </ThemedText>
              </View>
              <ToggleSwitch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                disabled={isSyncingPush}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <ThemedText type="smallBold">Calendar Sync</ThemedText>
                <ThemedText type="small" style={styles.settingSubtext}>
                  {isSyncingCalendar
                    ? "Updating your calendar…"
                    : "Add deadlines to your phone's calendar"}
                </ThemedText>
              </View>
              <ToggleSwitch
                value={calendarSyncEnabled}
                onValueChange={handleCalendarSyncToggle}
                disabled={isSyncingCalendar}
              />
            </View>
          </View>
        </ScrollView>
        <Pressable
          style={styles.fab}
          onPress={() => {
            setEditingReminder(null);
            setIsAddModalVisible(true);
          }}
        >
          <Ionicons name="add" size={26} color="#ffffff" />
        </Pressable>

        <AddReminderModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          userId={session?.user.id}
          editingReminder={editingReminder}
          onSaved={() => loadReminders()}
          calendarSyncEnabled={calendarSyncEnabled}
          pushNotificationsEnabled={pushEnabled}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#1a1c20", fontSize: 16 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  summary: {
    marginTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  summaryWithBanner: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  bannerText: { flex: 1 },
  summaryMain: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.two,
  },
  summaryNumber: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    color: "#1a1c20",
  },
  summaryMuted: { color: "#60646C" },
  sectionLabel: { color: "#8b8f99", letterSpacing: 0.5 },
  list: { gap: Spacing.two },
  selectedDaySection: { gap: Spacing.two },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eceef1",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryLabel: { fontWeight: "700" },
  cardTitle: { color: "#1a1c20", marginTop: 2 },
  cardSubtitle: { color: "#8b8f99" },
  emptyText: { color: "#8b8f99" },
  settingsList: {
    marginTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eceef1",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  settingTextGroup: { flex: 1, gap: 2, marginRight: Spacing.three },
  settingSubtext: { color: "#8b8f99" },
  fab: {
    position: "absolute",
    right: Spacing.four,
    bottom: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
