import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font } from "../lib/theme";

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    ...font.heading,
    fontSize: 18,
    color: colors.text,
  },
  action: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
});
