import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

export default function SearchScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Search
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Filters</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            By type or folder
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Recent searches</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            No recent searches
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  title: { fontSize: 32, lineHeight: 40, marginTop: Spacing.three },
  section: {
    gap: Spacing.one,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
});
