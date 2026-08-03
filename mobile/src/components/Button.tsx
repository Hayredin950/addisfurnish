import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle, TextStyle } from "react-native";
import { colors, radius } from "../lib/theme";

type Variant = "primary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  style,
  textStyle,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const palettes: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    outline: { bg: "transparent", fg: colors.primary, border: colors.borderStrong },
    ghost: { bg: "transparent", fg: colors.textMuted },
    danger: { bg: colors.danger, fg: "#fff" },
    success: { bg: colors.success, fg: "#fff" },
  };
  const sizes: Record<Size, { py: number; fs: number }> = {
    sm: { py: 8, fs: 13 },
    md: { py: 13, fs: 15 },
    lg: { py: 16, fs: 16 },
  };
  const pal = palettes[variant];
  const s = sizes[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pal.bg,
          borderColor: pal.border ?? pal.bg,
          paddingVertical: s.py,
        },
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[{ color: pal.fg, fontSize: s.fs, fontWeight: "600" }, textStyle]}>
        {loading ? "…" : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
});
