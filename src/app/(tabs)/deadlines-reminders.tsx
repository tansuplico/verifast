import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AddReminderModal,
  type EditableReminder,
} from "@/components/add-reminder-modal";
import { LoadErrorState } from "@/components/load-error-state";
import { SkeletonBlock } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { ToggleSwitch } from "@/components/toggle-switch";
import {
  CATEGORY_STYLE,
  type ReminderCategory,
} from "@/constants/reminder-categories";
import { Spacing } from "@/constants/theme";
import {
  ensureCalendarPermission,
  removeReminderEvent,
  upsertReminderEvent,
} from "@/lib/calendar-sync";
import { getDeviceId } from "@/lib/device-id";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

// Days-out window the top banner counts against ("upcoming deadlines in
// the next 3 weeks").
const UPCOMING_WINDOW_DAYS = 21;

// Whether Calendar Sync is on is a per-device setting, not an account one
// (the calendar events themselves live on this device), so it's persisted
// in AsyncStorage rather than Supabase - unlike Push/Email below, which are
// still local-state-only placeholders with nothing to persist to yet.
const CALENDAR_SYNC_STORAGE_KEY = "verifast:calendarSyncEnabled";

type Reminder = {
  id: string;
  title: string;
  dueDate: string;
  category: ReminderCategory;
  calendarEventId: string | null;
};

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

function dueInLabel(days: number) {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
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
  const [isLoading, setIsLoading] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Local-state only, same as the Push/Email toggles on the Profile screen
  // and the 2FA toggle on Security & Privacy - Expo Notifications isn't
  // integrated yet (see pending tasks), so there's no backend to persist to.
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingReminder, setEditingReminder] =
    useState<EditableReminder | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CALENDAR_SYNC_STORAGE_KEY).then((value) => {
      if (value === "true") setCalendarSyncEnabled(true);
    });
  }, []);

  const loadReminders = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);

    const deviceId = await getDeviceId();

    // Two queries + a client-side merge, rather than one query with a
    // filtered embed - PostgREST's embedded-resource filter semantics
    // (left join vs. inner join once you filter the embedded table) are
    // easy to get subtly wrong without a live instance to check against,
    // and this reminders list is small enough that the extra round trip
    // costs nothing noticeable.
    const [remindersResult, syncsResult] = await Promise.all([
      supabase
        .from("reminders")
        .select("id, title, due_date, category")
        .eq("user_id", session.user.id)
        .eq("status", "pending")
        .order("due_date", { ascending: true }),
      supabase
        .from("reminder_calendar_syncs")
        .select("reminder_id, calendar_event_id")
        .eq("device_id", deviceId),
    ]);

    if (remindersResult.error) {
      console.error("Failed to load reminders", remindersResult.error);
      setLoadError(true);
    } else {
      setLoadError(false);

      if (syncsResult.error) {
        // Non-fatal: the reminders list itself still loads fine, it just
        // can't say which ones are synced to this device's calendar until
        // the next successful load.
        console.error("Failed to load calendar sync state", syncsResult.error);
      }

      const calendarEventIdByReminderId = new Map(
        (syncsResult.data ?? []).map((row) => [
          row.reminder_id,
          row.calendar_event_id,
        ]),
      );

      setReminders(
        (remindersResult.data ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          dueDate: row.due_date,
          category: row.category as ReminderCategory,
          calendarEventId: calendarEventIdByReminderId.get(row.id) ?? null,
        })),
      );
    }

    setIsLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadReminders();
    }, [loadReminders]),
  );

  const upcomingCount = reminders.filter(
    (r) => daysUntil(r.dueDate) <= UPCOMING_WINDOW_DAYS,
  ).length;

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
      await supabase
        .from("reminder_calendar_syncs")
        .delete()
        .eq("reminder_id", reminder.id)
        .eq("device_id", deviceId);
    }
    setIsSyncingCalendar(false);
    await loadReminders();
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

      Alert.alert(
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
      );
      return;
    }

    const granted = await ensureCalendarPermission();
    if (!granted) {
      Alert.alert(
        "Calendar access needed",
        "VeriFast needs calendar access to sync your deadlines. You can enable it in your device Settings.",
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
        await supabase.from("reminder_calendar_syncs").upsert(
          {
            reminder_id: reminder.id,
            device_id: deviceId,
            calendar_event_id: calendarEventId,
          },
          { onConflict: "reminder_id,device_id" },
        );
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
      Alert.alert(
        "Some reminders didn't sync",
        `${failureCount} of ${unsynced.length} deadlines couldn't be added to your calendar. Try again from Settings.`,
      );
    }
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
            onPress={() => showComingSoon("Calendar view")}
            style={styles.iconButton}
          >
            <Ionicons name="calendar-outline" size={18} color="#1a1c20" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.banner}>
            <Ionicons name="time-outline" size={18} color="#b45309" />
            <ThemedText type="small" style={styles.bannerText}>
              {isLoading && reminders.length === 0
                ? "Loading your deadlines..."
                : loadError && reminders.length === 0
                  ? "Couldn't load your deadlines — check your connection."
                  : `You have ${upcomingCount} upcoming deadline${
                      upcomingCount === 1 ? "" : "s"
                    } in the next 3 weeks.`}
            </ThemedText>
          </View>

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

            {reminders.map((reminder) => {
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
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: `${style.color}1A` },
                      ]}
                    >
                      <Ionicons
                        name={style.icon}
                        size={13}
                        color={style.color}
                      />
                      <ThemedText
                        type="small"
                        style={[styles.categoryLabel, { color: style.color }]}
                      >
                        {style.label}
                      </ThemedText>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => showComingSoon("Reminder alerts")}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={18}
                        color="#0d9488"
                      />
                    </Pressable>
                  </View>

                  <ThemedText type="smallBold" style={styles.cardTitle}>
                    {reminder.title}
                  </ThemedText>
                  <ThemedText type="small" style={styles.cardSubtitle}>
                    {formatFullDate(reminder.dueDate)} · {dueInLabel(days)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.settingsList}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <ThemedText type="smallBold">Push Notifications</ThemedText>
                <ThemedText type="small" style={styles.settingSubtext}>
                  Get alerts 3 days before each deadline
                </ThemedText>
              </View>
              <ToggleSwitch
                value={pushEnabled}
                onValueChange={setPushEnabled}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <ThemedText type="smallBold">Email Reminders</ThemedText>
                <ThemedText type="small" style={styles.settingSubtext}>
                  Weekly digest of upcoming items
                </ThemedText>
              </View>
              <ToggleSwitch
                value={emailEnabled}
                onValueChange={setEmailEnabled}
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
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    backgroundColor: "#fef9e7",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.three,
  },
  bannerText: { flex: 1, color: "#92400e" },
  sectionLabel: { color: "#8b8f99", letterSpacing: 0.5 },
  list: { gap: Spacing.two },
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
