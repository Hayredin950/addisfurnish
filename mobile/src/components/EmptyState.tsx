import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export function EmptyState({
  icon = "🛋️",
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 44,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
});
