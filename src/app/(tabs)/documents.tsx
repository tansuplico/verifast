import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddDocumentModal } from "@/components/add-document-modal";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type FolderCategory = "academic" | "financial" | "identification" | "forms";

type FolderRow = {
  id: string;
  category: FolderCategory;
  name: string;
};

type DocumentRow = {
  id: string;
  folder_id: string;
  name: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  isDummy?: boolean;
};

const CATEGORY_ORDER: FolderCategory[] = [
  "academic",
  "financial",
  "identification",
  "forms",
];

const FOLDER_STYLE: Record<
  FolderCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  academic: { icon: "school", color: "#8b5cf6" },
  financial: { icon: "card", color: "#10b981" },
  identification: { icon: "finger-print", color: "#3b82f6" },
  forms: { icon: "document-text", color: "#8b5cf6" },
};

const DOC_COLORS = ["#10b1a3", "#0BDA51", "#3b82f6", "#8b5cf6"];

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

const DUMMY_DOCUMENTS: DocumentRow[] = [
  {
    id: "dummy-1",
    folder_id: "",
    name: "Sample Certificate.pdf",
    mime_type: "application/pdf",
    file_size: 850_000,
    created_at: new Date().toISOString(),
    isDummy: true,
  },
  {
    id: "dummy-2",
    folder_id: "",
    name: "Sample ID Photo.jpg",
    mime_type: "image/jpeg",
    file_size: 1_450_000,
    created_at: new Date().toISOString(),
    isDummy: true,
  },
];

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
}

export default function DocumentsScreen() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const loadDocuments = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      isRefresh ? setIsRefreshing(true) : setIsLoading(true);

      const [foldersResult, documentsResult] = await Promise.all([
        supabase
          .from("folders")
          .select("id, category, name")
          .eq("user_id", session.user.id),
        supabase
          .from("documents")
          .select("id, folder_id, name, mime_type, file_size, created_at")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false }),
      ]);

      setFolders(foldersResult.data ?? []);
      setDocuments(documentsResult.data ?? []);
      isRefresh ? setIsRefreshing(false) : setIsLoading(false);
    },
    [session],
  );

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments]),
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
    const combined = [...documents, ...DUMMY_DOCUMENTS];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return combined;
    return combined.filter((doc) => doc.name.toLowerCase().includes(query));
  }, [documents, searchQuery]);

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
            onRefresh={() => loadDocuments(true)}
          />
        }
      >
        <View style={styles.sectionHeaderRow}>
          <ThemedText type="small" style={styles.sectionLabel}>
            FOLDERS
          </ThemedText>
          <Pressable
            style={styles.requestedDocsLink}
            onPress={() => showComingSoon("Requested documents tracking")}
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
            return (
              <View key={folder.id} style={styles.folderCard}>
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
              </View>
            );
          })}
        </View>

        <ThemedText
          type="small"
          style={[styles.sectionLabel, styles.allFilesLabel]}
        >
          ALL FILES
        </ThemedText>

        {!isLoading && filteredDocuments.length === 0 && (
          <ThemedText type="small" style={styles.emptyText}>
            {searchQuery
              ? "No documents match your search"
              : "No documents yet"}
          </ThemedText>
        )}

        {viewMode === "list" &&
          filteredDocuments.map((doc, index) => (
            <View key={doc.id} style={styles.fileRow}>
              <View
                style={[
                  styles.fileIconBadge,
                  { backgroundColor: DOC_COLORS[index % DOC_COLORS.length] },
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
              <View style={styles.formatBadge}>
                <ThemedText type="small" style={styles.formatBadgeText}>
                  {formatBadge(doc.mime_type)}
                </ThemedText>
              </View>
              <Pressable
                hitSlop={8}
                onPress={
                  doc.isDummy
                    ? undefined
                    : () => showComingSoon("Document actions")
                }
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#c4c8d1" />
              </Pressable>
            </View>
          ))}

        {viewMode === "grid" && (
          <View style={styles.fileGrid}>
            {filteredDocuments.map((doc, index) => (
              <View key={doc.id} style={styles.fileGridCard}>
                <View
                  style={[
                    styles.fileGridIconBadge,
                    { backgroundColor: DOC_COLORS[index % DOC_COLORS.length] },
                  ]}
                >
                  <Ionicons
                    name={iconForMimeType(doc.mime_type)}
                    size={22}
                    color="#ffffff"
                  />
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
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setIsAddModalVisible(true)}>
        <Ionicons name="add" size={26} color="#ffffff" />
      </Pressable>

      <AddDocumentModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        folders={folders}
        userId={session?.user.id}
        onUploaded={() => loadDocuments()}
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
  fileGridIconBadge: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
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
