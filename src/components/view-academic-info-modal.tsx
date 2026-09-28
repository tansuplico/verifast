import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

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

const OPEN_MS = 220;
const CLOSE_MS = 160;

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
//
// Rendered as a centered card in its own transparent <Modal>, with the same
// fade + scale animation and backdrop as the app's custom alerts
// (alert-provider.tsx), so it feels like part of the same family. The
// unmount is a plain setTimeout after the close animation, matching
// BottomSheet, rather than a withTiming completion callback.
export function ViewAcademicInfoModal({
  visible,
  onClose,
  item,
}: ViewAcademicInfoModalProps) {
  const { height } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      progress.value = withTiming(1, {
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    progress.value = withTiming(0, {
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
    });
    const timeout = setTimeout(() => setIsMounted(false), CLOSE_MS);
    return () => clearTimeout(timeout);
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
  }));

  if (!isMounted || !item) return null;

  const style = CATEGORY_STYLE[item.category];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessible={false}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[styles.card, cardStyle]}
        >
          <View style={[styles.badge, { backgroundColor: style.color }]}>
            <Ionicons name={style.icon} size={26} color="#ffffff" />
          </View>

          <ThemedText
            type="small"
            style={[styles.category, { color: style.color }]}
          >
            {style.label}
          </ThemedText>

          <ThemedText type="smallBold" style={styles.title}>
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

          <ScrollView
            style={[styles.notesBox, { maxHeight: height * 0.35 }]}
            contentContainerStyle={styles.notesContent}
            showsVerticalScrollIndicator={false}
          >
            {item.content ? (
              <ThemedText type="small" style={styles.notes}>
                {item.content}
              </ThemedText>
            ) : (
              <ThemedText type="small" style={styles.noNotes}>
                No additional notes.
              </ThemedText>
            )}
          </ScrollView>

          <View style={styles.dateRow}>
            <Ionicons name="time-outline" size={13} color="#a5a9b1" />
            <ThemedText type="small" style={styles.dateText}>
              Posted {formatPostedDate(item.posted_at)}
            </ThemedText>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <ThemedText type="smallBold" style={styles.closeButtonText}>
              Close
            </ThemedText>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three + 4,
    paddingBottom: Spacing.three + 4,
    alignItems: "center",
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  category: {
    fontWeight: "700",
    marginBottom: Spacing.one,
  },
  title: {
    color: "#1a1c20",
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
  },
  pinnedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.one,
  },
  pinnedLabel: { color: "#0d9488", fontWeight: "600" },
  notesBox: {
    alignSelf: "stretch",
    flexGrow: 0,
    backgroundColor: "#f7f8fa",
    borderRadius: 12,
    marginTop: Spacing.three,
  },
  notesContent: { padding: Spacing.three },
  notes: { color: "#3a3d44", lineHeight: 20 },
  noNotes: { color: "#a5a9b1", fontStyle: "italic" },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.three,
    marginBottom: Spacing.three + 4,
  },
  dateText: { color: "#a5a9b1" },
  closeButton: {
    alignSelf: "stretch",
    backgroundColor: "#0d9488",
    borderRadius: 12,
    paddingVertical: Spacing.three - 4,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: { opacity: 0.8 },
  closeButtonText: { color: "#ffffff", fontSize: 15 },
});
