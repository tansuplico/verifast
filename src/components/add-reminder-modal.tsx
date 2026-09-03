import DateTimePicker from "@expo/ui/community/datetime-picker";
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
import {
  CATEGORY_STYLE,
  type ReminderCategory,
} from "@/constants/reminder-categories";
import { Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

type AddReminderModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  onCreated: () => void;
};

const CATEGORY_OPTIONS: ReminderCategory[] = [
  "document",
  "checklist",
  "payment",
];

function formatDateForDb(date: Date) {
  // Local calendar date, not date.toISOString() - the latter converts to
  // UTC first, which can silently shift the date by a day depending on the
  // user's timezone offset (due_date is a plain Postgres `date`, not a
  // timestamp, so there's no time component to preserve).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AddReminderModal({
  visible,
  onClose,
  userId,
  onCreated,
}: AddReminderModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("document");
  const [dueDate, setDueDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function reset() {
    setTitle("");
    setCategory("document");
    setDueDate(new Date());
    setShowPicker(false);
    setIsSaving(false);
  }

  function handleClose() {
    if (isSaving) return;
    reset();
    onClose();
  }

  async function handleSave() {
    if (!title.trim() || !userId) return;
    setIsSaving(true);

    // `type` isn't shown anywhere in this screen's UI - it's a leftover
    // required column from before Document/Checklist/Payment categories
    // existed, and only affects the icon/color on Home's older "Document
    // Alerts" preview cards. Defaulting to "submission" here matches the
    // fallback Home already uses for any unrecognized type, so this is a
    // deliberate simplification, not an oversight - worth a proper type
    // picker (or dropping the column) later if that Home styling matters.
    const { error } = await supabase.from("reminders").insert({
      user_id: userId,
      title: title.trim(),
      category,
      type: "submission",
      due_date: formatDateForDb(dueDate),
    });

    setIsSaving(false);

    if (error) {
      Alert.alert("Couldn't save reminder", error.message);
      return;
    }

    reset();
    onCreated();
    onClose();
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
              Add Reminder
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
            placeholder="e.g. Submit Good Moral Certificate"
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
            Due Date
          </ThemedText>
          <Pressable
            onPress={() => setShowPicker(true)}
            style={styles.dateInput}
          >
            <ThemedText type="default" style={styles.dateInputText}>
              {formatDateForDisplay(dueDate)}
            </ThemedText>
            <Ionicons name="calendar-outline" size={18} color="#8b8f99" />
          </Pressable>

          {/* iOS ignores `presentation` and always renders inline, so this
              only needs conditional mounting to give Android its dialog
              behavior; on iOS this expands the sheet in place when tapped. */}
          {showPicker && (
            <DateTimePicker
              value={dueDate}
              mode="date"
              minimumDate={new Date()}
              presentation="dialog"
              onValueChange={(_event, selectedDate) => {
                setShowPicker(false);
                if (selectedDate) setDueDate(selectedDate);
              }}
              onDismiss={() => setShowPicker(false)}
            />
          )}

          <Pressable
            onPress={handleSave}
            disabled={!canSubmit}
            style={[styles.saveButton, !canSubmit && styles.buttonDisabled]}
          >
            <ThemedText type="smallBold" style={styles.saveButtonText}>
              {isSaving ? "Saving..." : "Save Reminder"}
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
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f4f4fa",
    borderRadius: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    height: 46,
    marginTop: Spacing.one,
  },
  dateInputText: { color: "#1a1c20" },
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
