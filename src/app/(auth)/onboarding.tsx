import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Link, Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

const BULLETS = [
  "Placeholder bullet point one",
  "Placeholder bullet point two",
  "Placeholder bullet point three",
];

const HAS_SEEN_ONBOARDING_KEY = "verifast:hasSeenOnboarding";

export default function OnboardingScreen() {
  const [status, setStatus] = useState<"checking" | "show" | "skip">(
    "checking",
  );

  useEffect(() => {
    AsyncStorage.getItem(HAS_SEEN_ONBOARDING_KEY).then((value) => {
      if (value === "true") {
        setStatus("skip");
      } else {
        AsyncStorage.setItem(HAS_SEEN_ONBOARDING_KEY, "true");
        setStatus("show");
      }
    });
  }, []);

  if (status === "checking") {
    return null;
  }

  if (status === "skip") {
    return <Redirect href="/sign-in" />;
  }

  return (
    <LinearGradient
      colors={["#0f766e", "#0d9488"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.iconBadge}>
            <Ionicons
              name="shield-checkmark-outline"
              size={40}
              color="#ffffff"
            />
          </View>

          <ThemedText type="title" style={styles.appName}>
            VeriFast Student+
          </ThemedText>

          <ThemedText type="default" style={styles.tagline}>
            Placeholder tagline goes here
          </ThemedText>

          <View style={styles.bulletList}>
            {BULLETS.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <View style={styles.bulletDot}>
                  <Ionicons name="checkmark" size={14} color="#0d9488" />
                </View>
                <ThemedText type="default" style={styles.bulletText}>
                  {bullet}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Link href="/sign-up" asChild>
            <Pressable style={styles.getStartedButton}>
              <ThemedText type="smallBold" style={styles.getStartedText}>
                Get Started
              </ThemedText>
            </Pressable>
          </Link>

          <View style={styles.signInRow}>
            <ThemedText type="small" style={styles.signInMuted}>
              Already have an account?{" "}
            </ThemedText>
            <Link href="/sign-in" asChild>
              <Pressable>
                <ThemedText type="small" style={styles.signInLink}>
                  Sign in
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.three,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: Spacing.four,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  appName: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
  },
  tagline: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },
  bulletList: {
    width: "100%",
    gap: Spacing.three,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  bulletDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  bulletText: {
    color: "#ffffff",
    flex: 1,
  },
  footer: {
    gap: Spacing.three,
  },
  getStartedButton: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.five,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  getStartedText: {
    color: "#0d9488",
    fontSize: 16,
  },
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  signInMuted: {
    color: "rgba(255,255,255,0.7)",
  },
  signInLink: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
