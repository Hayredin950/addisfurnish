import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadows } from "../lib/theme";
import { errorKey, logRawError } from "../lib/friendly-error";
import type { DictKey } from "../lib/i18n";
import { useLang } from "../lib/lang";

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; text: string };

type ToastApi = {
  success: (text: string) => void;
  /**
   * Show a failure. Pass the caught error itself plus a translated fallback.
   *
   * The raw message is deliberately NOT displayed. It is English-only,
   * describes the database's problem rather than the user's, and — the reason
   * that actually matters — leaks schema details: `duplicate key value
   * violates unique constraint "profiles_phone_key"` names the table, the
   * column and the constraint for anyone probing the API. `friendly-error.ts`
   * maps what it recognises onto a translated message; anything it doesn't
   * recognise falls back to the string the caller passed. The real error is
   * still logged in dev builds.
   */
  error: (err: unknown, fallback: string) => void;
};

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * The message to show for a failure: a translated one when the error is
 * recognised, otherwise whatever the call site passed. `errorKey` returns
 * `errGeneric` when it recognises nothing, and a caller's fallback ("Couldn't
 * send your message") is always more useful than "Something went wrong", so
 * the fallback wins that tie.
 */
export function errorMessage(
  err: unknown,
  fallback: string,
  t: (key: DictKey) => string,
): string {
  logRawError(err);
  const key = errorKey(err);
  if (key === "errGeneric" && fallback.trim()) return fallback;
  return t(key);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useLang();
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
      // Failures usually ask the reader to do something, so give them
      // longer on screen than a confirmation needs.
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
    error: (err, fallback) => show("error", errorMessage(err, fallback, t)),
  });
  api.current = {
    success: (text) => show("success", text),
    error: (err, fallback) => show("error", errorMessage(err, fallback, t)),
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
