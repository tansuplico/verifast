import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

const CONFIRM_WORD = "DELETE";

type DeleteAccountModalProps = {
  visible: boolean;
  onClose: () => void;
  // Runs the actual deletion. The modal shows its own spinner until this
  // settles and can't be dismissed meanwhile. On success the app signs the
  // user out, so the screen behind it goes away on its own.
  onConfirm: () => Promise<void>;
  // True for an active/trialing/past_due subscription - adds the line about
  // remaining time being lost.
  hasSubscription: boolean;
};

const ERASED_ITEMS = [
  "Your documents and uploaded files",
  "Your reminders and deadlines",
  "Your academic info and document requests",
  "Your profile and subscription",
];

// Two-step confirmation for permanent account deletion: first a plain
// statement of exactly what will be erased, then a typed confirmation, so
// a stray tap can never get all the way through.
export function DeleteAccountModal({
  visible,
  onClose,
  onConfirm,
  hasSubscription,
}: DeleteAccountModalProps) {
  const [stage, setStage] = useState<"warn" | "confirm">("warn");
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Always reopen on the first step with an empty field.
  useEffect(() => {
    if (visible) {
      setStage("warn");
      setTyped("");
    }
  }, [visible]);

  const canDelete = typed.trim().toUpperCase() === CONFIRM_WORD && !isDeleting;

  function handleClose() {
    if (isDeleting) return;
    onClose();
  }

  async function handleDelete() {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.badge}>
            <Ionicons name="trash-outline" size={26} color="#dc2626" />
          </View>
          <ThemedText type="smallBold" style={styles.title}>
            Delete your account?
          </ThemedText>

          {stage === "warn" ? (
            <>
              <ThemedText type="small" style={styles.body}>
                This permanently erases:
              </ThemedText>
              <View style={styles.list}>
                {ERASED_ITEMS.map((item) => (
                  <View key={item} style={styles.listRow}>
                    <Ionicons name="close" size={14} color="#dc2626" />
                    <ThemedText type="small" style={styles.listText}>
                      {item}
                    </ThemedText>
                  </View>
                ))}
              </View>
              {hasSubscription && (
                <ThemedText type="small" style={styles.note}>
                  Any remaining free trial or paid subscription time is lost,
                  and no refund is given.
                </ThemedText>
              )}
              <ThemedText type="smallBold" style={styles.irreversible}>
                This can&apos;t be undone.
              </ThemedText>
              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                >
                  <ThemedText type="smallBold" style={styles.cancelText}>
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.continueButton]}
                  onPress={() => setStage("confirm")}
                >
                  <ThemedText type="smallBold" style={styles.continueText}>
                    Continue
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ThemedText type="small" style={styles.body}>
                Type {CONFIRM_WORD} to confirm you want to permanently delete
                your account and all of your data.
              </ThemedText>
              <TextInput
                style={styles.input}
                value={typed}
                onChangeText={setTyped}
                placeholder={CONFIRM_WORD}
                placeholderTextColor="#b4b8c1"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isDeleting}
              />
              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                  disabled={isDeleting}
                >
                  <ThemedText type="smallBold" style={styles.cancelText}>
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.button,
                    styles.deleteButton,
                    !canDelete && styles.deleteButtonDisabled,
                  ]}
                  onPress={handleDelete}
                  disabled={!canDelete}
                >
                  {isDeleting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.deleteText}>
                      Delete Account
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three + 4,
    paddingBottom: Spacing.three + 4,
    alignItems: "center",
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  title: { color: "#1a1c20", fontSize: 17, textAlign: "center" },
  body: {
    color: "#6b7078",
    textAlign: "center",
    marginTop: Spacing.two,
    lineHeight: 20,
  },
  list: { alignSelf: "stretch", gap: 6, marginTop: Spacing.two },
  listRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  listText: { color: "#1a1c20", flex: 1 },
  note: {
    color: "#b45309",
    textAlign: "center",
    marginTop: Spacing.three,
    lineHeight: 20,
  },
  irreversible: {
    color: "#dc2626",
    textAlign: "center",
    marginTop: Spacing.three,
  },
  input: {
    alignSelf: "stretch",
    backgroundColor: "#f4f4fa",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    height: 46,
    fontSize: 14,
    color: "#1a1c20",
    textAlign: "center",
    letterSpacing: 2,
    marginTop: Spacing.three,
  },
  buttonRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: Spacing.two,
    marginTop: Spacing.three + 4,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: { backgroundColor: "#f0f0f3" },
  cancelText: { color: "#1a1c20" },
  continueButton: { backgroundColor: "#fef2f2" },
  continueText: { color: "#dc2626" },
  deleteButton: { backgroundColor: "#dc2626" },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteText: { color: "#ffffff" },
});
