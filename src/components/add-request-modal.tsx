import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

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
  const [documentType, setDocumentType] = useState("");
  const [office, setOffice] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function reset() {
    setDocumentType("");
    setOffice("");
    setNotes("");
    setIsSaving(false);
  }

  function handleClose() {
    if (isSaving) return;
    reset();
    onClose();
  }

  async function handleSave() {
    if (!documentType.trim() || !userId) return;
    setIsSaving(true);

    const { error } = await supabase.from("document_requests").insert({
      user_id: userId,
      document_type: documentType.trim(),
      office: office.trim() || null,
      notes: notes.trim() || null,
    });

    setIsSaving(false);

    if (error) {
      Alert.alert("Couldn't save request", error.message);
      return;
    }

    reset();
    onCreated();
    onClose();
  }

  const canSubmit = documentType.trim().length > 0 && !isSaving;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.title}>
              Log a Request
            </ThemedText>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={8}
            >
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
          />

          <ThemedText type="small" style={styles.fieldLabel}>
            Office (optional)
          </ThemedText>
          <TextInput
            value={office}
            onChangeText={setOffice}
            placeholder="e.g. Registrar's Office"
            placeholderTextColor="#8b8f99"
            style={styles.textInput}
          />

          <ThemedText type="small" style={styles.fieldLabel}>
            Notes (optional)
          </ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Need 3 copies for scholarship application"
            placeholderTextColor="#8b8f99"
            style={[styles.textInput, styles.textArea]}
            multiline
          />

          <Pressable
            onPress={handleSave}
            disabled={!canSubmit}
            style={[styles.saveButton, !canSubmit && styles.buttonDisabled]}
          >
            <ThemedText type="smallBold" style={styles.saveButtonText}>
              {isSaving ? "Saving..." : "Save Request"}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e4e5e9",
    alignSelf: "center",
    marginBottom: Spacing.two,
  },
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
  textArea: { height: 80, paddingTop: Spacing.two, textAlignVertical: "top" },
  saveButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.three,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 15 },
});
