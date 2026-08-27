import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

const FOLDERS = ["Academic", "Financial", "Identification", "Forms"] as const;

export default function DocumentsScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Documents
        </ThemedText>

        {FOLDERS.map((folder) => (
          <ThemedView
            key={folder}
            type="backgroundElement"
            style={styles.section}
          >
            <ThemedText type="smallBold">{folder}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              0 files
            </ThemedText>
          </ThemedView>
        ))}
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
