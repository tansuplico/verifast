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
import { LoadErrorState } from "@/components/load-error-state";
import { RequestActionsMenu } from "@/components/request-actions-menu";
import { SkeletonBlock } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import {
  iconForRequestType,
  NEXT_STATUS,
  REQUEST_COLORS,
  RequestStatus,
  STATUS_STYLE,
} from "@/constants/request-status";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type RequestRow = {
  id: string;
  document_type: string;
  office: string | null;
  status: RequestStatus;
  requested_date: string;
  released_date: string | null;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RequestSkeletonRow({ isLast }: { isLast: boolean }) {
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <SkeletonBlock width={44} height={44} radius={Spacing.two + 2} />
      <View style={styles.rowTextGroup}>
        <SkeletonBlock width="55%" height={14} radius={4} />
        <SkeletonBlock
          width="40%"
          height={11}
          radius={4}
          style={{ marginTop: 6 }}
        />
        <SkeletonBlock
          width="30%"
          height={11}
          radius={4}
          style={{ marginTop: 4 }}
        />
      </View>
    </View>
  );
}

export default function RequestedDocsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [actionsRequest, setActionsRequest] = useState<RequestRow | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadRequests = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      isRefresh ? setIsRefreshing(true) : setIsLoading(true);

      const { data, error } = await supabase
        .from("document_requests")
        .select(
          "id, document_type, office, status, requested_date, released_date",
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load document requests", error);
        setLoadError(true);
      } else {
        setLoadError(false);
        setRequests(data ?? []);
      }

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

  const readyCount = requests.filter((r) => r.status === "ready").length;
  const actionsNextStatus = actionsRequest
    ? NEXT_STATUS[actionsRequest.status]
    : null;

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
          Document Requests
        </ThemedText>
        <View style={styles.headerSpacer} />
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
        {readyCount > 0 && (
          <View style={styles.readyBanner}>
            <Ionicons name="cube-outline" size={16} color="#059669" />
            <ThemedText type="small" style={styles.readyBannerText}>
              {readyCount} document{readyCount > 1 ? "s are" : " is"} ready for
              pickup.
            </ThemedText>
          </View>
        )}

        <ThemedText type="small" style={styles.sectionLabel}>
          ALL REQUESTS
        </ThemedText>

        {isLoading && (
          <View style={styles.listCard}>
            {Array.from({ length: 4 }).map((_, i) => (
              <RequestSkeletonRow key={`req-skeleton-${i}`} isLast={i === 3} />
            ))}
          </View>
        )}

        {!isLoading &&
          requests.length === 0 &&
          (loadError ? (
            <LoadErrorState onRetry={() => loadRequests()} />
          ) : (
            <ThemedText type="small" style={styles.emptyText}>
              No document requests yet. Tap the button below to log one you've
              requested from a school office.
            </ThemedText>
          ))}

        {requests.length > 0 && (
          <View style={styles.listCard}>
            {requests.map((request, index) => {
              const statusStyle = STATUS_STYLE[request.status];
              const badgeColor = REQUEST_COLORS[index % REQUEST_COLORS.length];
              return (
                <Pressable
                  key={request.id}
                  style={[
                    styles.row,
                    index < requests.length - 1 && styles.rowDivider,
                  ]}
                  onPress={() => setActionsRequest(request)}
                >
                  <View
                    style={[styles.iconBadge, { backgroundColor: badgeColor }]}
                  >
                    <Ionicons
                      name={iconForRequestType(request.document_type)}
                      size={20}
                      color="#ffffff"
                    />
                  </View>

                  <View style={styles.rowTextGroup}>
                    <ThemedText
                      type="smallBold"
                      style={styles.rowTitle}
                      numberOfLines={2}
                    >
                      {request.document_type}
                    </ThemedText>
                    {request.office && (
                      <ThemedText type="small" style={styles.rowSubtext}>
                        {request.office}
                      </ThemedText>
                    )}
                    <ThemedText type="small" style={styles.rowSubtext}>
                      {request.status === "released" && request.released_date
                        ? formatDate(request.released_date)
                        : formatDate(request.requested_date)}
                    </ThemedText>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusStyle.background },
                    ]}
                  >
                    <Ionicons
                      name={statusStyle.icon}
                      size={12}
                      color={statusStyle.color}
                    />
                    <ThemedText
                      type="small"
                      style={[
                        styles.statusPillText,
                        { color: statusStyle.color },
                      ]}
                    >
                      {statusStyle.label}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={styles.newRequestButton}
          onPress={() => setIsAddModalVisible(true)}
        >
          <ThemedText type="smallBold" style={styles.newRequestButtonText}>
            Request New Document
          </ThemedText>
        </Pressable>
      </ScrollView>

      <AddRequestModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        userId={session?.user.id}
        onCreated={() => loadRequests()}
      />

      <RequestActionsMenu
        visible={!!actionsRequest}
        title={actionsRequest?.document_type ?? ""}
        nextStatusLabel={
          actionsNextStatus ? STATUS_STYLE[actionsNextStatus].label : null
        }
        onClose={() => setActionsRequest(null)}
        onAdvance={() => {
          if (actionsRequest) handleAdvance(actionsRequest);
        }}
        onDelete={() => {
          if (actionsRequest) handleDelete(actionsRequest);
        }}
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
  readyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#e3f9ee",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    marginBottom: Spacing.four,
  },
  readyBannerText: { color: "#059669", flex: 1 },
  sectionLabel: {
    color: "#8b8f99",
    letterSpacing: 0.5,
    marginBottom: Spacing.two,
  },
  emptyText: { color: "#8b8f99", textAlign: "center", marginTop: Spacing.six },
  listCard: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    marginBottom: Spacing.four,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextGroup: { flex: 1, gap: 2 },
  rowTitle: { color: "#1a1c20" },
  rowSubtext: { color: "#8b8f99" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    marginTop: 2,
  },
  statusPillText: { fontWeight: "600" },
  newRequestButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.two + 2,
    paddingVertical: Spacing.three + 2,
    alignItems: "center",
  },
  newRequestButtonText: { color: "#ffffff", fontSize: 15 },
});
