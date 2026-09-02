import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import type { DocumentRow } from "@/types/documents";

type DocumentActionsMenuProps = {
  visible: boolean;
  document: DocumentRow | null;
  folders: { id: string; name: string }[];
  onClose: () => void;
  onRenamed: () => void;
  onMoved: () => void;
  onDeleteRequested: (doc: DocumentRow) => void;
};

type Mode = "menu" | "rename" | "move";

export function DocumentActionsMenu({
  visible,
  document,
  folders,
  onClose,
  onRenamed,
  onMoved,
  onDeleteRequested,
}: DocumentActionsMenuProps) {
  const [mode, setMode] = useState<Mode>("menu");
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset back to the main menu, and seed the rename field, every time a
  // different document is opened.
  useEffect(() => {
    if (document) {
      setMode("menu");
      setNewName(document.name);
      setIsSaving(false);
    }
  }, [document]);

  function handleClose() {
    if (isSaving) return;
    onClose();
  }

  async function handleRenameSave() {
    if (!document || !newName.trim()) return;
    setIsSaving(true);

    const { data, error } = await supabase
      .from("documents")
      .update({ name: newName.trim() })
      .eq("id", document.id)
      .select();

    setIsSaving(false);

    if (error) {
      Alert.alert("Couldn't rename document", error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert(
        "Couldn't rename document",
        "The document wasn't updated — this usually means the update was blocked by a database permission (RLS) rule.",
      );
      return;
    }

    onRenamed();
    onClose();
  }

  async function handleMoveTo(folderId: string) {
    if (!document || folderId === document.folder_id) return;
    setIsSaving(true);

    const { data, error } = await supabase
      .from("documents")
      .update({ folder_id: folderId })
      .eq("id", document.id)
      .select();

    setIsSaving(false);

    if (error) {
      Alert.alert("Couldn't move document", error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert(
        "Couldn't move document",
        "The document wasn't moved — this usually means the update was blocked by a database permission (RLS) rule.",
      );
      return;
    }

    onMoved();
    onClose();
  }

  if (!document) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      {/* Tapping the backdrop closes the sheet. The inner Pressable below
          has its own no-op onPress, which claims the touch responder for
          taps inside the sheet so they don't bubble up and also trigger
          this close. */}
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable onPress={() => {}}>
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.grabber} />

            {mode === "menu" && (
              <>
                <View style={styles.menuHeaderRow}>
                  <ThemedText
                    type="smallBold"
                    style={styles.docName}
                    numberOfLines={1}
                  >
                    {document.name}
                  </ThemedText>
                  <Pressable
                    onPress={handleClose}
                    style={styles.closeButton}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color="#60646C" />
                  </Pressable>
                </View>

                <Pressable
                  style={styles.actionRow}
                  onPress={() => setMode("rename")}
                >
                  <Ionicons name="pencil-outline" size={18} color="#1a1c20" />
                  <ThemedText type="small" style={styles.actionLabel}>
                    Rename
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={styles.actionRow}
                  onPress={() => setMode("move")}
                >
                  <Ionicons name="folder-outline" size={18} color="#1a1c20" />
                  <ThemedText type="small" style={styles.actionLabel}>
                    Move
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onDeleteRequested(document);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <ThemedText
                    type="small"
                    style={styles.actionLabelDestructive}
                  >
                    Delete
                  </ThemedText>
                </Pressable>
              </>
            )}

            {mode === "rename" && (
              <>
                <View style={styles.headerRow}>
                  <Pressable hitSlop={8} onPress={() => setMode("menu")}>
                    <Ionicons name="chevron-back" size={20} color="#1a1c20" />
                  </Pressable>
                  <ThemedText type="smallBold" style={styles.headerTitle}>
                    Rename
                  </ThemedText>
                  <View style={styles.headerSpacer} />
                  <Pressable
                    onPress={handleClose}
                    style={styles.closeButton}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color="#60646C" />
                  </Pressable>
                </View>

                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Document name"
                  placeholderTextColor="#8b8f99"
                  style={styles.textInput}
                  autoFocus
                />

                <Pressable
                  onPress={handleRenameSave}
                  disabled={!newName.trim() || isSaving}
                  style={[
                    styles.saveButton,
                    (!newName.trim() || isSaving) && styles.buttonDisabled,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.saveButtonText}>
                      Save
                    </ThemedText>
                  )}
                </Pressable>
              </>
            )}

            {mode === "move" && (
              <>
                <View style={styles.headerRow}>
                  <Pressable hitSlop={8} onPress={() => setMode("menu")}>
                    <Ionicons name="chevron-back" size={20} color="#1a1c20" />
                  </Pressable>
                  <ThemedText type="smallBold" style={styles.headerTitle}>
                    Move to...
                  </ThemedText>
                  <View style={styles.headerSpacer} />
                  <Pressable
                    onPress={handleClose}
                    style={styles.closeButton}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color="#60646C" />
                  </Pressable>
                </View>

                {folders.map((folder) => {
                  const isCurrent = folder.id === document.folder_id;
                  return (
                    <Pressable
                      key={folder.id}
                      style={[
                        styles.actionRow,
                        isCurrent && styles.actionRowDisabled,
                      ]}
                      onPress={() => handleMoveTo(folder.id)}
                      disabled={isCurrent || isSaving}
                    >
                      <Ionicons
                        name="folder-outline"
                        size={18}
                        color="#1a1c20"
                      />
                      <ThemedText type="small" style={styles.actionLabel}>
                        {folder.name}
                      </ThemedText>
                      {isCurrent && (
                        <ThemedText type="small" style={styles.currentTag}>
                          Current
                        </ThemedText>
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
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
    gap: Spacing.one,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e4e5e9",
    alignSelf: "center",
    marginBottom: Spacing.two,
  },
  menuHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  docName: { color: "#8b8f99", flex: 1, marginRight: Spacing.three },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  headerTitle: { color: "#1a1c20", fontSize: 16 },
  headerSpacer: { flex: 1 },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f0f0f3",
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceef1",
  },
  actionRowDisabled: { opacity: 0.4 },
  actionLabel: { color: "#1a1c20", flex: 1 },
  actionLabelDestructive: { color: "#ef4444", flex: 1 },
  currentTag: { color: "#8b8f99" },
  textInput: {
    backgroundColor: "#f4f4fa",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    height: 46,
    fontSize: 14,
    color: "#1a1c20",
    marginBottom: Spacing.three,
  },
  saveButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 15 },
});
