import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type RequestActionsMenuProps = {
  visible: boolean;
  title: string;
  // Pass null when the request is already in its terminal status (nothing
  // further to advance to) - the "Mark as..." row is hidden in that case.
  nextStatusLabel: string | null;
  onClose: () => void;
  onAdvance: () => void;
  onDelete: () => void;
};

// Lightweight actions sheet, same visual pattern as DocumentActionsMenu's
// main menu screen. Deliberately has no Supabase logic of its own - it just
// triggers the onAdvance/onDelete callbacks the screen already had before
// this was pulled off the card into a sheet, so the existing confirmation
// alerts and RLS-aware error handling in requested-docs.tsx are unchanged.
export function RequestActionsMenu({
  visible,
  title,
  nextStatusLabel,
  onClose,
  onAdvance,
  onDelete,
}: RequestActionsMenuProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />

            <View style={styles.headerRow}>
              <ThemedText
                type="smallBold"
                style={styles.docName}
                numberOfLines={1}
              >
                {title}
              </ThemedText>
              <Pressable
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color="#60646C" />
              </Pressable>
            </View>

            {nextStatusLabel && (
              <Pressable
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onAdvance();
                }}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#1a1c20"
                />
                <ThemedText type="small" style={styles.actionLabel}>
                  Mark as {nextStatusLabel}
                </ThemedText>
              </Pressable>
            )}

            <Pressable
              style={styles.actionRow}
              onPress={() => {
                onClose();
                onDelete();
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <ThemedText type="small" style={styles.actionLabelDestructive}>
                Delete
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e4e5e9",
    alignSelf: "center",
    marginBottom: Spacing.two,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  docName: { color: "#8b8f99", flex: 1, marginRight: Spacing.three },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  actionLabel: { color: "#1a1c20", flex: 1 },
  actionLabelDestructive: { color: "#ef4444", flex: 1 },
});
