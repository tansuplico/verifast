import { ThemedText } from "@/components/themed-text";
import { ToggleSwitch } from "@/components/toggle-switch";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ProfileRow = {
  full_name: string | null;
  student_id: string | null;
  program: string | null;
  avatar_url: string | null;
};

type SubscriptionRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysLeft(dateString: string) {
  const diff = new Date(dateString).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getInitials(name: string | null, email: string | undefined) {
  const source = name?.trim() || email || "?";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function subscriptionCopy(sub: SubscriptionRow | null) {
  if (!sub) return { title: "VeriFast", detail: "Loading plan..." };
  switch (sub.status) {
    case "trialing":
      return {
        title: "VeriFast Free Trial",
        detail: sub.trial_ends_at
          ? `${daysLeft(sub.trial_ends_at)} days left`
          : "Trial active",
      };
    case "active":
      return {
        title: "VeriFast Annual",
        detail: sub.current_period_end
          ? `Active. Renews ${formatDate(sub.current_period_end)}`
          : "Active",
      };
    case "past_due":
      return { title: "VeriFast Annual", detail: "Payment past due" };
    case "canceled":
      return { title: "VeriFast Annual", detail: "Canceled" };
    case "expired":
    default:
      return { title: "VeriFast Annual", detail: "Trial expired" };
  }
}

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(
    null,
  );

  // Local-only for now: there is no notification_preferences table yet and
  // Expo Notifications isn't integrated (see pending tasks), so these
  // reflect UI state only and reset on app restart until that's built.
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);

    const [profileResult, subscriptionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, student_id, program, avatar_url")
        .eq("id", session.user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end")
        .eq("user_id", session.user.id)
        .single(),
    ]);

    setProfile(profileResult.data ?? null);
    setSubscription(subscriptionResult.data ?? null);
    setIsLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const displayName = profile?.full_name || session?.user.email || "there";
  const metaLine = [profile?.program, profile?.student_id]
    .filter(Boolean)
    .join(" • ");
  const plan = subscriptionCopy(subscription);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bodyContent}>
          <ThemedText type="title" style={styles.pageTitle}>
            Profile
          </ThemedText>

          <View style={styles.card}>
            <View style={styles.identityRow}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <ThemedText style={styles.avatarInitials}>
                    {getInitials(
                      profile?.full_name ?? null,
                      session?.user.email,
                    )}
                  </ThemedText>
                </View>
              )}

              <View style={styles.identityText}>
                <ThemedText type="smallBold" style={styles.name}>
                  {isLoading ? "..." : displayName}
                </ThemedText>
                <View style={styles.metaRow}>
                  <Ionicons name="mail-outline" size={13} color="#8b8f99" />
                  <ThemedText type="small" style={styles.metaText}>
                    {session?.user.email}
                  </ThemedText>
                </View>
                {!!metaLine && (
                  <View style={styles.metaRow}>
                    <Ionicons name="school-outline" size={13} color="#8b8f99" />
                    <ThemedText type="small" style={styles.metaText}>
                      {metaLine}
                    </ThemedText>
                  </View>
                )}
              </View>

              <Pressable onPress={() => showComingSoon("Editing your profile")}>
                <ThemedText type="link" style={styles.editLink}>
                  Edit
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => router.push("/subscription")}>
            <LinearGradient
              colors={["#14b8a6", "#0f766e"]}
              start={{ x: 1, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={styles.subscriptionCard}
            >
              <View style={styles.subscriptionIconBadge}>
                <Ionicons name="star" size={18} color="#ffffff" />
              </View>
              <View style={styles.subscriptionText}>
                <ThemedText type="smallBold" style={styles.subscriptionTitle}>
                  {plan.title}
                </ThemedText>
                <ThemedText type="small" style={styles.subscriptionDetail}>
                  {plan.detail}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ffffff" />
            </LinearGradient>
          </Pressable>

          <View style={styles.card}>
            <ThemedText type="small" style={styles.sectionLabel}>
              NOTIFICATIONS
            </ThemedText>

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <ThemedText type="smallBold">Push Notifications</ThemedText>
                <ThemedText type="small" style={styles.toggleSubtext}>
                  Deadline alerts on your device
                </ThemedText>
              </View>
              <ToggleSwitch
                value={pushEnabled}
                onValueChange={setPushEnabled}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <ThemedText type="smallBold">Email Reminders</ThemedText>
                <ThemedText type="small" style={styles.toggleSubtext}>
                  Weekly document digest
                </ThemedText>
              </View>
              <ToggleSwitch
                value={emailEnabled}
                onValueChange={setEmailEnabled}
              />
            </View>

            <View style={[styles.toggleRow, styles.toggleRowLast]}>
              <View style={styles.toggleText}>
                <ThemedText type="smallBold">SMS Alerts</ThemedText>
                <ThemedText type="small" style={styles.toggleSubtext}>
                  Critical deadline texts
                </ThemedText>
              </View>
              <ToggleSwitch value={smsEnabled} onValueChange={setSmsEnabled} />
            </View>
          </View>

          <View style={styles.card}>
            <ThemedText type="small" style={styles.sectionLabel}>
              ACCOUNT
            </ThemedText>

            <Pressable onPress={() => showComingSoon("Backup and recovery")}>
              <View style={styles.linkRow}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={20}
                  color="#60646C"
                />
                <ThemedText type="smallBold" style={styles.linkRowText}>
                  Backup and Recovery
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color="#c4c8d1" />
              </View>
            </Pressable>

            <Pressable
              onPress={() => showComingSoon("Security and privacy settings")}
            >
              <View style={styles.linkRow}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color="#60646C"
                />
                <ThemedText type="smallBold" style={styles.linkRowText}>
                  Security and Privacy
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color="#c4c8d1" />
              </View>
            </Pressable>

            <Pressable onPress={() => showComingSoon("Help and support")}>
              <View style={[styles.linkRow, styles.linkRowLast]}>
                <Ionicons
                  name="help-circle-outline"
                  size={20}
                  color="#60646C"
                />
                <ThemedText type="smallBold" style={styles.linkRowText}>
                  Help and Support
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color="#c4c8d1" />
              </View>
            </Pressable>
          </View>

          <Pressable onPress={signOut}>
            <View style={styles.logoutRow}>
              <Ionicons name="log-out-outline" size={20} color="#dc2626" />
              <ThemedText type="smallBold" style={styles.logoutText}>
                Log Out
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  bodyContent: { padding: Spacing.four, gap: Spacing.four },
  pageTitle: { fontSize: 32, lineHeight: 40, color: "#1a1c20" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: "#ffffff", fontWeight: "700", fontSize: 18 },
  identityText: { flex: 1, gap: 2 },
  name: { color: "#1a1c20", fontSize: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: "#8b8f99" },
  editLink: { color: "#0d9488", fontWeight: "600" },
  subscriptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  subscriptionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionText: { flex: 1, gap: 2 },
  subscriptionTitle: { color: "#ffffff" },
  subscriptionDetail: { color: "rgba(255,255,255,0.85)" },
  sectionLabel: { color: "#8b8f99", letterSpacing: 0.5 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  toggleRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  toggleText: { flex: 1, gap: 2, paddingRight: Spacing.two },
  toggleSubtext: { color: "#8b8f99" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  linkRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  linkRowText: { flex: 1, color: "#1a1c20" },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  logoutText: { color: "#dc2626" },
});
