import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

/**
 * Bottom-sheet backdrop for the app's modals.
 *
 * These sheets sit against the bottom of the screen, so an open keyboard used
 * to cover them completely — input and submit button included, with no way to
 * see what you were typing.
 *
 * `behavior` is set on BOTH platforms deliberately. Android's `adjustResize`
 * would normally shrink the window and lift the sheet on its own, but these are
 * `transparent` <Modal>s, and a transparent modal renders in a separate window
 * that adjustResize does not resize — so without an explicit behavior here the
 * sheet stays exactly where it is and the keyboard still hides it. "height"
 * suits Android (it shrinks the container), "padding" suits iOS.
 */
export function SheetOverlay({
  children,
  onClose,
}: {
  children: ReactNode;
  /** When set, tapping the dimmed backdrop dismisses the sheet. */
  onClose?: () => void;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Dimmed backdrop — presses above the sheet dismiss it (the sheet is
          rendered on top, so taps inside it never reach this). */}
      {onClose ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      ) : null}
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
});
