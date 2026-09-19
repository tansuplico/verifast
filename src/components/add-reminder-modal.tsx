import DateTimePicker from "@expo/ui/community/datetime-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { BottomSheet } from "@/components/bottom-sheet";
import { ThemedText } from "@/components/themed-text";
import {
  CATEGORY_STYLE,
  type ReminderCategory,
} from "@/constants/reminder-categories";
import { Spacing } from "@/constants/theme";
import { removeReminderEvent, upsertReminderEvent } from "@/lib/calendar-sync";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/providers/toast-provider";

export type EditableReminder = {
  id: string;
  title: string;
  category: ReminderCategory;
  dueDate: string;
  calendarEventId: string | null;
};

const TITLE_MAX_LENGTH = 60;

type AddReminderModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  onSaved: () => void;
  editingReminder: EditableReminder | null;
  // Whether the user has Calendar Sync turned on (Deadlines & Reminders
  // settings list). When true, saving/deleting a reminder here also
  // creates/updates/removes its matching device calendar event.
  calendarSyncEnabled: boolean;
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
  onSaved,
  editingReminder,
  calendarSyncEnabled,
}: AddReminderModalProps) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("document");
  const [dueDate, setDueDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync local fields whenever a different reminder is opened for
  // editing (or the modal is opened fresh to add a new one) - same pattern
  // as AddAcademicInfoModal.
  useEffect(() => {
    if (!visible) return;
    setTitle(editingReminder?.title ?? "");
    setCategory(editingReminder?.category ?? "document");
    setDueDate(
      editingReminder
        ? new Date(`${editingReminder.dueDate}T00:00:00`)
        : new Date(),
    );
    setShowPicker(false);
  }, [visible, editingReminder]);

  function handleClose() {
    if (isSaving) return;
    onClose();
  }

  async function handleSave() {
    if (!title.trim() || !userId) return;
    setIsSaving(true);

    const trimmedTitle = title.trim();
    const dueDateForDb = formatDateForDb(dueDate);

    // `type` isn't shown anywhere in this screen's UI - it's a leftover
    // required column from before Document/Checklist/Payment categories
    // existed, and only affects the icon/color on Home's older "Document
    // Alerts" preview cards. Defaulting to "submission" on create matches
    // the fallback Home already uses for any unrecognized type, and edits
    // deliberately leave the column untouched (no picker exists for it) -
    // worth a proper type picker (or dropping the column) later if that
    // Home styling matters.
    const { data: savedRow, error } = editingReminder
      ? await supabase
          .from("reminders")
          .update({
            title: trimmedTitle,
            category,
            due_date: dueDateForDb,
          })
          .eq("id", editingReminder.id)
          .select("id")
          .single()
      : await supabase
          .from("reminders")
          .insert({
            user_id: userId,
            title: trimmedTitle,
            category,
            type: "submission",
            due_date: dueDateForDb,
          })
          .select("id")
          .single();

    if (error || !savedRow) {
      setIsSaving(false);
      Alert.alert("Couldn't save reminder", error?.message ?? "Unknown error");
      return;
    }

    // Calendar sync is best-effort: a failure here (permission revoked on
    // the device, the OS calendar app being unavailable, etc.) shouldn't
    // block the reminder itself from saving, since the reminder is already
    // safely in the database at this point. It's surfaced via a toast
    // rather than an Alert - it's a "heads up" the user can dismiss and
    // keep going, not something that needs a blocking decision.
    let calendarSyncFailed = false;

    if (calendarSyncEnabled) {
      try {
        const newCalendarEventId = await upsertReminderEvent(
          {
            title: trimmedTitle,
            dueDate: dueDateForDb,
            categoryLabel: CATEGORY_STYLE[category].label,
          },
          editingReminder?.calendarEventId,
        );

        if (newCalendarEventId !== editingReminder?.calendarEventId) {
          await supabase
            .from("reminders")
            .update({ calendar_event_id: newCalendarEventId })
            .eq("id", savedRow.id);
        }
      } catch (calendarError) {
        calendarSyncFailed = true;
        console.error("Failed to sync reminder to calendar", calendarError);
      }
    }

    setIsSaving(false);
    onSaved();
    onClose();

    // BottomSheet keeps its underlying <Modal> mounted for 220ms after
    // onClose() to run its own close animation (see bottom-sheet.tsx) - a
    // toast fired before that finishes renders in a separate layer behind
    // the still-visible modal. This delay (with a small buffer) makes sure
    // the sheet is actually gone before the toast appears, per the
    // constraint documented in toast-provider.tsx.
    setTimeout(() => {
      showToast(
        calendarSyncFailed
          ? `${editingReminder ? "Reminder updated" : "Reminder saved"}, but couldn't sync to calendar`
          : editingReminder
            ? "Reminder updated"
            : "Reminder saved",
      );
    }, 260);
  }

  function handleDelete() {
    if (!editingReminder) return;
    Alert.alert(
      "Delete reminder",
      `Are you sure you want to delete "${editingReminder.title}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsSaving(true);
            const { error } = await supabase
              .from("reminders")
              .delete()
              .eq("id", editingReminder.id);

            if (error) {
              setIsSaving(false);
              Alert.alert("Couldn't delete reminder", error.message);
              return;
            }

            // Clean up the device event whenever one exists, regardless of
            // whether Calendar Sync is currently toggled on - it may have
            // been synced earlier and then sync turned off since, and an
            // orphaned event left behind on the device would be confusing.
            if (editingReminder.calendarEventId) {
              await removeReminderEvent(editingReminder.calendarEventId);
            }

            setIsSaving(false);
            onSaved();
            onClose();
          },
        },
      ],
    );
  }

  const canSubmit = title.trim().length > 0 && !isSaving;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.title}>
            {editingReminder ? "Edit Reminder" : "Add Reminder"}
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
          Due Date
        </ThemedText>
        <Pressable onPress={() => setShowPicker(true)} style={styles.dateInput}>
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

        {editingReminder && (
          <Pressable
            onPress={handleDelete}
            disabled={isSaving}
            style={styles.deleteButton}
          >
            <ThemedText type="smallBold" style={styles.deleteButtonText}>
              Delete Reminder
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
