import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Unsent text kept on the device so a half-written message or offer survives
 * leaving the screen or the app being swapped out (item 42) — the mobile half
 * of web/src/lib/drafts.ts.
 *
 * Storage is async here, so the first render has no draft yet and the value
 * arrives a tick later. Anything the user types before it lands wins: a draft
 * must never overwrite live input.
 */
const PREFIX = "addishome:draft:";

export async function readDraft(key: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(PREFIX + key)) ?? "";
  } catch {
    return "";
  }
}

export async function writeDraft(key: string, value: string): Promise<void> {
  try {
    if (value.trim()) await AsyncStorage.setItem(PREFIX + key, value);
    else await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    /* a lost draft is not worth an error toast */
  }
}

/** `useState` that persists, keyed per conversation / listing. */
export function useDraft(key: string): [string, (v: string) => void, () => void] {
  const [value, setValue] = useState("");
  const latest = useRef("");
  const typed = useRef(false);
  const activeKey = useRef(key);

  useEffect(() => {
    let alive = true;
    // Flush the outgoing key before adopting the new one.
    if (activeKey.current !== key) {
      void writeDraft(activeKey.current, latest.current);
      activeKey.current = key;
      latest.current = "";
      typed.current = false;
      setValue("");
    }
    void readDraft(key).then((stored) => {
      if (!alive || typed.current || !stored) return;
      latest.current = stored;
      setValue(stored);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  useEffect(() => {
    const id = setTimeout(() => void writeDraft(activeKey.current, latest.current), 500);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(
    () => () => {
      void writeDraft(activeKey.current, latest.current);
    },
    [],
  );

  const update = useCallback((v: string) => {
    typed.current = true;
    latest.current = v;
    setValue(v);
  }, []);

  const clear = useCallback(() => {
    latest.current = "";
    setValue("");
    void writeDraft(activeKey.current, "");
  }, []);

  return [value, update, clear];
}
