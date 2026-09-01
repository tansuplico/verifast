import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type DocumentPreviewModalProps = {
  visible: boolean;
  imageUrl: string | null;
  documentName: string;
  onClose: () => void;
};

// Only used for images. PDFs and other file types are handed off to the
// device's default PDF/browser app via Linking.openURL instead, since we're
// still testing in Expo Go and don't have a dev client for a native PDF
// renderer yet.
export function DocumentPreviewModal({
  visible,
  imageUrl,
  documentName,
  onClose,
}: DocumentPreviewModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
              {documentName}
            </ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={20} color="#ffffff" />
            </Pressable>
          </View>

          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              contentFit="contain"
              transition={150}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  safeArea: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  title: { color: "#ffffff", flex: 1, marginRight: Spacing.three },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { flex: 1 },
});
