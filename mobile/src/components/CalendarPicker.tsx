import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../lib/theme";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Zero-pad a date part for ISO output. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO day key (yyyy-mm-dd) for a Date. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Minimal calendar: tap a day to select it. Used for the discount expiry
 * date in the sell form, so the user picks a date instead of typing one.
 */
export function CalendarPicker({
  value,
  onChange,
  minDate,
}: {
  /** ISO date string (yyyy-mm-dd or full ISO timestamp). */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Earliest selectable day (defaults to today). */
  minDate?: Date;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const min = minDate ?? today;

  const selected = value ? new Date(value) : null;
  const [view, setView] = useState(() => {
    const base = selected ?? min;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const firstDay = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  // 0 = Sunday … 6 = Saturday; grid starts on Monday.
  const lead = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={17} color={colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={17} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <Text key={d} style={styles.weekLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day == null) return <View key={`e${i}`} style={styles.cell} />;
          const date = new Date(view.getFullYear(), view.getMonth(), day);
          const iso = dayKey(date);
          const isSelected = selected ? dayKey(selected) === iso : false;
          const disabled = date.getTime() < min.getTime();
          return (
            <Pressable
              key={iso}
              style={[styles.cell, isSelected && styles.cellActive]}
              disabled={disabled}
              onPress={() => {
                const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
                onChange(end.toISOString());
              }}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected && styles.dayTextActive,
                  disabled && styles.dayTextDisabled,
                ]}
              >
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <Pressable
          style={styles.clearRow}
          onPress={() => onChange(null)}
          hitSlop={8}
        >
          <Text style={styles.clearText}>✕ {selected.toLocaleDateString()}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  weekRow: { flexDirection: "row" },
  weekLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 10.5,
    color: colors.textSoft,
    fontWeight: "600",
    marginBottom: 6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  dayText: { fontSize: 12.5, color: colors.text },
  dayTextActive: { color: colors.onPrimary, fontWeight: "700" },
  dayTextDisabled: { color: colors.textSoft, opacity: 0.45 },
  clearRow: { alignItems: "center", marginTop: 8 },
  clearText: { fontSize: 12.5, color: colors.primary, fontWeight: "600" },
});
