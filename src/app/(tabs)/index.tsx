import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { SafeAreaView } from "react-native-safe-area-context";

// TODO: replace with real data once Supabase is wired up
const USER_NAME = "User";
const DOCUMENTS_STORED = 7;
const FOLDERS_COUNT = 4;

const RECENT_DOCUMENTS = [
  {
    id: "1",
    title: "PSA Birth Certificate",
    openedOn: "Aug 27",
    icon: "document-text-outline",
    color: "#10b1a3",
  },
  {
    id: "2",
    title: "Medical Certificate",
    openedOn: "Aug 26",
    icon: "medkit-outline",
    color: "#FF0800",
  },
  {
    id: "3",
    title: "Payment Receipt",
    openedOn: "Aug 25",
    icon: "receipt-outline",
    color: "#0BDA51",
  },
] as const;

const DOCUMENT_ALERTS = [
  {
    id: "1",
    date: "Sep 26",
    text: "Medical Certificate expires in 30 days",
    icon: "alert-circle-outline",
    color: "#dc2626",
  },
  {
    id: "2",
    date: "Sep 3",
    text: "Good Moral Certificate due for submission",
    icon: "time-outline",
    color: "#d97706",
  },
  {
    id: "3",
    date: "Sep 10",
    text: "School ID Photo renewal recommended",
    icon: "refresh-outline",
    color: "#0891b2",
  },
] as const;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={["#0f766e", "#0d9488"]} style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <ThemedText type="small" style={styles.greeting}>
                {getGreeting()}
              </ThemedText>
              <ThemedText type="title" style={styles.userName}>
                {USER_NAME}
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
                {DOCUMENTS_STORED} files
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

            {RECENT_DOCUMENTS.map((doc) => (
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

            {DOCUMENT_ALERTS.map((alert) => (
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
