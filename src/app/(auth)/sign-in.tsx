import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthTextField } from "@/components/auth-text-field";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    setIsSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setIsSubmitting(false);
    if (error) {
      Alert.alert("Sign in failed", error);
      return;
    }
  }

  function handleForgotPassword() {
    router.push("/forgot-password");
  }

  function handleGoogleSignIn() {
    // Google OAuth isn't wired up yet (pending task) - this is still the
    // placeholder Ionicons glyph, not Google's brand-guideline logo.
    Alert.alert("Coming soon", "Google sign-in isn't set up yet.");
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
            Welcome back
          </ThemedText>
          <ThemedText type="default" style={styles.headerSubtitle}>
            Sign in to your account
          </ThemedText>
        </SafeAreaView>
      </View>

      <View style={styles.body}>
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
          placeholder="Enter your password"
          isPassword
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          style={styles.forgotPasswordRow}
          onPress={handleForgotPassword}
        >
          <ThemedText type="small" style={styles.forgotPasswordText}>
            Forgot password?
          </ThemedText>
        </Pressable>

        <Pressable
          style={styles.primaryButton}
          onPress={handleSignIn}
          disabled={isSubmitting}
        >
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </ThemedText>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <ThemedText type="small" style={styles.dividerText}>
            or
          </ThemedText>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.googleButton} onPress={handleGoogleSignIn}>
          <Ionicons name="logo-google" size={18} color="#4285F4" />
          <ThemedText type="smallBold" style={styles.googleButtonText}>
            Continue with Google
          </ThemedText>
        </Pressable>

        <View style={styles.footerRow}>
          <ThemedText type="small" style={styles.footerMuted}>
            No account yet?{" "}
          </ThemedText>
          <Link href="/sign-up" asChild>
            <Pressable>
              <ThemedText type="small" style={styles.footerLink}>
                Create one for free
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
  forgotPasswordRow: { alignSelf: "flex-end" },
  forgotPasswordText: { color: "#0d9488", fontWeight: "600" },
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
