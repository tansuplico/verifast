import { Link } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Profile
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Account info</ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Notifications</ThemedText>
        </ThemedView>

        <Link href="/subscription" asChild>
          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="smallBold">Subscription status</ThemedText>
            <ThemedText type="link">View plan</ThemedText>
          </ThemedView>
        </Link>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Backup and recovery</ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Log out
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
