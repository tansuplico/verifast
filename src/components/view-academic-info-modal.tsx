import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { BottomSheet } from "@/components/bottom-sheet";
import { ThemedText } from "@/components/themed-text";
import {
  CATEGORY_STYLE,
  type AcademicInfoCategory,
} from "@/constants/academic-info-categories";
import { Spacing } from "@/constants/theme";

export type ViewableAcademicInfoItem = {
  id: string;
  category: AcademicInfoCategory;
  title: string;
  content: string | null;
  is_pinned: boolean;
  posted_at: string;
};

type ViewAcademicInfoModalProps = {
  visible: boolean;
  onClose: () => void;
  item: ViewableAcademicInfoItem | null;
};

function formatPostedDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Read-only - tapping a card opens this to view the full entry. Editing
// only happens through the menu button on the card itself, which opens
// AddAcademicInfoModal in edit mode; this component never mutates anything.
export function ViewAcademicInfoModal({
  visible,
  onClose,
  item,
}: ViewAcademicInfoModalProps) {
  if (!item) return null;

  const style = CATEGORY_STYLE[item.category];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.headerRow}>
        <View style={[styles.categoryBadge, { backgroundColor: style.color }]}>
          <Ionicons name={style.icon} size={14} color="#ffffff" />
          <ThemedText type="small" style={styles.categoryBadgeLabel}>
            {style.label}
          </ThemedText>
        </View>
        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
          <Ionicons name="close" size={18} color="#60646C" />
        </Pressable>
      </View>

      <ThemedText type="title" style={styles.title}>
        {item.title}
      </ThemedText>

      {item.is_pinned && (
        <View style={styles.pinnedRow}>
          <Ionicons name="bookmark" size={14} color="#0d9488" />
          <ThemedText type="small" style={styles.pinnedLabel}>
            Pinned
          </ThemedText>
        </View>
      )}

      {item.content ? (
        <ThemedText type="small" style={styles.content}>
          {item.content}
        </ThemedText>
      ) : (
        <ThemedText type="small" style={styles.noContent}>
          No additional notes.
        </ThemedText>
      )}

      <View style={styles.dateRow}>
        <Ionicons name="time-outline" size={13} color="#a5a9b1" />
        <ThemedText type="small" style={styles.dateText}>
          Posted {formatPostedDate(item.posted_at)}
        </ThemedText>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  categoryBadgeLabel: { color: "#ffffff", fontWeight: "700" },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, color: "#1a1c20", marginTop: Spacing.one },
  pinnedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.one,
  },
  pinnedLabel: { color: "#0d9488", fontWeight: "600" },
  content: {
    color: "#3a3d44",
    marginTop: Spacing.three,
    lineHeight: 20,
  },
  noContent: {
    color: "#a5a9b1",
    marginTop: Spacing.three,
    fontStyle: "italic",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.four,
  },
  dateText: { color: "#a5a9b1" },
});
