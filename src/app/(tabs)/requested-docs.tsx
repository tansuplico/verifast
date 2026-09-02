import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddRequestModal } from "@/components/add-request-modal";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type RequestStatus = "requested" | "processing" | "ready" | "released";

type RequestRow = {
  id: string;
  document_type: string;
  office: string | null;
  status: RequestStatus;
  requested_date: string;
  released_date: string | null;
  notes: string | null;
};

const STATUS_STYLE: Record<RequestStatus, { label: string; color: string }> = {
  requested: { label: "Requested", color: "#3b82f6" },
  processing: { label: "Processing", color: "#f59e0b" },
  ready: { label: "Ready", color: "#10b981" },
  released: { label: "Released", color: "#8b8f99" },
};

// Tap-to-advance: each status's card shows a single button that moves it to
// the next step. `released` is terminal - no further button is shown.
const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  requested: "processing",
  processing: "ready",
  ready: "released",
  released: null,
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RequestedDocsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);

  const loadRequests = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      isRefresh ? setIsRefreshing(true) : setIsLoading(true);

      const { data } = await supabase
        .from("document_requests")
        .select(
          "id, document_type, office, status, requested_date, released_date, notes",
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      setRequests(data ?? []);
      isRefresh ? setIsRefreshing(false) : setIsLoading(false);
    },
    [session],
  );

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests]),
  );

  const handleAdvance = useCallback(
    (request: RequestRow) => {
      const nextStatus = NEXT_STATUS[request.status];
      if (!nextStatus) return;

      Alert.alert(
        `Mark as ${STATUS_STYLE[nextStatus].label}?`,
        `Update "${request.document_type}" to ${STATUS_STYLE[nextStatus].label}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async () => {
              const updates: Partial<RequestRow> = { status: nextStatus };
              if (nextStatus === "released") {
                updates.released_date = new Date().toISOString().slice(0, 10);
              }

              const { data, error } = await supabase
                .from("document_requests")
                .update(updates)
                .eq("id", request.id)
                .select();

              if (error) {
                Alert.alert("Couldn't update request", error.message);
                return;
              }
              if (!data || data.length === 0) {
                Alert.alert(
                  "Couldn't update request",
                  "The request wasn't updated — this usually means the update was blocked by a database permission (RLS) rule.",
                );
                return;
              }
              loadRequests();
            },
          },
        ],
      );
    },
    [loadRequests],
  );

  const handleDelete = useCallback(
    (request: RequestRow) => {
      Alert.alert(
        "Delete request",
        `Remove the tracked request for "${request.document_type}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const { data, error } = await supabase
                .from("document_requests")
                .delete()
                .eq("id", request.id)
                .select();
              if (error) {
                Alert.alert("Couldn't delete request", error.message);
                return;
              }
              if (!data || data.length === 0) {
                Alert.alert(
                  "Couldn't delete request",
                  "The request wasn't removed — this usually means the delete was blocked by a database permission (RLS) rule.",
                );
                return;
              }
              loadRequests();
            },
          },
        ],
      );
    },
    [loadRequests],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={20} color="#1a1c20" />
        </Pressable>
        <ThemedText type="smallBold" style={styles.headerTitle}>
          Requested Docs
        </ThemedText>
        <View style={styles.headerSpacer} />
        <View style={styles.receiptBadge}>
          <Ionicons name="receipt-outline" size={16} color="#0d9488" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.four,
          paddingBottom: BottomTabInset + Spacing.six,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadRequests(true)}
          />
        }
      >
        {!isLoading && requests.length === 0 && (
          <ThemedText type="small" style={styles.emptyText}>
            No document requests yet. Tap + to log one you've requested from a
            school office.
          </ThemedText>
        )}

        {requests.map((request) => {
          const statusStyle = STATUS_STYLE[request.status];
          const nextStatus = NEXT_STATUS[request.status];
          return (
            <View key={request.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardTextGroup}>
                  <ThemedText type="smallBold" style={styles.cardTitle}>
                    {request.document_type}
                  </ThemedText>
                  {request.office && (
                    <ThemedText type="small" style={styles.cardSubtext}>
                      {request.office}
                    </ThemedText>
                  )}
                </View>
                <Pressable hitSlop={8} onPress={() => handleDelete(request)}>
                  <Ionicons name="trash-outline" size={16} color="#c4c8d1" />
                </Pressable>
              </View>

              <View style={styles.cardMetaRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusStyle.color },
                  ]}
                >
                  <ThemedText type="small" style={styles.statusBadgeText}>
                    {statusStyle.label}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={styles.cardSubtext}>
                  {request.status === "released" && request.released_date
                    ? `Released ${formatDate(request.released_date)}`
                    : `Requested ${formatDate(request.requested_date)}`}
                </ThemedText>
              </View>

              {request.notes && (
                <ThemedText type="small" style={styles.cardNotes}>
                  {request.notes}
                </ThemedText>
              )}

              {nextStatus && (
                <Pressable
                  style={styles.advanceButton}
                  onPress={() => handleAdvance(request)}
                >
                  <ThemedText type="smallBold" style={styles.advanceButtonText}>
                    Mark as {STATUS_STYLE[nextStatus].label}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setIsAddModalVisible(true)}>
        <Ionicons name="add" size={26} color="#ffffff" />
      </Pressable>

      <AddRequestModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        userId={session?.user.id}
        onCreated={() => loadRequests()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#1a1c20", fontSize: 16, marginLeft: Spacing.three },
  headerSpacer: { flex: 1 },
  receiptBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: "#8b8f99", textAlign: "center", marginTop: Spacing.six },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTextGroup: { flex: 1, gap: 2 },
  cardTitle: { color: "#1a1c20" },
  cardSubtext: { color: "#8b8f99" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  statusBadge: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  statusBadgeText: { color: "#ffffff", fontWeight: "600" },
  cardNotes: { color: "#60646C" },
  advanceButton: {
    backgroundColor: "#f0f0f3",
    borderRadius: Spacing.two + 2,
    paddingVertical: Spacing.two,
    alignItems: "center",
    marginTop: Spacing.one,
  },
  advanceButtonText: { color: "#0d9488" },
  fab: {
    position: "absolute",
    right: Spacing.four,
    bottom: BottomTabInset + Spacing.three,
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
