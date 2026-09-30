import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { OfflineNotice } from "@/components/offline-notice";
import { SkeletonBlock } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useIsOnline } from "@/hooks/use-network-status";
import {
  searchCachedAcademicInfo,
  searchCachedDocuments,
} from "@/lib/offline-db";
import {
  cacheDocumentFileForOffline,
  getOfflineFileUri,
} from "@/lib/offline-files";
import { supabase } from "@/lib/supabase";
import { showAlert, showComingSoon } from "@/providers/alert-provider";
import { useAuth } from "@/providers/auth-provider";

const SEARCH_QUERY_MAX_LENGTH = 50;

const RECENT_SEARCHES_KEY = "recent_searches";
const MAX_RECENT_SEARCHES = 5;
const SEARCH_DEBOUNCE_MS = 300;

type DocumentResult = {
  id: string;
  name: string;
  mime_type: string | null;
  file_path: string;
};

type AcademicInfoResult = {
  id: string;
  title: string;
  category: "curriculum" | "announcement" | "activity";
};

type BrowseCategory = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: "/documents" | "/academic-info";
};

// Announcements and Activities don't have their own tabs/screens yet — they're
// sections within academic_info (see category enum in the schema). Both route
// to the Academic Info tab for now until that screen is built out to actually
// filter by category (tracked as a pending task).
const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    key: "documents",
    label: "Documents",
    icon: "document-text",
    color: "#10b981",
    route: "/documents",
  },
  {
    key: "academic-info",
    label: "Academic Info",
    icon: "book",
    color: "#7c5cfc",
    route: "/academic-info",
  },
  {
    key: "announcements",
    label: "Announcements",
    icon: "megaphone",
    color: "#f59e0b",
    route: "/academic-info",
  },
  {
    key: "activities",
    label: "Activities",
    icon: "calendar",
    color: "#3b82f6",
    route: "/academic-info",
  },
];

function iconForMimeType(
  mimeType: string | null,
): keyof typeof Ionicons.glyphMap {
  if (!mimeType) return "document-outline";
  if (mimeType.startsWith("image/")) return "image-outline";
  if (mimeType === "application/pdf") return "document-text-outline";
  return "document-outline";
}

function labelForCategory(category: AcademicInfoResult["category"]) {
  switch (category) {
    case "announcement":
      return "Announcement";
    case "activity":
      return "Activity";
    default:
      return "Curriculum";
  }
}

// searchCachedDocuments returns the full cached DocumentRow shape (shared
// with the Documents screen); this screen only ever needs these four
// fields, so narrow it down to DocumentResult at the call site.
function searchCachedDocumentResults(
  userId: string,
  query: string,
): DocumentResult[] {
  return searchCachedDocuments(userId, query)
    .filter((doc) => !!doc.file_path)
    .map((doc) => ({
      id: doc.id,
      name: doc.name,
      mime_type: doc.mime_type,
      file_path: doc.file_path as string,
    }));
}

function SearchResultSkeletonRow() {
  return (
    <View style={styles.resultRow}>
      <SkeletonBlock width={40} height={40} radius={Spacing.two} />
      <SkeletonBlock width="60%" height={14} radius={4} />
    </View>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [documentResults, setDocumentResults] = useState<DocumentResult[]>([]);
  const [infoResults, setInfoResults] = useState<AcademicInfoResult[]>([]);
  const [previewDoc, setPreviewDoc] = useState<DocumentResult | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isShowingCache, setIsShowingCache] = useState(false);
  const isOnline = useIsOnline();

  // Same open logic as Documents' handleDocPress: try a live signed URL
  // first (skipped entirely when already offline), fall back to a copy
  // downloaded during an earlier view otherwise. See documents.tsx for the
  // full reasoning (Sharing instead of Linking for local file:// URIs, the
  // background re-cache on a successful online view, etc.) - kept in sync
  // with that version rather than duplicating the explanation here.
  const handleDocPress = useCallback(
    async (doc: DocumentResult) => {
      if (!doc.file_path) return;

      if (isOnline) {
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
          const fileName = doc.file_path.split("/").pop() ?? doc.name;
          cacheDocumentFileForOffline(doc.id, data.signedUrl, fileName);
          return;
        }
      }

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
  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then((value) => {
      if (value) setRecentSearches(JSON.parse(value));
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setHasSearched(false);
      setDocumentResults([]);
      setInfoResults([]);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      // Offline: skip the live query outright and read straight from the
      // local cache (only ever has this user's own cached documents/info,
      // populated from earlier visits to Documents / Academic Info).
      if (!isOnline) {
        setDocumentResults(
          session ? searchCachedDocumentResults(session.user.id, trimmed) : [],
        );
        setInfoResults(
          session ? searchCachedAcademicInfo(session.user.id, trimmed) : [],
        );
        setIsShowingCache(true);
        setIsSearching(false);
        setHasSearched(true);
        return;
      }

      const [documentsResult, infoResult] = await Promise.all([
        session
          ? supabase
              .from("documents")
              .select("id, name, mime_type, file_path")
              .eq("user_id", session.user.id)
              .ilike("name", `%${trimmed}%`)
              .order("created_at", { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [] as DocumentResult[], error: null }),
        supabase
          .from("academic_info")
          .select("id, title, category")
          .ilike("title", `%${trimmed}%`)
          .order("posted_at", { ascending: false })
          .limit(8),
      ]);

      // A live query can still fail while "online" (a flaky connection, a
      // dropped request) - fall back to cache per-section rather than
      // showing nothing, same as Documents/Academic Info do on load.
      const usingCache = !!(documentsResult.error || infoResult.error);
      setDocumentResults(
        documentsResult.error
          ? session
            ? searchCachedDocumentResults(session.user.id, trimmed)
            : []
          : (documentsResult.data ?? []),
      );
      setInfoResults(
        infoResult.error
          ? session
            ? searchCachedAcademicInfo(session.user.id, trimmed)
            : []
          : (infoResult.data ?? []),
      );
      setIsShowingCache(usingCache);
      setIsSearching(false);
      setHasSearched(true);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, session, isOnline]);

  async function commitToRecentSearches(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;

    const next = [
      trimmed,
      ...recentSearches.filter(
        (existing) => existing.toLowerCase() !== trimmed.toLowerCase(),
      ),
    ].slice(0, MAX_RECENT_SEARCHES);

    setRecentSearches(next);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  }

  const isIdle = query.trim().length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerRow}>
        <ThemedText type="title" style={styles.pageTitle}>
          Search
        </ThemedText>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8b8f99" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => commitToRecentSearches(query)}
          placeholder="Search documents, announcements..."
          placeholderTextColor="#8b8f99"
          style={styles.searchInput}
          returnKeyType="search"
          maxLength={SEARCH_QUERY_MAX_LENGTH}
        />
        {query.length > 0 && (
          <Pressable hitSlop={8} onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color="#c4c8d1" />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.six }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isIdle ? (
          <>
            <ThemedText style={[styles.sectionLabel, styles.firstSectionLabel]}>
              RECENT SEARCHES
            </ThemedText>

            {recentSearches.length === 0 ? (
              <ThemedText type="small" style={styles.emptyText}>
                No recent searches
              </ThemedText>
            ) : (
              recentSearches.map((term) => (
                <Pressable
                  key={term}
                  style={styles.recentRow}
                  onPress={() => {
                    setQuery(term);
                    commitToRecentSearches(term);
                  }}
                >
                  <View style={styles.recentIconBadge}>
                    <Ionicons name="time-outline" size={16} color="#8b8f99" />
                  </View>
                  <ThemedText type="smallBold" style={styles.recentText}>
                    {term}
                  </ThemedText>
                </Pressable>
              ))
            )}

            <ThemedText style={[styles.sectionLabel, styles.laterSectionLabel]}>
              BROWSE CATEGORIES
            </ThemedText>

            <View style={styles.categoryGrid}>
              {BROWSE_CATEGORIES.map((category) => (
                <Pressable
                  key={category.key}
                  style={styles.categoryCard}
                  onPress={() => router.push(category.route)}
                >
                  <View
                    style={[
                      styles.categoryIconBadge,
                      { backgroundColor: category.color },
                    ]}
                  >
                    <Ionicons name={category.icon} size={18} color="#ffffff" />
                  </View>
                  <ThemedText type="smallBold" style={styles.categoryLabel}>
                    {category.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            {isSearching && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SearchResultSkeletonRow key={`search-skeleton-${i}`} />
                ))}
              </>
            )}

            {!isSearching && hasSearched && (
              <>
                {isShowingCache &&
                  (documentResults.length > 0 || infoResults.length > 0) && (
                    <OfflineNotice />
                  )}

                <ThemedText
                  style={[styles.sectionLabel, styles.firstSectionLabel]}
                >
                  DOCUMENTS
                </ThemedText>

                {documentResults.length === 0 ? (
                  <ThemedText type="small" style={styles.emptyText}>
                    No matching documents
                  </ThemedText>
                ) : (
                  documentResults.map((doc) => (
                    <Pressable
                      key={doc.id}
                      style={styles.resultRow}
                      onPress={() => handleDocPress(doc)}
                    >
                      <View style={styles.resultIconBadge}>
                        <Ionicons
                          name={iconForMimeType(doc.mime_type)}
                          size={18}
                          color="#ffffff"
                        />
                      </View>
                      <ThemedText
                        type="smallBold"
                        style={styles.resultText}
                        numberOfLines={1}
                      >
                        {doc.name}
                      </ThemedText>
                    </Pressable>
                  ))
                )}

                <ThemedText
                  style={[styles.sectionLabel, styles.laterSectionLabel]}
                >
                  ACADEMIC INFO
                </ThemedText>

                {infoResults.length === 0 ? (
                  <ThemedText type="small" style={styles.emptyText}>
                    No matching results
                  </ThemedText>
                ) : (
                  infoResults.map((info) => (
                    <Pressable
                      key={info.id}
                      style={styles.resultRow}
                      onPress={() => showComingSoon("Academic info details")}
                    >
                      <View
                        style={[
                          styles.resultIconBadge,
                          { backgroundColor: "#7c5cfc" },
                        ]}
                      >
                        <Ionicons name="book" size={18} color="#ffffff" />
                      </View>
                      <View style={styles.resultTextGroup}>
                        <ThemedText
                          type="smallBold"
                          style={styles.resultText}
                          numberOfLines={1}
                        >
                          {info.title}
                        </ThemedText>
                        <ThemedText type="small" style={styles.resultSubtext}>
                          {labelForCategory(info.category)}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
      <DocumentPreviewModal
        visible={!!previewDoc}
        imageUrl={previewImageUrl}
        documentName={previewDoc?.name ?? ""}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewImageUrl(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  headerRow: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  pageTitle: { fontSize: 26, lineHeight: 32, color: "#1a1c20" },
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
  sectionLabel: {
    color: "#8b8f99",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.four,
  },
  firstSectionLabel: { marginTop: Spacing.four },
  laterSectionLabel: { marginTop: Spacing.four },
  emptyText: {
    color: "#8b8f99",
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  recentIconBadge: {
    width: 32,
    height: 32,
    borderRadius: Spacing.two,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  recentText: { color: "#1a1c20" },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  categoryCard: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  categoryIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: { color: "#1a1c20", flexShrink: 1, fontSize: 11 },
  loadingIndicator: { marginTop: Spacing.five },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  resultIconBadge: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  resultTextGroup: { flex: 1, gap: 2 },
  resultText: { color: "#1a1c20", flex: 1 },
  resultSubtext: { color: "#8b8f99" },
});
