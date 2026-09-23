import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
// Caps how many category dots a single day shows, so a day with many
// reminders doesn't blow out the cell height - the day is still tappable
// to see the full list below the grid.
const MAX_DOTS_PER_DAY = 3;
const CELL_SIZE = 40;

type MonthCalendarProps = {
  // Any date within the month to display - only year/month are read.
  month: Date;
  // due date (YYYY-MM-DD) -> one color per reminder category present that
  // day, in reminder order. Callers build this from CATEGORY_STYLE so dots
  // match the colors already used on the list cards.
  markersByDate: Map<string, string[]>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onChangeMonth: (direction: 1 | -1) => void;
};

function toDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function MonthCalendar({
  month,
  markersByDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
}: MonthCalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startWeekday = new Date(year, monthIndex, 1).getDay(); // 0 = Sunday

  const today = new Date();
  const todayKey = toDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to a full number of weeks so the grid's height doesn't jump when
  // navigating between months with different day/weekday counts.
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <View style={styles.container}>
      <View style={styles.monthHeader}>
        <Pressable
          hitSlop={8}
          onPress={() => onChangeMonth(-1)}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color="#1a1c20" />
        </Pressable>
        <ThemedText type="smallBold" style={styles.monthLabel}>
          {monthLabel}
        </ThemedText>
        <Pressable
          hitSlop={8}
          onPress={() => onChangeMonth(1)}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color="#1a1c20" />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <ThemedText
            key={`weekday-${i}`}
            type="small"
            style={styles.weekdayLabel}
          >
            {label}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`empty-${i}`} style={styles.dayCell} />;
          }

          const dateKey = toDateKey(year, monthIndex, day);
          const colors = markersByDate.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          const isSelected = selectedDate === dateKey;

          return (
            <Pressable
              key={dateKey}
              style={[styles.dayCell, isSelected && styles.dayCellSelected]}
              onPress={() => onSelectDate(dateKey)}
            >
              <ThemedText
                type="small"
                style={[
                  styles.dayNumber,
                  isToday && styles.dayNumberToday,
                  isSelected && styles.dayNumberSelected,
                ]}
              >
                {day}
              </ThemedText>
              {colors.length > 0 && (
                <View style={styles.dotRow}>
                  {colors.slice(0, MAX_DOTS_PER_DAY).map((color, dotIndex) => (
                    <View
                      key={`${dateKey}-dot-${dotIndex}`}
                      style={[styles.dot, { backgroundColor: color }]}
                    />
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.one,
  },
  monthLabel: { color: "#1a1c20" },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: "center",
    color: "#8b8f99",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE + 12,
    alignItems: "center",
    paddingTop: 4,
    gap: 3,
    borderRadius: Spacing.two,
  },
  dayCellSelected: { backgroundColor: "#e0f5f1" },
  dayNumber: { color: "#1a1c20" },
  dayNumberToday: { color: "#0d9488", fontWeight: "700" },
  dayNumberSelected: { color: "#0d9488", fontWeight: "700" },
  dotRow: { flexDirection: "row", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
