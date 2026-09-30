import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

// Shown above a list when it's populated from the local cache instead of a
// live fetch (offline, or the fetch failed and cached data was available).
// Deliberately low-key - same muted color/icon convention as
// LoadErrorState - since this isn't an error, just a "heads up, this might
// be a little stale" note.
export function OfflineNotice() {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={14} color="#8b8f99" />
      <ThemedText type="small" style={styles.text}>
        You&apos;re offline - showing saved data
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.two,
  },
  text: { color: "#8b8f99" },
});
