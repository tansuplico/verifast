import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ToggleSwitch } from "@/components/toggle-switch";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

function showComingSoon(feature: string) {
  Alert.alert("Coming soon", `${feature} isn't set up yet.`);
}

function providerLabel(provider: string | undefined) {
  if (provider === "google") return "Google";
  return "Email";
}

export default function SecurityPrivacyScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Local-only for now: there is no MFA table or TOTP library wired up yet,
  // so this reflects UI state only (same convention as the notification
  // toggles on the Profile screen) - defaults to on per the design.
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);

  async function handleUpdatePassword() {
    if (!currentPassword || !newPassword) {
      Alert.alert("Missing info", "Enter both your current and new password.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(
        "Password too short",
        "New password must be at least 6 characters.",
      );
      return;
    }
    if (!session?.user.email) return;

    setIsSubmitting(true);

    // updateUser() only needs an active session - it doesn't check the
    // caller's current password on its own. Re-authenticating with it here
    // is what actually verifies it's correct before allowing the change.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });

    if (verifyError) {
      setIsSubmitting(false);
      Alert.alert("Incorrect password", "Your current password doesn't match.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setIsSubmitting(false);

    if (updateError) {
      Alert.alert("Couldn't update password", updateError.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    Alert.alert("Password updated", "Your password has been changed.");
  }

  const connectedProvider = providerLabel(session?.user.app_metadata?.provider);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={20} color="#1a1c20" />
        </Pressable>
        <ThemedText type="smallBold" style={styles.headerTitle}>
          Security and Privacy
        </ThemedText>
        <View style={styles.headerSpacer} />
        <View style={styles.shieldBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#0d9488" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.four,
          paddingBottom: BottomTabInset + Spacing.four,
          gap: Spacing.four,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <ThemedText type="small" style={styles.sectionLabel}>
            CHANGE PASSWORD
          </ThemedText>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" style={styles.fieldLabel}>
              Current Password
            </ThemedText>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={16} color="#a5a9b1" />
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor="#a5a9b1"
                secureTextEntry={!showCurrent}
                style={styles.input}
              />
              <Pressable hitSlop={8} onPress={() => setShowCurrent((v) => !v)}>
                <Ionicons
                  name={showCurrent ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#a5a9b1"
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" style={styles.fieldLabel}>
              New Password
            </ThemedText>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={16} color="#a5a9b1" />
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor="#a5a9b1"
                secureTextEntry={!showNew}
                style={styles.input}
              />
              <Pressable hitSlop={8} onPress={() => setShowNew((v) => !v)}>
                <Ionicons
                  name={showNew ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#a5a9b1"
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleUpdatePassword}
            disabled={isSubmitting}
            style={[styles.updateButton, isSubmitting && styles.buttonDisabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="smallBold" style={styles.updateButtonText}>
                Update Password
              </ThemedText>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <ThemedText type="small" style={styles.sectionLabel}>
            PRIVACY CONTROLS
          </ThemedText>

          <View style={styles.controlRow}>
            <View style={styles.controlText}>
              <ThemedText type="smallBold" style={styles.controlTitle}>
                Two-Factor Authentication
              </ThemedText>
              <ThemedText type="small" style={styles.controlSubtext}>
                Require a code when signing in
              </ThemedText>
            </View>
            <ToggleSwitch
              value={twoFactorEnabled}
              onValueChange={setTwoFactorEnabled}
            />
          </View>

          <Pressable
            onPress={() => showComingSoon("Managing connected accounts")}
          >
            <View style={[styles.controlRow, styles.controlRowLast]}>
              <View style={styles.controlText}>
                <ThemedText type="smallBold" style={styles.controlTitle}>
                  Connected Accounts
                </ThemedText>
                <ThemedText type="small" style={styles.controlSubtext}>
                  {connectedProvider}
                  {session?.user.email ? `: ${session.user.email}` : ""}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#c4c8d1" />
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#1a1c20", fontSize: 16, marginLeft: Spacing.three },
  headerSpacer: { flex: 1 },
  shieldBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionLabel: { color: "#1a1c20", letterSpacing: 0.5, fontWeight: "700" },
  fieldGroup: { gap: Spacing.one },
  fieldLabel: { color: "#1a1c20" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: "#f4f4fa",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    height: 46,
  },
  input: { flex: 1, fontSize: 14, color: "#1a1c20" },
  updateButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.one,
  },
  buttonDisabled: { opacity: 0.7 },
  updateButtonText: { color: "#ffffff", fontSize: 15 },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  controlRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  controlText: { flex: 1, gap: 2, paddingRight: Spacing.two },
  controlTitle: { color: "#1a1c20" },
  controlSubtext: { color: "#8b8f99" },
});
