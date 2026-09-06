import Ionicons from "@expo/vector-icons/Ionicons";
import { Directory, File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type DocumentRow = {
  id: string;
  name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BackupRecoveryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("documents")
      .select("id, name, file_path, mime_type, file_size, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    setDocuments(data ?? []);
    setIsLoading(false);
  }, [session]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const totalSize = documents.reduce(
    (sum, doc) => sum + (doc.file_size ?? 0),
    0,
  );

  async function handleShare(doc: DocumentRow) {
    setExportingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 60);

      if (error || !data?.signedUrl) {
        throw new Error("Couldn't get a download link for this file.");
      }

      // file_path always ends in the real extension (from upload), even
      // though the user-facing "name" doesn't - re-attach it here so the
      // shared file keeps a sensible filename and extension.
      const extension = doc.file_path.split(".").pop() ?? "";
      const exportsDir = new Directory(Paths.cache, "verifast-exports");
      exportsDir.create({ intermediates: true, idempotent: true });
      const destination = new File(exportsDir, `${doc.name}.${extension}`);

      const downloaded = await File.downloadFileAsync(
        data.signedUrl,
        destination,
      );

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error("Sharing isn't available on this device.");
      }

      await Sharing.shareAsync(downloaded.uri, {
        mimeType: doc.mime_type ?? undefined,
        dialogTitle: doc.name,
      });
    } catch (err) {
      Alert.alert(
        "Couldn't export file",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setExportingId(null);
    }
  }

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
          Backup and Recovery
        </ThemedText>
        <View style={styles.headerSpacer} />
        <View style={styles.cloudBadge}>
          <Ionicons name="cloud-done-outline" size={16} color="#0d9488" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.four,
          paddingBottom: BottomTabInset + Spacing.four,
          gap: Spacing.four,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="cloud-done-outline" size={22} color="#0d9488" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold" style={styles.summaryTitle}>
              {documents.length}{" "}
              {documents.length === 1 ? "document" : "documents"} backed up
            </ThemedText>
            <ThemedText type="small" style={styles.summarySubtext}>
              {formatFileSize(totalSize) || "0 KB"} stored in your account
            </ThemedText>
          </View>
        </View>

        <View style={styles.card}>
          <ThemedText type="small" style={styles.sectionLabel}>
            YOUR DOCUMENTS
          </ThemedText>

          {isLoading ? (
            <ActivityIndicator
              color="#0d9488"
              style={{ marginVertical: Spacing.four }}
            />
          ) : documents.length === 0 ? (
            <ThemedText type="small" style={styles.emptyText}>
              You haven't uploaded any documents yet.
            </ThemedText>
          ) : (
            documents.map((doc, index) => (
              <View
                key={doc.id}
                style={[
                  styles.docRow,
                  index === documents.length - 1 && styles.docRowLast,
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#60646C"
                />
                <View style={{ flex: 1 }}>
                  <ThemedText
                    type="smallBold"
                    style={styles.docName}
                    numberOfLines={1}
                  >
                    {doc.name}
                  </ThemedText>
                  <ThemedText type="small" style={styles.docMeta}>
                    {formatFileSize(doc.file_size)} ·{" "}
                    {formatShortDate(doc.created_at)}
                  </ThemedText>
                </View>
                <Pressable
                  hitSlop={8}
                  disabled={exportingId === doc.id}
                  onPress={() => handleShare(doc)}
                  style={styles.shareButton}
                >
                  {exportingId === doc.id ? (
                    <ActivityIndicator size="small" color="#0d9488" />
                  ) : (
                    <Ionicons name="share-outline" size={18} color="#0d9488" />
                  )}
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  cloudBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: { color: "#1a1c20" },
  summarySubtext: { color: "#60646C", marginTop: 2 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionLabel: { color: "#8b8f99", letterSpacing: 0.5, fontWeight: "700" },
  emptyText: {
    color: "#8b8f99",
    textAlign: "center",
    paddingVertical: Spacing.three,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  docRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  docName: { color: "#1a1c20" },
  docMeta: { color: "#8b8f99", marginTop: 2 },
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
});
