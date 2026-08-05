import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadows } from "../lib/theme";

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; text: string };

type ToastApi = {
  success: (text: string) => void;
  /**
   * Show a failure. Pass the caught error, not a generic string — the real
   * Postgres/network message is what tells you *why* a write failed. Web does
   * the same (web/src/routes/profile.tsx: "Show the real reason instead of a
   * generic failure").
   */
  error: (err: unknown, fallback: string) => void;
};

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/** Pulls a human-readable message out of whatever was thrown. */
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; error_description?: unknown; details?: unknown };
    for (const v of [e.message, e.error_description, e.details]) {
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return fallback;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const show = useCallback(
    (kind: ToastKind, text: string) => {
      if (timer.current) clearTimeout(timer.current);
      nextId.current += 1;
      setToast({ id: nextId.current, kind, text });
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      // Errors carry real diagnostic text, so leave them up longer to read.
      timer.current = setTimeout(
        () => {
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
            ({ finished }) => finished && setToast(null),
          );
        },
        kind === "error" ? 5000 : 2500,
      );
    },
    [opacity],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const api = useRef<ToastApi>({
    success: (text) => show("success", text),
    error: (err, fallback) => show("error", errorMessage(err, fallback)),
  });
  api.current = {
    success: (text) => show("success", text),
    error: (err, fallback) => show("error", errorMessage(err, fallback)),
  };

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            toast.kind === "error" ? styles.error : styles.success,
            { opacity },
          ]}
        >
          <Ionicons
            name={toast.kind === "error" ? "alert-circle" : "checkmark-circle"}
            size={18}
            color={toast.kind === "error" ? colors.danger : colors.success}
          />
          <Text style={styles.text}>{toast.text}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 90,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    backgroundColor: colors.card,
    ...shadows.card,
  },
  success: { borderColor: colors.success },
  error: { borderColor: colors.danger },
  text: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
});
