import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { SafeAreaView } from "react-native-safe-area-context";

// The "folders" table is always exactly 4 fixed categories per user,
// auto-seeded by the on_auth_user_created trigger (see the schema
// migration) - so this is a fixed constant, not data that needs fetching.
const FOLDERS_COUNT = 4;

type RecentDocument = {
  id: string;
  title: string;
  openedOn: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

type DocumentAlert = {
  id: string;
  date: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function iconForMimeType(
  mimeType: string | null,
): keyof typeof Ionicons.glyphMap {
  if (!mimeType) return "document-outline";
  if (mimeType.startsWith("image/")) return "image-outline";
  if (mimeType === "application/pdf") return "document-text-outline";
  return "document-outline";
}

const DOC_COLORS = ["#10b1a3", "#0BDA51", "#3b82f6", "#8b5cf6"];

const REMINDER_TYPE_STYLE: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  expiration: { icon: "alert-circle-outline", color: "#dc2626" },
  submission: { icon: "time-outline", color: "#d97706" },
  renewal: { icon: "refresh-outline", color: "#0891b2" },
};

export default function HomeScreen() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fullName, setFullName] = useState<string | null>(null);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [documentAlerts, setDocumentAlerts] = useState<DocumentAlert[]>([]);

  const loadHomeData = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      isRefresh ? setIsRefreshing(true) : setIsLoading(true);

      const [profileResult, countResult, recentResult, remindersResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", session.user.id)
            .single(),
          supabase
            .from("documents")
            .select("*", { count: "exact", head: true })
            .eq("user_id", session.user.id),
          supabase
            .from("documents")
            .select("id, name, mime_type, updated_at")
            .eq("user_id", session.user.id)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("reminders")
            .select("id, title, type, due_date")
            .eq("user_id", session.user.id)
            .eq("status", "pending")
            .order("due_date", { ascending: true })
            .limit(3),
        ]);

      setFullName(profileResult.data?.full_name ?? null);
      setDocumentsCount(countResult.count ?? 0);

      setRecentDocuments(
        (recentResult.data ?? []).map((doc, index) => ({
          id: doc.id,
          title: doc.name,
          openedOn: formatShortDate(doc.updated_at),
          icon: iconForMimeType(doc.mime_type),
          color: DOC_COLORS[index % DOC_COLORS.length],
        })),
      );

      setDocumentAlerts(
        (remindersResult.data ?? []).map((reminder) => {
          const style =
            REMINDER_TYPE_STYLE[reminder.type] ??
            REMINDER_TYPE_STYLE.submission;
          return {
            id: reminder.id,
            date: formatShortDate(reminder.due_date),
            text: reminder.title,
            icon: style.icon,
            color: style.color,
          };
        }),
      );

      isRefresh ? setIsRefreshing(false) : setIsLoading(false);
    },
    [session],
  );

  // Refetch every time Home regains focus, so adding a document or
  // reminder elsewhere in the app shows up here without a manual pull.
  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData]),
  );

  const displayName = fullName || session?.user.email || "there";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadHomeData(true)}
          />
        }
      >
        <LinearGradient colors={["#0f766e", "#0d9488"]} style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <ThemedText type="small" style={styles.greeting}>
                {getGreeting()}
              </ThemedText>
              <ThemedText type="title" style={styles.userName}>
                {displayName}
              </ThemedText>
            </View>

            <Pressable style={styles.bellButton}>
              <Ionicons
                name="notifications-outline"
                size={20}
                color="#ffffff"
              />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          <View style={styles.storageCard}>
            <ThemedText type="small" style={styles.storageLabel}>
              Documents Stored
            </ThemedText>
            <View style={styles.storageRow}>
              <ThemedText type="title" style={styles.storageCount}>
                {isLoading ? "..." : `${documentsCount} files`}
              </ThemedText>
              <ThemedText type="small" style={styles.storageSubtext}>
                across {FOLDERS_COUNT} folders
              </ThemedText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.bodyContent}>
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Recently Accessed
              </ThemedText>
              <Pressable>
                <ThemedText type="small" style={styles.sectionLink}>
                  All docs ›
                </ThemedText>
              </Pressable>
            </View>

            {!isLoading && recentDocuments.length === 0 && (
              <ThemedText type="small" style={styles.emptyText}>
                No documents yet
              </ThemedText>
            )}

            {recentDocuments.map((doc) => (
              <Pressable key={doc.id} style={styles.docRow}>
                <View
                  style={[styles.docIconBadge, { backgroundColor: doc.color }]}
                >
                  <Ionicons name={doc.icon} size={18} color="#ffffff" />
                </View>
                <View style={styles.docTextGroup}>
                  <ThemedText type="smallBold" style={styles.docTitle}>
                    {doc.title}
                  </ThemedText>
                  <ThemedText type="small" style={styles.docSubtitle}>
                    Opened {doc.openedOn}
                  </ThemedText>
                </View>
                <Ionicons name="folder-outline" size={18} color="#c4c8d1" />
              </Pressable>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Document Alerts
              </ThemedText>
              <Pressable>
                <ThemedText type="small" style={styles.sectionLink}>
                  See all ›
                </ThemedText>
              </Pressable>
            </View>

            {!isLoading && documentAlerts.length === 0 && (
              <ThemedText type="small" style={styles.emptyText}>
                No alerts right now
              </ThemedText>
            )}

            {documentAlerts.map((alert) => (
              <View key={alert.id} style={styles.alertRow}>
                <View
                  style={[
                    styles.alertBadge,
                    { backgroundColor: `${alert.color}1A` },
                  ]}
                >
                  <Ionicons name={alert.icon} size={16} color={alert.color} />
                </View>
                <View style={styles.alertTextGroup}>
                  <ThemedText
                    type="small"
                    style={[styles.alertDate, { color: alert.color }]}
                  >
                    {alert.date}
                  </ThemedText>
                  <ThemedText type="small" style={styles.alertText}>
                    {alert.text}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              Recent Activity
            </ThemedText>
            <ThemedText type="small" style={styles.emptyText}>
              No recent activity yet
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: Spacing.four,
    borderBottomRightRadius: Spacing.four,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: Spacing.two,
  },
  greeting: { color: "rgba(255,255,255,0.8)" },
  userName: { color: "#ffffff", fontSize: 24, lineHeight: 30, marginTop: 2 },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#facc15",
  },
  storageCard: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.four,
  },
  storageLabel: { color: "rgba(255,255,255,0.8)" },
  storageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: Spacing.one,
  },
  storageCount: { color: "#ffffff", fontSize: 22, lineHeight: 28 },
  storageSubtext: { color: "rgba(255,255,255,0.8)" },
  body: { flex: 1 },
  bodyContent: { padding: Spacing.four, gap: Spacing.four },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { color: "#1a1c20" },
  sectionLink: { color: "#0d9488", fontWeight: "600" },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  docIconBadge: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  docTextGroup: { flex: 1 },
  docTitle: { color: "#1a1c20" },
  docSubtitle: { color: "#8b8f99" },
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  alertBadge: {
    width: 32,
    height: 32,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTextGroup: { flex: 1, gap: 2 },
  alertDate: { fontWeight: "700" },
  alertText: { color: "#3a3f4b" },
  emptyText: { color: "#8b8f99" },
});
