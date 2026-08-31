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
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUpdatePassword() {
    if (!password || !confirmPassword) {
      Alert.alert("Missing info", "Enter and confirm your new password.");
      return;
    }
    if (password.length < 6) {
      Alert.alert(
        "Password too short",
        "Use at least 6 characters for your new password.",
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Double-check both fields.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await updatePassword(password);
    setIsSubmitting(false);

    if (error) {
      Alert.alert("Couldn't update password", error);
      return;
    }

    // Successful update clears isPasswordRecovery in the auth provider,
    // which lets the root layout's normal session guard take over and
    // send the user into (tabs) automatically - no manual navigation here.
    Alert.alert("Password updated", "You're signed in with your new password.");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <SafeAreaView>
          <View style={styles.iconBadge}>
            <Ionicons name="lock-closed-outline" size={32} color="#ffffff" />
          </View>
          <ThemedText type="title" style={styles.headerTitle}>
            Set a new password
          </ThemedText>
          <ThemedText type="default" style={styles.headerSubtitle}>
            Choose a new password for your account
          </ThemedText>
        </SafeAreaView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthTextField
          label="New password"
          icon="lock-closed-outline"
          placeholder="Create a new password"
          isPassword
          value={password}
          onChangeText={setPassword}
        />

        <AuthTextField
          label="Confirm new password"
          icon="lock-closed-outline"
          placeholder="Re-enter your new password"
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <Pressable
          style={styles.primaryButton}
          onPress={handleUpdatePassword}
          disabled={isSubmitting}
        >
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            {isSubmitting ? "Updating..." : "Update Password"}
          </ThemedText>
        </Pressable>

        <Pressable style={styles.cancelRow} onPress={() => signOut()}>
          <ThemedText type="small" style={styles.cancelText}>
            Cancel and sign out
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
  cancelRow: { alignItems: "center", marginTop: Spacing.two },
  cancelText: { color: "#6b7280" },
});
