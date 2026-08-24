import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLang } from "../lib/lang";
import { colors, radius } from "../lib/theme";

/**
 * Compact EN / አማ segmented switch for the home header, beside the bell.
 * The language choice used to live only in profile settings, which meant a
 * first-time Amharic reader had to navigate an English UI to find it.
 *
 * The Amharic segment is labelled "አማ" rather than "አማርኛ": Ethiopic glyphs are
 * noticeably wider than Latin ones at the same size, and the full word pushed
 * the control past the width the header row can spare next to the bell.
 */
export function LanguageToggle() {
  const { lang, setLang } = useLang();

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.seg, lang === "en" && styles.segActive]}
        onPress={() => setLang("en")}
        accessibilityRole="button"
        accessibilityState={{ selected: lang === "en" }}
        accessibilityLabel="English"
        hitSlop={4}
      >
        <Text style={[styles.segText, lang === "en" && styles.segTextActive]}>EN</Text>
      </Pressable>
      <Pressable
        style={[styles.seg, lang === "am" && styles.segActive]}
        onPress={() => setLang("am")}
        accessibilityRole="button"
        accessibilityState={{ selected: lang === "am" }}
        accessibilityLabel="አማርኛ"
        hitSlop={4}
      >
        <Text style={[styles.segText, lang === "am" && styles.segTextActive]}>አማ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  seg: {
    minWidth: 38,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segActive: { backgroundColor: colors.primaryLight },
  segText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  segTextActive: { color: colors.primary },
});
