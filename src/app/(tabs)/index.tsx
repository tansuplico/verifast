import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { LoadErrorState } from "@/components/load-error-state";
import { OfflineNotice } from "@/components/offline-notice";
import { ThemedText } from "@/components/themed-text";
import {
  CATEGORY_STYLE,
  ReminderCategory,
} from "@/constants/reminder-categories";
import {
  iconForRequestType,
  REQUEST_COLORS,
  RequestStatus,
  STATUS_STYLE,
} from "@/constants/request-status";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useIsOnline } from "@/hooks/use-network-status";
import {
  getCachedDocumentSummary,
  getCachedProfile,
  getCachedRequests,
  getUpcomingReminders,
} from "@/lib/offline-db";
import { subscribeToSync, syncAll } from "@/lib/sync";
import { useAuth } from "@/providers/auth-provider";
import { SafeAreaView } from "react-native-safe-area-context";

// The "folders" table is always exactly 4 fixed categories per user,
// auto-seeded by the on_auth_user_created trigger (see the schema
// migration) - so this is a fixed constant, not data that needs fetching.
const FOLDERS_COUNT = 4;

const CLOCK_SKEW_RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

type RequestPreview = {
  id: string;
  title: string;
  office: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  badgeColor: string;
  statusLabel: string;
  statusColor: string;
  statusBackground: string;
  statusIcon: keyof typeof Ionicons.glyphMap;
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

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const isOnline = useIsOnline();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fullName, setFullName] = useState<string | null>(null);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [documentAlerts, setDocumentAlerts] = useState<DocumentAlert[]>([]);
  const [requestPreviews, setRequestPreviews] = useState<RequestPreview[]>([]);
  const [loadError, setLoadError] = useState(false);

  // Everything on Home is built from the on-device copies (documents,
  // reminders, requests, profile), so it looks the same with or without a
  // connection. Syncing with Supabase happens around it (see sync.ts).
  // Returns whether anything was found, for the empty-vs-error decision.
  const applyLocalData = useCallback(() => {
    if (!session) return false;
    const userId = session.user.id;

    const profile = getCachedProfile(userId);
    const documents = getCachedDocumentSummary(userId);
    const reminders = getUpcomingReminders(userId, 3);
    const requests = getCachedRequests(userId).slice(0, 3);

    setFullName(profile?.full_name ?? null);
    setDocumentsCount(documents.count);

    setRecentDocuments(
      documents.recent.map((doc, index) => ({
        id: doc.id,
        title: doc.name,
        openedOn: formatShortDate(doc.opened_at),
        icon: iconForMimeType(doc.mime_type),
        color: DOC_COLORS[index % DOC_COLORS.length],
      })),
    );

    setDocumentAlerts(
      reminders.map((reminder) => {
        const style = CATEGORY_STYLE[reminder.category as ReminderCategory];
        return {
          id: reminder.id,
          date: formatShortDate(reminder.due_date),
          text: reminder.title,
          icon: style.icon,
          color: style.color,
        };
      }),
    );

    setRequestPreviews(
      requests.map((request, index) => {
        const statusStyle = STATUS_STYLE[request.status as RequestStatus];
        return {
          id: request.id,
          title: request.document_type,
          office: request.office,
          icon: iconForRequestType(request.document_type),
          badgeColor: REQUEST_COLORS[index % REQUEST_COLORS.length],
          statusLabel: statusStyle.label,
          statusColor: statusStyle.color,
          statusBackground: statusStyle.background,
          statusIcon: statusStyle.icon,
        };
      }),
    );

    return (
      profile !== null ||
      documents.count > 0 ||
      reminders.length > 0 ||
      requests.length > 0
    );
  }, [session]);

  const loadHomeData = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      const userId = session.user.id;

      // Show what's on the device right away. The "..." placeholders only
      // appear when there is nothing local yet (first ever load).
      const hadLocalData = applyLocalData();
      if (hadLocalData) setIsLoading(false);
      if (isRefresh) setIsRefreshing(true);

      if (!isOnline) {
        setLoadError(false);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      let result = await syncAll(userId, { force: isRefresh });
      let ok =
        result.accountOk &&
        result.academicInfoOk &&
        result.requestsOk &&
        result.remindersOk;

      // A just-issued token's `iat` is the exact sign-in instant, which is
      // precisely when a few seconds of clock skew between Supabase's Auth
      // and PostgREST services is most likely to make a fresh token look
      // "issued in the future" (PGRST303). If the very first load after
      // signing in comes back empty-handed, one retry after a short delay
      // gives the token a couple seconds of age, which reliably clears it -
      // this is project-side timing, not a problem with the query itself.
      if (!ok && !hadLocalData) {
        await sleep(CLOCK_SKEW_RETRY_DELAY_MS);
        result = await syncAll(userId, { force: true });
        ok =
          result.accountOk &&
          result.academicInfoOk &&
          result.requestsOk &&
          result.remindersOk;
      }

      const hasData = applyLocalData();
      // Only a failed sync with nothing on the device is worth an error
      // banner; otherwise what's local is still perfectly usable.
      setLoadError(!ok && !hasData);
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [session, isOnline, applyLocalData],
  );

  // Refetch every time Home regains focus, so adding a document or
  // reminder elsewhere in the app shows up here without a manual pull.
  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData]),
  );

  // A background sync (reconnect, app foreground, a change's own push) can
  // change any of these lists, so re-read them whenever one finishes.
  useEffect(
    () => subscribeToSync(() => void applyLocalData()),
    [applyLocalData],
  );

  const displayName =
    fullName || (isLoading ? "..." : session?.user.email || "there");

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
          </View>

          <View style={styles.storageCard}>
            <ThemedText type="small" style={styles.storageLabel}>
              Documents Stored
            </ThemedText>
            <View style={styles.storageRow}>
              <ThemedText type="title" style={styles.storageCount}>
                {isLoading && documentsCount === 0
                  ? "..."
                  : `${documentsCount} files`}
              </ThemedText>
              <ThemedText type="small" style={styles.storageSubtext}>
                across {FOLDERS_COUNT} folders
              </ThemedText>
            </View>
          </View>
        </LinearGradient>

        {!isOnline && <OfflineNotice />}

        {loadError && <LoadErrorState onRetry={() => loadHomeData()} />}

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

            {!isLoading && !loadError && recentDocuments.length === 0 && (
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
                Deadlines and Reminders
              </ThemedText>
              <Pressable onPress={() => router.push("/deadlines-reminders")}>
                <ThemedText type="small" style={styles.sectionLink}>
                  See all ›
                </ThemedText>
              </Pressable>
            </View>

            {!isLoading && !loadError && documentAlerts.length === 0 && (
              <ThemedText type="small" style={styles.emptyText}>
                No alerts right now
              </ThemedText>
            )}

            {documentAlerts.map((alert) => (
              <View key={alert.id} style={styles.alertRow}>
                <View
                  style={[
                    styles.docIconBadge,
                    { backgroundColor: alert.color },
                  ]}
                >
                  <Ionicons name={alert.icon} size={18} color="#ffffff" />
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
            <View style={styles.sectionHeaderRow}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Requested Docs
              </ThemedText>
              <Pressable onPress={() => router.push("/requested-docs")}>
                <ThemedText type="small" style={styles.sectionLink}>
                  See all ›
                </ThemedText>
              </Pressable>
            </View>

            {!isLoading && !loadError && requestPreviews.length === 0 && (
              <ThemedText type="small" style={styles.emptyText}>
                No document requests yet
              </ThemedText>
            )}

            {requestPreviews.map((request) => (
              <Pressable
                key={request.id}
                style={styles.docRow}
                onPress={() => router.push("/requested-docs")}
              >
                <View
                  style={[
                    styles.docIconBadge,
                    { backgroundColor: request.badgeColor },
                  ]}
                >
                  <Ionicons name={request.icon} size={18} color="#ffffff" />
                </View>
                <View style={styles.docTextGroup}>
                  <ThemedText
                    type="smallBold"
                    style={styles.docTitle}
                    numberOfLines={1}
                  >
                    {request.title}
                  </ThemedText>
                  {request.office && (
                    <ThemedText type="small" style={styles.docSubtitle}>
                      {request.office}
                    </ThemedText>
                  )}
                </View>
                <View
                  style={[
                    styles.requestStatusPill,
                    { backgroundColor: request.statusBackground },
                  ]}
                >
                  <Ionicons
                    name={request.statusIcon}
                    size={11}
                    color={request.statusColor}
                  />
                  <ThemedText
                    type="small"
                    style={[
                      styles.requestStatusPillText,
                      { color: request.statusColor },
                    ]}
                  >
                    {request.statusLabel}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
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
    paddingTop: Spacing.four,
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
  alertDate: { fontWeight: "900" },
  alertText: { color: "#3a3f4b" },
  requestStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  requestStatusPillText: { fontWeight: "600", fontSize: 12 },
  emptyText: { color: "#8b8f99" },
});
