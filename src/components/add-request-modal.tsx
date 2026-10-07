import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { BottomSheet } from "@/components/bottom-sheet";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { createRequestLocal } from "@/lib/offline-db";
import { requestSync } from "@/lib/sync";
import { showAlert } from "@/providers/alert-provider";
import { useToast } from "@/providers/toast-provider";

const DOCUMENT_TYPE_MAX_LENGTH = 60;
const OFFICE_MAX_LENGTH = 80;

type AddRequestModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  onCreated: () => void;
};

export function AddRequestModal({
  visible,
  onClose,
  userId,
  onCreated,
}: AddRequestModalProps) {
  const { showSavedToast } = useToast();
  const [documentType, setDocumentType] = useState("");
  const [office, setOffice] = useState("");
  // Saving is a local write now (instant, works offline), so there is no
  // "Saving..." state - this only stops a fast double-tap from logging the
  // same request twice before the sheet has closed.
  const hasSubmittedRef = useRef(false);

  function reset() {
    setDocumentType("");
    setOffice("");
    hasSubmittedRef.current = false;
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSave() {
    if (!documentType.trim() || !userId || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    // Saved on the device first so it works with or without a connection;
    // requestSync pushes it to Supabase right away when online, and sync
    // picks it up on reconnect otherwise.
    try {
      createRequestLocal(userId, {
        document_type: documentType.trim(),
        office: office.trim() || null,
      });
    } catch (error) {
      hasSubmittedRef.current = false;
      console.error("Failed to save document request locally", error);
      showAlert(
        "Couldn't save request",
        "Something went wrong saving this request.",
        undefined,
        { tone: "danger" },
      );
      return;
    }

    requestSync(userId);
    reset();
    onCreated();
    onClose();
    // Wait for the sheet to finish closing: a toast can't show above an
    // open Modal.
    setTimeout(() => showSavedToast("Request added"), 260);
  }

  const canSubmit = documentType.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <View style={styles.headerRow}>
        <ThemedText type="title" style={styles.title}>
          Log a Request
        </ThemedText>
        <Pressable onPress={handleClose} style={styles.closeButton} hitSlop={8}>
          <Ionicons name="close" size={18} color="#60646C" />
        </Pressable>
      </View>

      <ThemedText type="small" style={styles.fieldLabel}>
        Document Type
      </ThemedText>
      <TextInput
        value={documentType}
        onChangeText={setDocumentType}
        placeholder="e.g. Transcript of Records"
        placeholderTextColor="#8b8f99"
        style={styles.textInput}
        maxLength={DOCUMENT_TYPE_MAX_LENGTH}
      />
      <ThemedText type="small" style={styles.charCount}>
        {documentType.length}/{DOCUMENT_TYPE_MAX_LENGTH}
      </ThemedText>
      <ThemedText type="small" style={styles.fieldLabel}>
        Office (optional)
      </ThemedText>
      <TextInput
        value={office}
        onChangeText={setOffice}
        placeholder="e.g. Registrar's Office"
        placeholderTextColor="#8b8f99"
        style={styles.textInput}
        maxLength={OFFICE_MAX_LENGTH}
      />
      <ThemedText type="small" style={styles.charCount}>
        {office.length}/{OFFICE_MAX_LENGTH}
      </ThemedText>
      <Pressable
        onPress={handleSave}
        disabled={!canSubmit}
        style={[styles.saveButton, !canSubmit && styles.buttonDisabled]}
      >
        <ThemedText type="smallBold" style={styles.saveButtonText}>
          Save Request
        </ThemedText>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  title: { fontSize: 20, color: "#1a1c20" },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { color: "#8b8f99", marginTop: Spacing.two },
  textInput: {
    backgroundColor: "#f4f4fa",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    height: 46,
    fontSize: 14,
    color: "#1a1c20",
    marginTop: Spacing.one,
  },
  saveButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.three,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 15 },
  charCount: {
    color: "#8b8f99",
    textAlign: "right",
    marginTop: Spacing.half,
  },
});
