import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthTextField } from "@/components/auth-text-field";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { showAlert } from "@/providers/alert-provider";
import { useAuth } from "@/providers/auth-provider";

// Supabase allows one email per address every 60 seconds, so a faster
// "Resend" would only come back with a rate-limit error.
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailScreen() {
  const { verifySignUpCode, resendSignUpCode } = useAuth();
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = (emailParam ?? "").trim();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  // A code was just emailed by whichever screen sent us here (sign-up or
  // an unconfirmed sign-in), so the cooldown starts running right away.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleVerify() {
    if (!code.trim()) {
      showAlert("Missing code", "Enter the code we emailed you.");
      return;
    }
    setIsSubmitting(true);
    const { error } = await verifySignUpCode(email, code.trim());
    setIsSubmitting(false);

    if (error) {
      showAlert("Invalid code", error, undefined, { tone: "danger" });
      return;
    }
    // Success establishes a session, so the root layout's guard takes the
    // user into the app from here.
  }

  async function handleResend() {
    if (secondsLeft > 0 || isResending) return;
    setIsResending(true);
    const { error } = await resendSignUpCode(email);
    setIsResending(false);

    if (error) {
      showAlert("Couldn't send code", error, undefined, { tone: "danger" });
      return;
    }
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    showAlert("Code sent", `We sent a new code to ${email}.`, undefined, {
      tone: "info",
      icon: "mail-outline",
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <SafeAreaView>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace("/sign-up")}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </Pressable>

          <View style={styles.iconBadge}>
            <Ionicons name="mail-outline" size={32} color="#ffffff" />
          </View>
          <ThemedText type="title" style={styles.headerTitle}>
            Verify your email
          </ThemedText>
          <ThemedText type="default" style={styles.headerSubtitle}>
            {`We sent an 8-digit code to ${email}`}
          </ThemedText>
        </SafeAreaView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthTextField
          label="8-digit code"
          icon="keypad-outline"
          placeholder="12345678"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />

        <Pressable
          style={styles.primaryButton}
          onPress={handleVerify}
          disabled={isSubmitting}
        >
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            {isSubmitting ? "Verifying..." : "Verify Email"}
          </ThemedText>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={handleResend}
          disabled={secondsLeft > 0 || isResending}
        >
          <ThemedText
            type="small"
            style={[styles.linkText, secondsLeft > 0 && styles.linkTextMuted]}
          >
            {secondsLeft > 0
              ? `Resend code in ${secondsLeft}s`
              : isResending
                ? "Sending..."
                : "Didn't get a code? Resend"}
          </ThemedText>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.replace("/sign-in")}
        >
          <ThemedText type="small" style={styles.linkTextMuted}>
            Already have an account? Sign in
          </ThemedText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
  backButton: {
    position: "absolute",
    top: Spacing.four,
    left: 0,
    padding: Spacing.one,
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
    paddingHorizontal: Spacing.four,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
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
  linkRow: { alignItems: "center", marginTop: Spacing.one },
  linkText: { color: "#0d9488", fontWeight: "600" },
  linkTextMuted: { color: "#6b7280" },
});
