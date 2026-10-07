import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { BottomSheet } from "@/components/bottom-sheet";
import { ThemedText } from "@/components/themed-text";
import {
  CATEGORY_STYLE,
  type AcademicInfoCategory,
} from "@/constants/academic-info-categories";
import { Spacing } from "@/constants/theme";
import {
  deleteAcademicInfoLocal,
  saveAcademicInfoLocal,
} from "@/lib/offline-db";
import { requestSync } from "@/lib/sync";
import { showAlert } from "@/providers/alert-provider";
import { useToast } from "@/providers/toast-provider";

const TITLE_MAX_LENGTH = 60;
const NOTES_MAX_LENGTH = 100;

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
  const { showSavedToast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<AcademicInfoCategory>("curriculum");
  const [isPinned, setIsPinned] = useState(false);
  // Saving is a local write now (instant, no network wait), so there is no
  // "Saving..." state to show - this only guards against a fast double-tap
  // firing the handler twice before the modal has finished closing.
  const hasSubmittedRef = useRef(false);

  // Re-sync local fields whenever a different item is opened for editing
  // (or the modal is opened fresh to add a new one).
  useEffect(() => {
    if (!visible) return;
    hasSubmittedRef.current = false;
    setTitle(editingItem?.title ?? "");
    setContent(editingItem?.content ?? "");
    setCategory(editingItem?.category ?? "curriculum");
    setIsPinned(editingItem?.is_pinned ?? false);
  }, [visible, editingItem]);

  function handleClose() {
    onClose();
  }

  function handleSave() {
    if (!title.trim() || !userId || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    // Written to the device first, so it works with or without a
    // connection; requestSync pushes it to Supabase right away when online
    // (and sync picks it up on reconnect otherwise).
    try {
      saveAcademicInfoLocal(userId, {
        id: editingItem?.id,
        title: title.trim(),
        content: content.trim() || null,
        category,
        is_pinned: isPinned,
      });
    } catch (error) {
      hasSubmittedRef.current = false;
      console.error("Failed to save academic info locally", error);
      showAlert(
        "Couldn't save",
        "Something went wrong saving this entry.",
        undefined,
        { tone: "danger" },
      );
      return;
    }

    showSavedToast(editingItem ? "Entry updated" : "Entry saved");
    requestSync(userId);
    onSaved();
    onClose();
  }

  function handleDelete() {
    if (!editingItem || !userId) return;
    showAlert(
      "Delete entry",
      `Are you sure you want to delete "${editingItem.title}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (hasSubmittedRef.current) return;
            hasSubmittedRef.current = true;

            try {
              deleteAcademicInfoLocal(userId, editingItem.id);
            } catch (error) {
              hasSubmittedRef.current = false;
              console.error("Failed to delete academic info locally", error);
              showAlert(
                "Couldn't delete entry",
                "Something went wrong deleting this entry.",
                undefined,
                { tone: "danger" },
              );
              return;
            }

            showSavedToast("Entry deleted");
            requestSync(userId);
            onSaved();
            onClose();
          },
        },
      ],
    );
  }

  const canSubmit = title.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <KeyboardAvoidingView behavior="padding">
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
          maxLength={TITLE_MAX_LENGTH}
        />
        <ThemedText type="small" style={styles.charCount}>
          {title.length}/{TITLE_MAX_LENGTH}
        </ThemedText>

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
          maxLength={NOTES_MAX_LENGTH}
        />
        <ThemedText type="small" style={styles.charCount}>
          {content.length}/{NOTES_MAX_LENGTH}
        </ThemedText>

        <Pressable onPress={() => setIsPinned((v) => !v)} style={styles.pinRow}>
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
            Save
          </ThemedText>
        </Pressable>

        {editingItem && (
          <Pressable onPress={handleDelete} style={styles.deleteButton}>
            <ThemedText type="smallBold" style={styles.deleteButtonText}>
              Delete Entry
            </ThemedText>
          </Pressable>
        )}
      </KeyboardAvoidingView>
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
  charCount: {
    color: "#8b8f99",
    textAlign: "right",
    marginTop: Spacing.half,
  },
});
