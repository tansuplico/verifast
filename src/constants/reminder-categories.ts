import Ionicons from "@expo/vector-icons/Ionicons";

export type ReminderCategory = "document" | "checklist" | "payment";

export const CATEGORY_STYLE: Record<
  ReminderCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  document: { icon: "document-outline", color: "#c2760c", label: "Document" },
  checklist: {
    icon: "checkmark-circle-outline",
    color: "#0d9488",
    label: "Checklist",
  },
  payment: { icon: "card-outline", color: "#dc2626", label: "Payment" },
};
