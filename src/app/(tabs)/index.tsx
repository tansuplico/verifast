import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Home
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Search</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Search bar placeholder
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Recently accessed documents</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            No documents yet
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Upcoming reminders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            No reminders yet
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
