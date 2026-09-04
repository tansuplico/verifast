import Ionicons from "@expo/vector-icons/Ionicons";

export type AcademicInfoCategory = "curriculum" | "announcement" | "activity";

export const CATEGORY_STYLE: Record<
  AcademicInfoCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  announcement: { icon: "megaphone", color: "#f59e0b", label: "Announcement" },
  activity: { icon: "calendar", color: "#10b981", label: "Activity" },
  curriculum: { icon: "book", color: "#7c5cfc", label: "Curriculum" },
};
