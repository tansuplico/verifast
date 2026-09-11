import Ionicons from "@expo/vector-icons/Ionicons";
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
import { ToggleSwitch } from "@/components/toggle-switch";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function MfaChallengeScreen() {
  const {
    pendingOtpEmail,
    verifyEmailOtpChallenge,
    resendEmailOtpChallenge,
    cancelEmailOtpChallenge,
  } = useAuth();
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function handleVerify() {
    if (!code.trim()) {
      Alert.alert("Missing code", "Enter the code we emailed you.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await verifyEmailOtpChallenge(
        code.trim(),
        rememberDevice,
      );
      if (error) {
        Alert.alert("Invalid code", error);
      }
      // Success flips needsEmailOtpChallenge - the root layout's guard
      // takes it from here and routes into the app.
    } finally {
      // Belt-and-suspenders: verifyEmailOtpChallenge now catches its own
      // errors, but this guarantees the button never sticks on
      // "Verifying..." even if something throws above that layer.
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setIsResending(true);
    try {
      const { error } = await resendEmailOtpChallenge();
      if (error) {
        Alert.alert("Couldn't resend code", error);
      }
    } finally {
      setIsResending(false);
    }
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
            onPress={cancelEmailOtpChallenge}
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color="#ffffff" />
          </Pressable>

          <View style={styles.iconBadge}>
            <Ionicons
              name="shield-checkmark-outline"
              size={32}
              color="#ffffff"
            />
          </View>
          <ThemedText type="title" style={styles.headerTitle}>
            Verify it's you
          </ThemedText>
          <ThemedText type="default" style={styles.headerSubtitle}>
            {pendingOtpEmail
              ? `We sent a code to ${pendingOtpEmail}`
              : "We sent a code to your email"}
          </ThemedText>
        </SafeAreaView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthTextField
          label="6-digit code"
          icon="keypad-outline"
          placeholder="123456"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />

        <View style={styles.rememberRow}>
          <ThemedText type="smallBold" style={styles.rememberText}>
            Remember this device
          </ThemedText>
          <ToggleSwitch
            value={rememberDevice}
            onValueChange={setRememberDevice}
          />
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={handleVerify}
          disabled={isSubmitting}
        >
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            {isSubmitting ? "Verifying..." : "Verify Code"}
          </ThemedText>
        </Pressable>

        <Pressable
          style={styles.resendRow}
          onPress={handleResend}
          disabled={isResending}
        >
          <ThemedText type="small" style={styles.resendText}>
            {isResending ? "Resending..." : "Didn't get a code? Resend"}
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
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.one,
  },
  rememberText: { color: "#1a1c20" },
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
