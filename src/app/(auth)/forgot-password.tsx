import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
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
import { useAuth } from "@/providers/auth-provider";

type Step = "email" | "code";

export default function ForgotPasswordScreen() {
  const { requestPasswordReset, verifyPasswordResetCode } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSendCode() {
    if (!email.trim()) {
      Alert.alert("Missing info", "Enter the email address on your account.");
      return;
    }
    setIsSubmitting(true);
    const { error } = await requestPasswordReset(email.trim());
    setIsSubmitting(false);

    if (error) {
      Alert.alert("Couldn't send code", error);
      return;
    }
    setStep("code");
  }

  async function handleVerifyCode() {
    if (!code.trim()) {
      Alert.alert("Missing code", "Enter the code we emailed you.");
      return;
    }
    setIsSubmitting(true);
    const { error } = await verifyPasswordResetCode(email.trim(), code.trim());
    setIsSubmitting(false);

    if (error) {
      Alert.alert("Invalid code", error);
      return;
    }
    // Success establishes a session and flips isPasswordRecovery, so the
    // root layout's guard takes it from here and routes to reset-password.
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
            onPress={() => (step === "code" ? setStep("email") : router.back())}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </Pressable>

          <View style={styles.iconBadge}>
            <Ionicons
              name={
                step === "email" ? "key-outline" : "shield-checkmark-outline"
              }
              size={32}
              color="#ffffff"
            />
          </View>
          <ThemedText type="title" style={styles.headerTitle}>
            {step === "email" ? "Forgot password?" : "Enter your code"}
          </ThemedText>
          <ThemedText type="default" style={styles.headerSubtitle}>
            {step === "email"
              ? "Enter your email and we'll send you a reset code"
              : `We sent a 6-digit code to ${email.trim()}`}
          </ThemedText>
        </SafeAreaView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === "email" ? (
          <>
            <AuthTextField
              label="Email address"
              icon="mail-outline"
              placeholder="you@university.edu"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleSendCode}
              disabled={isSubmitting}
            >
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {isSubmitting ? "Sending..." : "Send Code"}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <AuthTextField
              label="6-digit code"
              icon="keypad-outline"
              placeholder="123456"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleVerifyCode}
              disabled={isSubmitting}
            >
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {isSubmitting ? "Verifying..." : "Verify Code"}
              </ThemedText>
            </Pressable>

            <Pressable style={styles.resendRow} onPress={handleSendCode}>
              <ThemedText type="small" style={styles.resendText}>
                Didn&apos;t get a code? Resend
              </ThemedText>
            </Pressable>
          </>
        )}
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
  resendRow: { alignItems: "center", marginTop: Spacing.one },
  resendText: { color: "#0d9488", fontWeight: "600" },
});
