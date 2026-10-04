import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddDocumentModal } from "@/components/add-document-modal";
import { DocumentActionsMenu } from "@/components/document-actions-menu";
import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { hasProAccess } from "@/lib/subscription";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/providers/alert-provider";
import { useAuth } from "@/providers/auth-provider";

import { LoadErrorState } from "@/components/load-error-state";
import { SkeletonBlock } from "@/components/skeleton";
import { useIsOnline } from "@/hooks/use-network-status";
import {
  cacheSubscription,
  deleteDocumentLocal,
  getCachedDocuments,
  getCachedFolders,
  getCachedSubscription,
} from "@/lib/offline-db";
import {
  cacheDocumentFileForOffline,
  getOfflineFileUri,
  removeOfflineFile,
} from "@/lib/offline-files";
import { requestSync, subscribeToSync, syncDocuments } from "@/lib/sync";
import { useToast } from "@/providers/toast-provider";
import type { DocumentRow } from "@/types/documents";

type FolderCategory = "academic" | "financial" | "identification" | "forms";

type FolderRow = {
  id: string;
  category: FolderCategory;
  name: string;
};

const CATEGORY_ORDER: FolderCategory[] = [
  "academic",
  "financial",
  "identification",
  "forms",
];

const FREE_DOCUMENT_LIMIT = 15;

type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

const FOLDER_STYLE: Record<
  FolderCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  academic: { icon: "school", color: "#8b5cf6" },
  financial: { icon: "card", color: "#10b981" },
  identification: { icon: "finger-print", color: "#3b82f6" },
  forms: { icon: "document-text", color: "#FF0800" },
};

const DOC_COLORS = ["#10b1a3", "#0BDA51", "#3b82f6", "#FF0800"];

function iconForMimeType(
  mimeType: string | null,
): keyof typeof Ionicons.glyphMap {
  if (!mimeType) return "document-outline";
  if (mimeType.startsWith("image/")) return "image-outline";
  if (mimeType === "application/pdf") return "document-text-outline";
  return "document-outline";
}

function formatBadge(mimeType: string | null): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "image/jpeg":
      return "JPG";
    case "image/png":
      return "PNG";
    case "image/heic":
      return "HEIC";
    default:
      return "FILE";
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function DocumentSkeletonRow() {
  return (
    <View style={styles.fileRow}>
      <SkeletonBlock width={40} height={40} radius={Spacing.two} />
      <View style={styles.fileTextGroup}>
        <SkeletonBlock width="60%" height={14} radius={4} />
        <SkeletonBlock
          width="35%"
          height={11}
          radius={4}
          style={{ marginTop: 6 }}
        />
      </View>
      <SkeletonBlock width={40} height={20} radius={Spacing.two} />
    </View>
  );
}

export default function DocumentsScreen() {
  const { session } = useAuth();
  const { showSavedToast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [actionsDoc, setActionsDoc] = useState<DocumentRow | null>(null);
  const [loadError, setLoadError] = useState(false);
  const isOnline = useIsOnline();
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus | null>(null);
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState<
    string | null
  >(null);

  // Local-first: the list always comes from the on-device database, so it
  // looks and behaves the same with or without a connection. Syncing with
  // Supabase happens around it (see sync.ts), never in front of it.
  const reloadFromLocal = useCallback(() => {
    if (!session) return;
    const userId = session.user.id;
    setFolders(getCachedFolders(userId) as FolderRow[]);
    setDocuments(getCachedDocuments(userId));
    // The Free-plan limit needs the plan; the on-device copy of it keeps
    // Pro accounts from being treated as Free while offline.
    const cachedSubscription = getCachedSubscription(userId);
    setSubscriptionStatus(cachedSubscription?.status ?? null);
    setSubscriptionPeriodEnd(cachedSubscription?.current_period_end ?? null);
  }, [session]);

  // `refresh` is pull-to-refresh (shows the spinner); `force` skips the
  // short sync cooldown, for when something just changed on the server
  // side of things (a finished upload) and has to be pulled right away.
  const loadDocuments = useCallback(
    async (options: { refresh?: boolean; force?: boolean } = {}) => {
      if (!session) return;
      const userId = session.user.id;
      const refresh = options.refresh ?? false;

      // Show what's on the device right away. Skeletons only appear when
      // there is nothing local yet (first ever load while online).
      reloadFromLocal();
      const hadLocalData =
        getCachedDocuments(userId).length > 0 ||
        getCachedFolders(userId).length > 0;
      if (hadLocalData) setIsLoading(false);
      if (refresh) setIsRefreshing(true);

      if (!isOnline) {
        setLoadError(false);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      // The plan is fetched live (not just from the synced copy) so an
      // upgrade is reflected the moment this screen is opened.
      const [syncResult, subscriptionResult] = await Promise.all([
        syncDocuments(userId, refresh || options.force === true),
        supabase
          .from("subscriptions")
          .select("status, trial_ends_at, current_period_end")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (!subscriptionResult.error) {
        cacheSubscription(userId, subscriptionResult.data);
      }
      reloadFromLocal();

      // Only a failed sync with nothing on the device is worth an error
      // screen; otherwise the local list is still perfectly usable.
      setLoadError(
        !syncResult.ok &&
          getCachedDocuments(userId).length === 0 &&
          getCachedFolders(userId).length === 0,
      );
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [session, isOnline, reloadFromLocal],
  );

  const handleDocPress = useCallback(
    async (doc: DocumentRow) => {
      if (!doc.file_path) return;

      // Online path first (freshest signed URL), same as before - skipped
      // entirely when we already know we're offline, so there's no pointless
      // wait for a request that can't succeed.
      // A document that is still waiting to upload has nothing in storage to
      // sign a URL for - it opens from its local copy below.
      if (isOnline && doc.sync_status !== "pending_create") {
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.file_path, 60);

        if (!error && data?.signedUrl) {
          if (doc.mime_type?.startsWith("image/")) {
            setPreviewDoc(doc);
            setPreviewImageUrl(data.signedUrl);
          } else {
            Linking.openURL(data.signedUrl);
          }
          // Fire-and-forget: save a local copy so this document opens
          // offline next time. Doesn't block or affect the view that just
          // happened either way.
          const fileName = doc.file_path.split("/").pop() ?? doc.name;
          cacheDocumentFileForOffline(doc.id, data.signedUrl, fileName);
          return;
        }
      }

      // Offline, or the online attempt failed - fall back to a local copy
      // from an earlier view, if one exists.
      const localUri = getOfflineFileUri(doc.id);
      if (!localUri) {
        showAlert(
          "Not available offline",
          "Open this document once while online to make it available offline.",
          undefined,
          { tone: "danger" },
        );
        return;
      }

      if (doc.mime_type?.startsWith("image/")) {
        setPreviewDoc(doc);
        setPreviewImageUrl(localUri);
        return;
      }

      // Local file:// URIs can't go through Linking.openURL on Android
      // (rejected as "exposed beyond app through Intent.getData()" without a
      // FileProvider) - Sharing already handles that correctly and is the
      // same mechanism backup-recovery.tsx uses for its exported files, so
      // this reuses a path already proven to work in this app.
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showAlert(
          "Can't open file",
          "Sharing isn't available on this device.",
          undefined,
          { tone: "danger" },
        );
        return;
      }
      await Sharing.shareAsync(localUri, {
        mimeType: doc.mime_type ?? undefined,
        dialogTitle: doc.name,
      });
    },
    [isOnline],
  );

  const handleDeleteDocument = useCallback(
    (doc: DocumentRow) => {
      if (!session) return;
      const userId = session.user.id;

      showAlert(
        "Delete document",
        `Are you sure you want to delete "${doc.name}"? This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              // Deleted on the device first; sync removes the stored file
              // and the row from Supabase when a connection is available.
              try {
                deleteDocumentLocal(userId, doc.id);
                removeOfflineFile(doc.id);
              } catch (error) {
                console.error("Failed to delete document locally", error);
                showAlert(
                  "Couldn't delete document",
                  "Something went wrong deleting this document.",
                  undefined,
                  { tone: "danger" },
                );
                return;
              }
              requestSync(userId);
              showSavedToast("Document deleted");
              reloadFromLocal();
            },
          },
        ],
        { icon: "trash-outline" },
      );
    },
    [session, reloadFromLocal, showSavedToast],
  );

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments]),
  );

  // A background sync (reconnect, app foreground, a change's own push) can
  // clear "waiting to sync" badges or pull in changes from another device.
  useEffect(() => subscribeToSync(reloadFromLocal), [reloadFromLocal]);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? null,
    [folders, activeFolderId],
  );

  const orderedFolders = useMemo(
    () =>
      CATEGORY_ORDER.map((category) =>
        folders.find((folder) => folder.category === category),
      ).filter((folder): folder is FolderRow => !!folder),
    [folders],
  );

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      counts.set(doc.folder_id, (counts.get(doc.folder_id) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      if (activeFolderId && doc.folder_id !== activeFolderId) return false;
      if (query && !doc.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [documents, searchQuery, activeFolderId]);

  const isPro = hasProAccess(subscriptionStatus, subscriptionPeriodEnd);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerRow}>
        <View>
          <ThemedText type="title" style={styles.pageTitle}>
            My Documents
          </ThemedText>
          <ThemedText type="small" style={styles.subtitle}>
            {isLoading ? "..." : `${documents.length} files stored`}
          </ThemedText>
        </View>

        <View style={styles.viewToggle}>
          <Pressable
            style={[
              styles.viewToggleButton,
              viewMode === "list" && styles.viewToggleActive,
            ]}
            onPress={() => setViewMode("list")}
          >
            <Ionicons
              name="list"
              size={18}
              color={viewMode === "list" ? "#0d9488" : "#8b8f99"}
            />
          </Pressable>
          <Pressable
            style={[
              styles.viewToggleButton,
              viewMode === "grid" && styles.viewToggleActive,
            ]}
            onPress={() => setViewMode("grid")}
          >
            <Ionicons
              name="grid-outline"
              size={18}
              color={viewMode === "grid" ? "#0d9488" : "#8b8f99"}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8b8f99" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search documents..."
          placeholderTextColor="#8b8f99"
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.six }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadDocuments({ refresh: true })}
          />
        }
      >
        <View style={styles.sectionHeaderRow}>
          <ThemedText type="small" style={styles.sectionLabel}>
            FOLDERS
          </ThemedText>
          <Pressable
            style={styles.requestedDocsLink}
            onPress={() => router.push("/requested-docs")}
          >
            <Ionicons name="receipt-outline" size={14} color="#0d9488" />
            <ThemedText type="small" style={styles.requestedDocsText}>
              Requested Docs
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.folderGrid}>
          {orderedFolders.map((folder) => {
            const style = FOLDER_STYLE[folder.category];
            const count = folderCounts.get(folder.id) ?? 0;
            const isActive = activeFolderId === folder.id;
            return (
              <Pressable
                key={folder.id}
                style={[styles.folderCard, isActive && styles.folderCardActive]}
                onPress={() =>
                  setActiveFolderId((current) =>
                    current === folder.id ? null : folder.id,
                  )
                }
              >
                <View
                  style={[
                    styles.folderIconBadge,
                    { backgroundColor: style.color },
                  ]}
                >
                  <Ionicons name={style.icon} size={18} color="#ffffff" />
                </View>
                <View>
                  <ThemedText type="smallBold" style={styles.folderName}>
                    {folder.name}
                  </ThemedText>
                  <ThemedText type="small" style={styles.folderCount}>
                    {count} {count === 1 ? "file" : "files"}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <ThemedText
          type="small"
          style={[styles.sectionLabel, styles.allFilesLabel]}
        >
          ALL FILES
        </ThemedText>

        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <DocumentSkeletonRow key={`doc-skeleton-${i}`} />
          ))}

        {!isLoading &&
          filteredDocuments.length === 0 &&
          (loadError ? (
            <LoadErrorState onRetry={() => loadDocuments()} />
          ) : (
            <ThemedText type="small" style={styles.emptyText}>
              {searchQuery
                ? "No documents match your search"
                : activeFolder
                  ? `No documents in ${activeFolder.name} yet`
                  : "No documents yet"}
            </ThemedText>
          ))}

        {viewMode === "list" &&
          filteredDocuments.map((doc, index) => (
            <Pressable
              key={doc.id}
              style={styles.fileRow}
              onPress={() => handleDocPress(doc)}
            >
              <View
                style={[
                  styles.fileIconBadge,
                  {
                    backgroundColor:
                      doc.icon_color ?? DOC_COLORS[index % DOC_COLORS.length],
                  },
                ]}
              >
                <Ionicons
                  name={iconForMimeType(doc.mime_type)}
                  size={18}
                  color="#ffffff"
                />
              </View>
              <View style={styles.fileTextGroup}>
                <ThemedText type="smallBold" style={styles.fileName}>
                  {doc.name}
                </ThemedText>
                <ThemedText type="small" style={styles.fileSubtext}>
                  {formatFileSize(doc.file_size)}
                  {doc.file_size ? " · " : ""}
                  {formatShortDate(doc.created_at)}
                </ThemedText>
              </View>
              {doc.sync_status && doc.sync_status !== "synced" && (
                <Ionicons
                  name={
                    doc.sync_error ? "alert-circle" : "cloud-upload-outline"
                  }
                  size={14}
                  color={doc.sync_error ? "#ef4444" : "#a5a9b1"}
                  accessibilityLabel={
                    doc.sync_error ? "Upload failed" : "Waiting to sync"
                  }
                />
              )}
              <View style={styles.formatBadge}>
                <ThemedText type="small" style={styles.formatBadgeText}>
                  {formatBadge(doc.mime_type)}
                </ThemedText>
              </View>
              <Pressable hitSlop={8} onPress={() => setActionsDoc(doc)}>
                <Ionicons name="ellipsis-vertical" size={16} color="#c4c8d1" />
              </Pressable>
            </Pressable>
          ))}

        {viewMode === "grid" && (
          <View style={styles.fileGrid}>
            {filteredDocuments.map((doc, index) => (
              <Pressable
                key={doc.id}
                style={styles.fileGridCard}
                onPress={() => handleDocPress(doc)}
              >
                <View style={styles.fileGridTopRow}>
                  <View
                    style={[
                      styles.fileGridIconBadge,
                      {
                        backgroundColor:
                          doc.icon_color ??
                          DOC_COLORS[index % DOC_COLORS.length],
                      },
                    ]}
                  >
                    <Ionicons
                      name={iconForMimeType(doc.mime_type)}
                      size={22}
                      color="#ffffff"
                    />
                  </View>
                  <Pressable hitSlop={8} onPress={() => setActionsDoc(doc)}>
                    <Ionicons
                      name="ellipsis-vertical"
                      size={16}
                      color="#c4c8d1"
                    />
                  </Pressable>
                </View>

                <ThemedText
                  type="smallBold"
                  style={styles.fileGridName}
                  numberOfLines={1}
                >
                  {doc.name}
                </ThemedText>
                <View style={styles.fileGridMetaRow}>
                  <View style={styles.formatBadge}>
                    <ThemedText type="small" style={styles.formatBadgeText}>
                      {formatBadge(doc.mime_type)}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" style={styles.fileSubtext}>
                    {formatFileSize(doc.file_size)}
                  </ThemedText>
                  {doc.sync_status && doc.sync_status !== "synced" && (
                    <Ionicons
                      name={
                        doc.sync_error ? "alert-circle" : "cloud-upload-outline"
                      }
                      size={12}
                      color={doc.sync_error ? "#ef4444" : "#a5a9b1"}
                      accessibilityLabel={
                        doc.sync_error ? "Upload failed" : "Waiting to sync"
                      }
                    />
                  )}
                </View>
              </Pressable>
            ))}
            {/* The cards grow (flexGrow) to fill their row, so a lone last
                card - the only one in the folder, or the odd one out -
                would stretch to full width. An invisible spacer takes the
                empty half so it stays the same width as every other card. */}
            {filteredDocuments.length % 2 === 1 && (
              <View style={styles.fileGridSpacer} pointerEvents="none" />
            )}
          </View>
        )}
      </ScrollView>

      <Pressable
        style={styles.fab}
        onPress={() => {
          if (!isPro && documents.length >= FREE_DOCUMENT_LIMIT) {
            showAlert(
              "Document limit reached",
              `Free accounts can store up to ${FREE_DOCUMENT_LIMIT} documents. Upgrade to VeriFast Pro for unlimited storage.`,
              [
                { text: "Not Now", style: "cancel" },
                {
                  text: "Upgrade",
                  onPress: () => router.push("/subscription"),
                },
              ],
              { tone: "info", icon: "sparkles-outline" },
            );
            return;
          }
          setIsAddModalVisible(true);
        }}
      >
        <Ionicons name="add" size={26} color="#ffffff" />
      </Pressable>

      <AddDocumentModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        folders={folders}
        userId={session?.user.id}
        onUploaded={reloadFromLocal}
      />

      <DocumentPreviewModal
        visible={!!previewDoc}
        imageUrl={previewImageUrl}
        documentName={previewDoc?.name ?? ""}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewImageUrl(null);
        }}
      />

      <DocumentActionsMenu
        visible={!!actionsDoc}
        document={actionsDoc}
        folders={folders}
        onClose={() => setActionsDoc(null)}
        onRenamed={reloadFromLocal}
        onMoved={reloadFromLocal}
        onColorChanged={reloadFromLocal}
        onRetried={reloadFromLocal}
        onDeleteRequested={handleDeleteDocument}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  pageTitle: { fontSize: 26, lineHeight: 32, color: "#1a1c20" },
  subtitle: { color: "#8b8f99", marginTop: 2 },
  viewToggle: { flexDirection: "row", gap: Spacing.one },
  viewToggleButton: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleActive: { backgroundColor: "#e6f6f4" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1a1c20" },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.four,
  },
  sectionLabel: { color: "#8b8f99", letterSpacing: 0.5 },
  allFilesLabel: { paddingHorizontal: Spacing.four, marginTop: Spacing.four },
  requestedDocsLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  requestedDocsText: { color: "#0d9488", fontWeight: "600" },
  folderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  folderCard: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  folderCardActive: {
    borderWidth: 1.5,
    borderColor: "#0d9488",
    backgroundColor: "#e6f6f4",
  },
  folderIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  folderName: { color: "#1a1c20" },
  folderCount: { color: "#8b8f99" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  fileIconBadge: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  fileTextGroup: { flex: 1, gap: 2 },
  fileName: { color: "#1a1c20" },
  fileSubtext: { color: "#8b8f99" },
  fileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  fileGridCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  fileGridSpacer: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  fileGridIconBadge: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  fileGridTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  fileGridName: { color: "#1a1c20" },
  fileGridMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formatBadge: {
    backgroundColor: "#f0f0f3",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  formatBadgeText: { color: "#60646C", fontWeight: "600" },
  emptyText: {
    color: "#8b8f99",
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
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
