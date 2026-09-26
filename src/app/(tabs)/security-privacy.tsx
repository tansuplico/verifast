import Ionicons from "@expo/vector-icons/Ionicons";
import type { UserIdentity } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { showAlert } from "@/providers/alert-provider";
import { useAuth } from "@/providers/auth-provider";

const PASSWORD_MAX_LENGTH = 72;

function providerLabel(provider: string | undefined) {
  if (provider === "google") return "Google";
  return "Email";
}

export default function SecurityPrivacyScreen() {
  const router = useRouter();
  const {
    session,
    setTwoFactorEnabled,
    linkGoogleIdentity,
    unlinkGoogleIdentity,
  } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const twoFactorEnabled =
    session?.user.user_metadata?.two_factor_enabled === true;
  const [isTogglingTwoFactor, setIsTogglingTwoFactor] = useState(false);

  // Fetched fresh via getUserIdentities() rather than read off
  // session.user.identities, per Supabase's own docs - it's the source of
  // truth right after a link/unlink, whereas the session object can lag.
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [isLoadingIdentities, setIsLoadingIdentities] = useState(true);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(
    null,
  );

  async function refreshIdentities() {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (!error) {
      setIdentities(data.identities);
    }
    setIsLoadingIdentities(false);
  }

  useEffect(() => {
    refreshIdentities();
  }, []);

  async function handleLinkGoogle() {
    if (isLinkingGoogle) return;
    setIsLinkingGoogle(true);
    const { error } = await linkGoogleIdentity();
    setIsLinkingGoogle(false);
    if (error) {
      showAlert("Couldn't link Google account", error, undefined, {
        tone: "danger",
      });
      return;
    }
    await refreshIdentities();
  }

  async function handleUnlink(identity: UserIdentity) {
    if (unlinkingProvider) return;
    setUnlinkingProvider(identity.provider);
    // Only Google can be unlinked from this screen today - email/password
    // is the account's baseline sign-in method and isn't offered as an
    // unlink target here.
    const { error } = await unlinkGoogleIdentity();
    setUnlinkingProvider(null);
    if (error) {
      showAlert("Couldn't unlink account", error, undefined, {
        tone: "danger",
      });
      return;
    }
    await refreshIdentities();
  }

  async function handleUpdatePassword() {
    if (!currentPassword || !newPassword) {
      showAlert("Missing info", "Enter both your current and new password.");
      return;
    }
    if (newPassword.length < 6) {
      showAlert(
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
      showAlert(
        "Incorrect password",
        "Your current password doesn't match.",
        undefined,
        {
          tone: "danger",
        },
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setIsSubmitting(false);

    if (updateError) {
      showAlert("Couldn't update password", updateError.message, undefined, {
        tone: "danger",
      });
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    showAlert(
      "Password updated",
      "Your password has been changed.",
      undefined,
      {
        tone: "success",
      },
    );
  }

  async function handleToggleTwoFactor(next: boolean) {
    if (isTogglingTwoFactor) return;
    setIsTogglingTwoFactor(true);
    const { error } = await setTwoFactorEnabled(next);
    setIsTogglingTwoFactor(false);
    if (error) {
      showAlert("Couldn't update setting", error, undefined, {
        tone: "danger",
      });
    }
  }

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

      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color="#a5a9b1"
                />
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor="#a5a9b1"
                  secureTextEntry={!showCurrent}
                  style={styles.input}
                  maxLength={PASSWORD_MAX_LENGTH}
                />
                <Pressable
                  hitSlop={8}
                  onPress={() => setShowCurrent((v) => !v)}
                >
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
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color="#a5a9b1"
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor="#a5a9b1"
                  secureTextEntry={!showNew}
                  style={styles.input}
                  maxLength={PASSWORD_MAX_LENGTH}
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
              style={[
                styles.updateButton,
                isSubmitting && styles.buttonDisabled,
              ]}
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
                onValueChange={handleToggleTwoFactor}
              />
            </View>

            <ThemedText type="small" style={styles.subsectionLabel}>
              CONNECTED ACCOUNTS
            </ThemedText>

            {isLoadingIdentities ? (
              <ActivityIndicator
                color="#0d9488"
                style={styles.identitiesLoader}
              />
            ) : (
              <>
                {identities.map((identity, index) => {
                  const isLast =
                    index === identities.length - 1 &&
                    identities.some((i) => i.provider === "google");
                  const canUnlink =
                    identity.provider === "google" && identities.length > 1;
                  return (
                    <View
                      key={identity.identity_id}
                      style={[
                        styles.controlRow,
                        isLast && styles.controlRowLast,
                      ]}
                    >
                      <View style={styles.controlText}>
                        <ThemedText
                          type="smallBold"
                          style={styles.controlTitle}
                        >
                          {providerLabel(identity.provider)}
                        </ThemedText>
                        <ThemedText type="small" style={styles.controlSubtext}>
                          {identity.identity_data?.email ??
                            session?.user.email ??
                            ""}
                        </ThemedText>
                      </View>
                      {canUnlink &&
                        (unlinkingProvider === identity.provider ? (
                          <ActivityIndicator color="#0d9488" />
                        ) : (
                          <Pressable
                            hitSlop={8}
                            onPress={() => handleUnlink(identity)}
                          >
                            <ThemedText
                              type="small"
                              style={styles.unlinkAction}
                            >
                              Unlink
                            </ThemedText>
                          </Pressable>
                        ))}
                    </View>
                  );
                })}

                {!identities.some((i) => i.provider === "google") && (
                  <Pressable
                    onPress={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                  >
                    <View style={[styles.controlRow, styles.controlRowLast]}>
                      <View style={styles.controlText}>
                        <ThemedText
                          type="smallBold"
                          style={styles.controlTitle}
                        >
                          Link Google Account
                        </ThemedText>
                        <ThemedText type="small" style={styles.controlSubtext}>
                          Sign in with Google as well as your password
                        </ThemedText>
                      </View>
                      {isLinkingGoogle ? (
                        <ActivityIndicator color="#0d9488" />
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#c4c8d1"
                        />
                      )}
                    </View>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: { flex: 1 },
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
  subsectionLabel: {
    color: "#8b8f99",
    letterSpacing: 0.5,
    fontWeight: "700",
    marginTop: Spacing.one,
  },
  identitiesLoader: { paddingVertical: Spacing.two },
  unlinkAction: { color: "#dc2626", fontWeight: "600" },
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
