import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type LoadErrorStateProps = {
  message?: string;
  onRetry: () => void;
};

export function LoadErrorState({
  message = "Couldn't load this right now.",
  onRetry,
}: LoadErrorStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={22} color="#8b8f99" />
      <ThemedText type="small" style={styles.message}>
        {message}
      </ThemedText>
      <Pressable onPress={onRetry} hitSlop={8}>
        <ThemedText type="smallBold" style={styles.retry}>
          Try again
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
  message: { color: "#8b8f99", textAlign: "center" },
  retry: { color: "#0d9488" },
});
