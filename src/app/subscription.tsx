import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

export default function SubscriptionScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">VeriFast Student+</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            ₱90 / year
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            45-day free trial
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four },
  card: { gap: Spacing.two, borderRadius: Spacing.four, padding: Spacing.four },
});
