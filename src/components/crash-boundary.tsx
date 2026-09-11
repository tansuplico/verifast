import Ionicons from "@expo/vector-icons/Ionicons";
import * as Sentry from "@sentry/react-native";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

type CrashBoundaryProps = { children: ReactNode };
type CrashBoundaryState = { hasError: boolean };

// A render-time crash anywhere in the tree below this component ends up
// here instead of freezing/blanking the screen. Error boundaries have to
// be class components — React doesn't offer a hook-based equivalent.
export class CrashBoundary extends Component<
  CrashBoundaryProps,
  CrashBoundaryState
> {
  state: CrashBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <ThemedView style={styles.container}>
        <Ionicons name="alert-circle-outline" size={32} color="#8b8f99" />
        <ThemedText type="subtitle" style={styles.title}>
          Something went wrong
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.message}
        >
          The error's been reported. You can try again, or close and reopen the
          app if it keeps happening.
        </ThemedText>
        <Pressable onPress={this.handleRetry} hitSlop={8}>
          <ThemedText type="smallBold" style={styles.retry}>
            Try again
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  title: { textAlign: "center" },
  message: { textAlign: "center" },
  retry: { color: "#0d9488", marginTop: Spacing.one },
});
