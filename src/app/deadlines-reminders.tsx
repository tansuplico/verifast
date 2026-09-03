import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddReminderModal } from "@/components/add-reminder-modal";
import { ThemedText } from "@/components/themed-text";
import { ToggleSwitch } from "@/components/toggle-switch";
import {
  CATEGORY_STYLE,
  type ReminderCategory,
} from "@/constants/reminder-categories";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

// Days-out window the top banner counts against ("upcoming deadlines in
// the next 3 weeks").
const UPCOMING_WINDOW_DAYS = 21;

type Reminder = {
  id: string;
  title: string;
  dueDate: string;
  category: ReminderCategory;
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
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);

  const loadReminders = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);

    const { data } = await supabase
      .from("reminders")
      .select("id, title, due_date, category")
      .eq("user_id", session.user.id)
      .eq("status", "pending")
      .order("due_date", { ascending: true });

    setReminders(
      (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
        category: row.category as ReminderCategory,
      })),
    );
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
              {isLoading
                ? "Loading your deadlines..."
                : `You have ${upcomingCount} upcoming deadline${
                    upcomingCount === 1 ? "" : "s"
                  } in the next 3 weeks.`}
            </ThemedText>
          </View>

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            UPCOMING
          </ThemedText>

          {!isLoading && reminders.length === 0 && (
            <ThemedText type="small" style={styles.emptyText}>
              No deadlines or reminders right now
            </ThemedText>
          )}

          <View style={styles.list}>
            {reminders.map((reminder) => {
              const style = CATEGORY_STYLE[reminder.category];
              const days = daysUntil(reminder.dueDate);
              return (
                <View key={reminder.id} style={styles.card}>
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
                </View>
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
          </View>
        </ScrollView>
        <Pressable
          style={styles.fab}
          onPress={() => setIsAddModalVisible(true)}
        >
          <Ionicons name="add" size={26} color="#ffffff" />
        </Pressable>

        <AddReminderModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          userId={session?.user.id}
          onCreated={() => loadReminders()}
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
