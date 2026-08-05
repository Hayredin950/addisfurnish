import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

/**
 * Bottom-sheet backdrop for the app's modals.
 *
 * These sheets sit at the bottom of the screen, so an open keyboard used to
 * cover them completely — inputs and submit buttons included, with no way to
 * see what you were typing. KeyboardAvoidingView lifts the sheet instead.
 *
 * Android resizes the window itself when `windowSoftInputMode` is `adjustResize`
 * (Expo's default), so passing a behavior there would double-shift the sheet;
 * iOS needs the explicit padding. Same split as chat/[id].tsx and auth.tsx.
 */
export function SheetOverlay({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
});
