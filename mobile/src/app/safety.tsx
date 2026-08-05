import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLang } from "../lib/lang";
import { colors, radius, spacing, shadows } from "../lib/theme";

export default function SafetyScreen() {
  const { t } = useLang();

  const RULES = [
    { icon: "location-outline" as const, title: t("safetyMeetTitle"), body: t("safetyMeetBody") },
    { icon: "eye-outline" as const, title: t("safetyInspectTitle"), body: t("safetyInspectBody") },
    { icon: "cash-outline" as const, title: t("safetyPayTitle"), body: t("safetyPayBody") },
    { icon: "chatbubble-ellipses-outline" as const, title: t("safetyPlatformTitle"), body: t("safetyPlatformBody") },
    { icon: "shield-checkmark-outline" as const, title: t("safetyCheckTitle"), body: t("safetyCheckBody") },
    { icon: "alert-circle-outline" as const, title: t("safetyReportTitle"), body: t("safetyReportBody") },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
    >
      <Text style={styles.title}>{t("safetyTitle")}</Text>
      <Text style={styles.subtitle}>{t("safetySubtitle")}</Text>

      {RULES.map((rule) => (
        <View key={rule.title} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={rule.icon} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleTitle}>{rule.title}</Text>
            <Text style={styles.ruleBody}>{rule.body}</Text>
          </View>
        </View>
      ))}

      <View style={styles.note}>
        <Text style={styles.noteText}>{t("safetySellerNote")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    fontFamily: "Georgia, serif",
    marginTop: spacing.md,
  },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginTop: 6 },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadows.card,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  ruleTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  ruleBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: 4 },
  note: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  noteText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
});
