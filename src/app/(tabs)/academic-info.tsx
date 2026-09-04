import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  AddAcademicInfoModal,
  type AcademicInfoItem,
} from "@/components/add-academic-info-modal";
import { ThemedText } from "@/components/themed-text";
import {
  CATEGORY_STYLE,
  type AcademicInfoCategory,
} from "@/constants/academic-info-categories";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type AcademicInfoRow = AcademicInfoItem & { posted_at: string };

type FilterKey = "all" | AcademicInfoCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "curriculum", label: "Curriculum" },
  { key: "announcement", label: "Announcements" },
  { key: "activity", label: "Activities" },
];

function formatPostedDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
}

export default function AcademicInfoScreen() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [program, setProgram] = useState<string | null>(null);
  const [items, setItems] = useState<AcademicInfoRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<AcademicInfoItem | null>(null);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      isRefresh ? setIsRefreshing(true) : setIsLoading(true);

      const [profileResult, infoResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("program")
          .eq("id", session.user.id)
          .single(),
        supabase
          .from("academic_info")
          .select("id, category, title, content, is_pinned, posted_at")
          .eq("user_id", session.user.id)
          .order("is_pinned", { ascending: false })
          .order("posted_at", { ascending: false }),
      ]);

      setProgram(profileResult.data?.program ?? null);
      setItems(infoResult.data ?? []);
      isRefresh ? setIsRefreshing(false) : setIsLoading(false);
    },
    [session],
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return items;
    return items.filter((item) => item.category === activeFilter);
  }, [items, activeFilter]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextGroup}>
          <ThemedText type="title" style={styles.pageTitle}>
            Academic Info
          </ThemedText>
          {program && (
            <ThemedText type="small" style={styles.subtitle}>
              {program}
            </ThemedText>
          )}
        </View>

        <Pressable
          style={styles.headerBadge}
          onPress={() => showComingSoon("Academic profile")}
        >
          <Ionicons name="school" size={18} color="#7c5cfc" />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          return (
            <Pressable
              key={filter.key}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setActiveFilter(filter.key)}
            >
              <ThemedText
                style={[
                  styles.filterPillText,
                  isActive && styles.filterPillTextActive,
                ]}
              >
                {filter.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.six }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadData(true)}
          />
        }
      >
        {!isLoading && filteredItems.length === 0 && (
          <ThemedText type="small" style={styles.emptyText}>
            {activeFilter === "all"
              ? "No academic info yet - tap + to add your first entry"
              : `No ${FILTERS.find((filter) => filter.key === activeFilter)?.label.toLowerCase()} yet`}
          </ThemedText>
        )}

        {filteredItems.map((item) => {
          const style = CATEGORY_STYLE[item.category];
          return (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => {
                setEditingItem(item);
                setIsModalVisible(true);
              }}
            >
              <View style={styles.cardHeaderRow}>
                <View
                  style={[styles.iconBadge, { backgroundColor: style.color }]}
                >
                  <Ionicons name={style.icon} size={20} color="#ffffff" />
                </View>

                <View style={styles.cardTextColumn}>
                  <View style={styles.titleRow}>
                    <ThemedText
                      type="smallBold"
                      style={styles.cardTitle}
                      numberOfLines={2}
                    >
                      {item.title}
                    </ThemedText>
                    <ThemedText
                      style={[styles.categoryTag, { color: style.color }]}
                    >
                      {style.label}
                    </ThemedText>
                  </View>

                  {item.content && (
                    <ThemedText
                      type="small"
                      style={styles.cardContent}
                      numberOfLines={3}
                    >
                      {item.content}
                    </ThemedText>
                  )}

                  <View style={styles.cardFooterRow}>
                    <Ionicons name="time-outline" size={12} color="#a5a9b1" />
                    <ThemedText type="small" style={styles.cardDate}>
                      {formatPostedDate(item.posted_at)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        style={styles.fab}
        onPress={() => {
          setEditingItem(null);
          setIsModalVisible(true);
        }}
      >
        <Ionicons name="add" size={26} color="#ffffff" />
      </Pressable>

      <AddAcademicInfoModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        userId={session?.user.id}
        editingItem={editingItem}
        onSaved={() => loadData()}
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
  headerTextGroup: { flex: 1 },
  pageTitle: { fontSize: 26, lineHeight: 32, color: "#1a1c20" },
  subtitle: { color: "#8b8f99", marginTop: 2 },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#efeafe",
    alignItems: "center",
    justifyContent: "center",
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
  filterPill: {
    backgroundColor: "#eeeef1",
    borderRadius: 20,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  filterPillActive: { backgroundColor: "#0d9488" },
  filterPillText: { color: "#60646C", fontSize: 13, fontWeight: "600" },
  filterPillTextActive: { color: "#ffffff" },
  emptyText: {
    color: "#8b8f99",
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.four,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextColumn: { flex: 1, gap: Spacing.one },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  cardTitle: { flex: 1, color: "#1a1c20" },
  categoryTag: { fontSize: 12, fontWeight: "700", flexShrink: 0 },
  cardContent: { color: "#60646C" },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.one,
  },
  cardDate: { color: "#a5a9b1" },
});
