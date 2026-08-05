import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, shadows } from "../lib/theme";

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Renders the confirm button in red — for deletes and sign-out. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Styled replacement for Alert.alert confirmations.
 *
 * The native alert ignores the app's theme entirely, so destructive actions
 * looked like an OS dialog dropped into an otherwise designed app.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallow taps on the card so only the backdrop dismisses. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.cancelBtn]} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, destructive ? styles.dangerBtn : styles.confirmBtn]}
              onPress={onConfirm}
              disabled={busy}
            >
              <Text style={styles.confirmText}>{busy ? "…" : confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  message: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: colors.secondary },
  confirmBtn: { backgroundColor: colors.primary },
  dangerBtn: { backgroundColor: colors.danger },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.text },
  confirmText: { fontSize: 14, fontWeight: "700", color: colors.onPrimary },
});
