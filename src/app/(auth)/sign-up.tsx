import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthTextField } from "@/components/auth-text-field";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

export default function SignUpScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleCreateAccount() {
    // TODO: wire up Supabase Auth once the project exists
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.iconBadge}>
            <Ionicons
              name="shield-checkmark-outline"
              size={32}
              color="#ffffff"
            />
          </View>
          <ThemedText type="title" style={styles.headerTitle}>
            Create your account
          </ThemedText>
          <ThemedText type="default" style={styles.headerSubtitle}>
            Placeholder subtitle goes here
          </ThemedText>
        </SafeAreaView>
      </View>

      <View style={styles.body}>
        <AuthTextField
          label="Full name"
          icon="person-outline"
          placeholder="Juan Dela Cruz"
          value={fullName}
          onChangeText={setFullName}
        />

        <AuthTextField
          label="Email address"
          icon="mail-outline"
          placeholder="you@university.edu"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <AuthTextField
          label="Password"
          icon="lock-closed-outline"
          placeholder="Create a password"
          isPassword
          value={password}
          onChangeText={setPassword}
        />

        <AuthTextField
          label="Confirm password"
          icon="lock-closed-outline"
          placeholder="Re-enter your password"
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <Pressable style={styles.primaryButton} onPress={handleCreateAccount}>
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            Create Account
          </ThemedText>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <ThemedText type="small" style={styles.dividerText}>
            or
          </ThemedText>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.googleButton} onPress={handleCreateAccount}>
          <Ionicons name="logo-google" size={18} color="#4285F4" />
          <ThemedText type="smallBold" style={styles.googleButtonText}>
            Continue with Google
          </ThemedText>
        </Pressable>

        <View style={styles.footerRow}>
          <ThemedText type="small" style={styles.footerMuted}>
            Already have an account?{" "}
          </ThemedText>
          <Link href="/sign-in" asChild>
            <Pressable>
              <ThemedText type="small" style={styles.footerLink}>
                Sign in
              </ThemedText>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    backgroundColor: "#0d9488",
    paddingBottom: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: Spacing.three,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: Spacing.four,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: Spacing.half,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  primaryButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.five,
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 16 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e4e5e9" },
  dividerText: { color: "#9aa0ab" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: "#e4e5e9",
    borderRadius: Spacing.five,
    paddingVertical: Spacing.three,
  },
  googleButtonText: { color: "#1a1c20" },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  footerMuted: { color: "#6b7280" },
  footerLink: { color: "#0d9488", fontWeight: "700" },
});
