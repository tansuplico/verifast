import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
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
import {
  CATEGORY_STYLE,
  type AcademicInfoCategory,
} from "@/constants/academic-info-categories";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

export type AcademicInfoItem = {
  id: string;
  category: AcademicInfoCategory;
  title: string;
  content: string | null;
  is_pinned: boolean;
};

type AddAcademicInfoModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  onSaved: () => void;
  editingItem: AcademicInfoItem | null;
};

const CATEGORY_OPTIONS: AcademicInfoCategory[] = [
  "curriculum",
  "announcement",
  "activity",
];

export function AddAcademicInfoModal({
  visible,
  onClose,
  userId,
  onSaved,
  editingItem,
}: AddAcademicInfoModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<AcademicInfoCategory>("curriculum");
  const [isPinned, setIsPinned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync local fields whenever a different item is opened for editing
  // (or the modal is opened fresh to add a new one).
  useEffect(() => {
    if (!visible) return;
    setTitle(editingItem?.title ?? "");
    setContent(editingItem?.content ?? "");
    setCategory(editingItem?.category ?? "curriculum");
    setIsPinned(editingItem?.is_pinned ?? false);
  }, [visible, editingItem]);

  function handleClose() {
    if (isSaving) return;
    onClose();
  }

  async function handleSave() {
    if (!title.trim() || !userId) return;
    setIsSaving(true);

    const payload = {
      title: title.trim(),
      content: content.trim() || null,
      category,
      is_pinned: isPinned,
    };

    const { error } = editingItem
      ? await supabase
          .from("academic_info")
          .update(payload)
          .eq("id", editingItem.id)
      : await supabase.from("academic_info").insert({
          ...payload,
          user_id: userId,
        });

    setIsSaving(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }

    onSaved();
    onClose();
  }

  function handleDelete() {
    if (!editingItem) return;
    Alert.alert(
      "Delete entry",
      `Are you sure you want to delete "${editingItem.title}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsSaving(true);
            const { error } = await supabase
              .from("academic_info")
              .delete()
              .eq("id", editingItem.id);
            setIsSaving(false);

            if (error) {
              Alert.alert("Couldn't delete entry", error.message);
              return;
            }

            onSaved();
            onClose();
          },
        },
      ],
    );
  }

  const canSubmit = title.trim().length > 0 && !isSaving;

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
              {editingItem ? "Edit Entry" : "Add Academic Info"}
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
            Title
          </ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. New GE Elective Added"
            placeholderTextColor="#8b8f99"
            style={styles.textInput}
          />

          <ThemedText type="small" style={styles.fieldLabel}>
            Category
          </ThemedText>
          <View style={styles.chipRow}>
            {CATEGORY_OPTIONS.map((option) => {
              const style = CATEGORY_STYLE[option];
              const isSelected = category === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCategory(option)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected
                        ? style.color
                        : `${style.color}1A`,
                    },
                  ]}
                >
                  <Ionicons
                    name={style.icon}
                    size={13}
                    color={isSelected ? "#ffffff" : style.color}
                  />
                  <ThemedText
                    type="small"
                    style={[
                      styles.chipLabel,
                      { color: isSelected ? "#ffffff" : style.color },
                    ]}
                  >
                    {style.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="small" style={styles.fieldLabel}>
            Notes
          </ThemedText>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Add any details you want to remember"
            placeholderTextColor="#8b8f99"
            style={[styles.textInput, styles.multilineInput]}
            multiline
          />

          <Pressable
            onPress={() => setIsPinned((v) => !v)}
            style={styles.pinRow}
          >
            <Ionicons
              name={isPinned ? "bookmark" : "bookmark-outline"}
              size={18}
              color="#0d9488"
            />
            <ThemedText type="small" style={styles.pinLabel}>
              Pin to top
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={!canSubmit}
            style={[styles.saveButton, !canSubmit && styles.buttonDisabled]}
          >
            <ThemedText type="smallBold" style={styles.saveButtonText}>
              {isSaving ? "Saving..." : "Save"}
            </ThemedText>
          </Pressable>

          {editingItem && (
            <Pressable
              onPress={handleDelete}
              disabled={isSaving}
              style={styles.deleteButton}
            >
              <ThemedText type="smallBold" style={styles.deleteButtonText}>
                Delete Entry
              </ThemedText>
            </Pressable>
          )}
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
  multilineInput: {
    height: 90,
    paddingTop: Spacing.two,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
  },
  chipLabel: { fontWeight: "700" },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one + 2,
    marginTop: Spacing.three,
  },
  pinLabel: { color: "#1a1c20" },
  saveButton: {
    backgroundColor: "#0d9488",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.three,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 15 },
  deleteButton: {
    alignItems: "center",
    paddingVertical: Spacing.two,
  },
  deleteButtonText: { color: "#dc2626" },
});
